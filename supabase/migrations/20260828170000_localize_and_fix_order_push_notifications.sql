-- Localize order push notifications and fix 0 amount formatting
-- 1. Helper function for localized status translation
CREATE OR REPLACE FUNCTION public.format_localized_order_status(
  p_fulfillment_status text,
  p_status text,
  p_payment_status text
) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp
AS $$
DECLARE
  v_fs text := upper(trim(COALESCE(p_fulfillment_status, '')));
  v_st text := lower(trim(COALESCE(p_status, '')));
  v_ps text := lower(trim(COALESCE(p_payment_status, '')));
BEGIN
  IF v_fs = 'OUT_FOR_DELIVERY' THEN RETURN 'خرج للتوصيل';
  ELSIF v_fs = 'READY_FOR_PICKUP' OR v_st = 'ready_for_pickup' THEN RETURN 'جاهز للاستلام';
  ELSIF v_fs = 'READY_FOR_DELIVERY' THEN RETURN 'جاهز للتوصيل';
  ELSIF v_fs = 'ASSIGNED' THEN RETURN 'تم التعيين للمندوب';
  ELSIF v_fs = 'SHIPPED' OR v_st = 'shipped' THEN RETURN 'تم الشحن';
  ELSIF v_fs = 'DELIVERED' OR v_st = 'delivered' THEN RETURN 'تم التوصيل';
  ELSIF v_fs = 'COMPLETED' OR v_st = 'completed' OR v_fs = 'PICKED_UP' THEN RETURN 'مكتمل';
  ELSIF v_fs IN ('PROCESSING', 'PREPARING', 'PACKING', 'NEEDS_PACKING') OR v_st IN ('packing', 'needs_packing') THEN RETURN 'قيد التجهيز والتغليف';
  ELSIF v_fs = 'SENT_TO_TAILOR' OR v_st = 'sent_to_tailor' THEN RETURN 'تم الإرسال للخياط';
  ELSIF v_fs = 'RECEIVED_FROM_TAILOR' OR v_st = 'received_from_tailor' THEN RETURN 'تم الاستلام من الخياط';
  ELSIF v_st IN ('cancelled', 'canceled') THEN RETURN 'ملغي';
  ELSIF v_fs = 'RETURNED' OR v_st = 'returned' THEN RETURN 'مرتجع';
  ELSIF v_fs = 'FAILED' OR v_st = 'failed' THEN RETURN 'تعذر التوصيل';
  ELSIF v_st = 'confirmed' THEN RETURN 'مؤكد';
  ELSIF v_ps = 'refunded' THEN RETURN 'مسترجع';
  ELSIF v_ps = 'paid' OR v_st = 'paid' THEN RETURN 'مدفوع بالكامل';
  ELSIF v_ps = 'partially_paid' OR v_st = 'partially_paid' THEN RETURN 'مدفوع جزئياً';
  ELSIF v_ps = 'pending_verification' OR v_st = 'pending_verification' THEN RETURN 'بانتظار التحقق من الدفع';
  ELSIF v_st = 'pending' OR v_fs = 'ON_HOLD' THEN RETURN 'قيد الانتظار';
  ELSIF v_st = 'draft' THEN RETURN 'مسودة';
  ELSE RETURN COALESCE(NULLIF(p_fulfillment_status, ''), NULLIF(p_status, ''), 'تم التحديث');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.format_localized_order_status(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.format_localized_order_status(text, text, text) TO authenticated, service_role;

-- 2. Helper function to format currency amounts properly with 3 decimal digits for BHD
CREATE OR REPLACE FUNCTION public.format_currency_amount(
  p_amount numeric,
  p_currency text
) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp
AS $$
DECLARE
  v_curr text := upper(trim(COALESCE(p_currency, 'BHD')));
  v_num text;
BEGIN
  IF v_curr = 'BHD' THEN
    v_num := trim(to_char(COALESCE(p_amount, 0), 'FM999,999,990.000'));
    RETURN v_num || ' د.ب';
  ELSE
    v_num := trim(to_char(COALESCE(p_amount, 0), 'FM999,999,990.00'));
    RETURN v_num || ' ' || v_curr;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.format_currency_amount(numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.format_currency_amount(numeric, text) TO authenticated, service_role;

-- 3. Update enqueue_mobile_order_push with localization and auto-sync on total/snapshot updates
CREATE OR REPLACE FUNCTION public.enqueue_mobile_order_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_invoice text := COALESCE(NEW.invoice_number::text, '—');
  v_amount text := public.format_currency_amount(NEW.total, NEW.currency);
  v_customer_name text := COALESCE(NULLIF(NEW.customer_name_snapshot, ''), 'عميل المتجر');
  v_status_label text;
BEGIN
  v_status_label := public.format_localized_order_status(NEW.fulfillment_status, NEW.status, NEW.payment_status);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.push_notification_events (
      brand_id, event_type, entity_type, entity_id, dedupe_key, title, body, target_url, payload
    )
    VALUES (
      NEW.brand_id, 'order_new', 'order', NEW.id,
      'order-new:' || NEW.id,
      'طلب جديد #' || v_invoice,
      v_customer_name || ' — ' || v_amount,
      '/orders/' || NEW.id,
      jsonb_build_object('order_id', NEW.id, 'invoice_number', NEW.invoice_number, 'total', NEW.total, 'currency', NEW.currency, 'status', NEW.status)
    )
    ON CONFLICT (brand_id, dedupe_key) DO UPDATE SET
      body = EXCLUDED.body,
      payload = EXCLUDED.payload;
  ELSE
    -- If total was updated from 0 or customer name was populated, refresh the order_new event
    IF (OLD.total IS NOT DISTINCT FROM 0 AND NEW.total > 0) OR (OLD.customer_name_snapshot IS NULL AND NEW.customer_name_snapshot IS NOT NULL) THEN
      UPDATE public.push_notification_events
      SET body = v_customer_name || ' — ' || v_amount,
          payload = jsonb_build_object('order_id', NEW.id, 'invoice_number', NEW.invoice_number, 'total', NEW.total, 'currency', NEW.currency, 'status', NEW.status)
      WHERE brand_id = NEW.brand_id AND dedupe_key = 'order-new:' || NEW.id;
    END IF;

    -- On state transition, enqueue updated status event
    IF ROW(NEW.status, NEW.payment_status, NEW.fulfillment_status) IS DISTINCT FROM ROW(OLD.status, OLD.payment_status, OLD.fulfillment_status) THEN
      INSERT INTO public.push_notification_events (
        brand_id, event_type, entity_type, entity_id, dedupe_key, title, body, target_url, payload
      )
      VALUES (
        NEW.brand_id, 'order_updated', 'order', NEW.id,
        'order-state:' || NEW.id || ':' || COALESCE(NEW.status, '') || ':' || COALESCE(NEW.payment_status, '') || ':' || COALESCE(NEW.fulfillment_status, ''),
        'تحديث الطلب #' || v_invoice,
        'الحالة: ' || v_status_label || ' (' || v_amount || ')',
        '/orders/' || NEW.id,
        jsonb_build_object('order_id', NEW.id, 'invoice_number', NEW.invoice_number, 'status', NEW.status, 'fulfillment_status', NEW.fulfillment_status, 'payment_status', NEW.payment_status, 'total', NEW.total, 'currency', NEW.currency)
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_mobile_order_push ON public.orders;
CREATE TRIGGER enqueue_mobile_order_push
AFTER INSERT OR UPDATE OF status, payment_status, fulfillment_status, total, customer_name_snapshot, currency
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enqueue_mobile_order_push();

REVOKE ALL ON FUNCTION public.enqueue_mobile_order_push() FROM PUBLIC, anon, authenticated;

-- 4. Update enqueue_customer_order_push with localization and auto-sync on total updates
CREATE OR REPLACE FUNCTION public.enqueue_customer_order_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_invoice text := COALESCE(NEW.invoice_number::text, '—');
  v_amount text := public.format_currency_amount(NEW.total, NEW.currency);
  v_title text;
  v_body text;
  v_state text;
  v_status_label text;
BEGIN
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  v_status_label := public.format_localized_order_status(NEW.fulfillment_status, NEW.status, NEW.payment_status);

  IF TG_OP = 'INSERT' THEN
    v_title := 'استلمنا طلبك #' || v_invoice;
    v_body := 'شكراً لك على طلبك بمبلغ ' || v_amount || '. سنرسل لك التحديثات أولاً بأول.';
    v_state := 'created';
  ELSIF ROW(NEW.status, NEW.payment_status, NEW.fulfillment_status) IS NOT DISTINCT FROM ROW(OLD.status, OLD.payment_status, OLD.fulfillment_status) THEN
    IF OLD.total IS NOT DISTINCT FROM 0 AND NEW.total > 0 THEN
      UPDATE public.customer_push_events
      SET body = 'شكراً لك على طلبك بمبلغ ' || v_amount || '. سنرسل لك التحديثات أولاً بأول.',
          payload = jsonb_build_object('order_id', NEW.id, 'invoice_number', NEW.invoice_number, 'total', NEW.total, 'currency', NEW.currency)
      WHERE brand_id = NEW.brand_id AND dedupe_key = 'customer-order:' || NEW.id || ':created';
    END IF;
    RETURN NEW;
  ELSE
    v_state := upper(COALESCE(NULLIF(NEW.fulfillment_status, ''), NULLIF(NEW.status, ''), 'UPDATED')) || ':' || lower(COALESCE(NEW.payment_status, ''));
    CASE
      WHEN lower(COALESCE(NEW.status, '')) IN ('cancelled', 'canceled') THEN
        v_title := 'تم إلغاء الطلب #' || v_invoice;
        v_body := 'تم إلغاء طلبك بمبلغ ' || v_amount || '. إذا احتجت أي مساعدة، تواصل معنا.';
      WHEN lower(COALESCE(NEW.payment_status, '')) = 'refunded' THEN
        v_title := 'تم استرجاع مبلغ الطلب #' || v_invoice;
        v_body := 'تم تسجيل استرجاع مبلغ ' || v_amount || ' بنجاح.';
      WHEN upper(COALESCE(NEW.fulfillment_status, '')) = 'OUT_FOR_DELIVERY' THEN
        v_title := 'طلبك في الطريق #' || v_invoice;
        v_body := 'طلبك خرج للتوصيل مع المندوب وسيصلك قريباً.';
      WHEN upper(COALESCE(NEW.fulfillment_status, '')) = 'READY_FOR_PICKUP' OR lower(COALESCE(NEW.status, '')) = 'ready_for_pickup' THEN
        v_title := 'طلبك جاهز للاستلام #' || v_invoice;
        v_body := 'طلبك جاهز للاستلام الآن من الفرع.';
      WHEN upper(COALESCE(NEW.fulfillment_status, '')) = 'COMPLETED' OR lower(COALESCE(NEW.status, '')) = 'completed' THEN
        v_title := 'اكتمل طلبك #' || v_invoice;
        v_body := 'تم تسليم طلبك بنجاح. نتمنى أن ينال إعجابك! شكراً لاختيارك Pura Line.';
      WHEN lower(COALESCE(NEW.payment_status, '')) = 'paid' THEN
        v_title := 'تم تأكيد الدفع #' || v_invoice;
        v_body := 'تم استلام دفعتك (' || v_amount || ') بنجاح وبدأنا بتجهيز طلبك.';
      WHEN lower(COALESCE(NEW.status, '')) = 'confirmed' THEN
        v_title := 'تم تأكيد الطلب #' || v_invoice;
        v_body := 'طلبك مؤكد وجاري العمل عليه.';
      WHEN upper(COALESCE(NEW.fulfillment_status, '')) IN ('PROCESSING', 'PREPARING') THEN
        v_title := 'جاري تجهيز طلبك #' || v_invoice;
        v_body := 'نعمل حالياً على تجهيز منتجات طلبك بعناية.';
      ELSE
        v_title := 'تحديث على طلبك #' || v_invoice;
        v_body := 'الحالة الحالية: ' || v_status_label || ' (' || v_amount || ').';
    END CASE;
  END IF;

  INSERT INTO public.customer_push_events(
    brand_id, customer_id, order_id, event_type, dedupe_key, title, body, target_url, payload
  )
  VALUES (
    NEW.brand_id, NEW.customer_id, NEW.id, 'order_update',
    'customer-order:' || NEW.id || ':' || v_state,
    v_title, v_body, '/pura/account',
    jsonb_build_object('order_id', NEW.id, 'invoice_number', NEW.invoice_number, 'total', NEW.total, 'currency', NEW.currency)
  )
  ON CONFLICT (brand_id, dedupe_key) DO UPDATE SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    payload = EXCLUDED.payload;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_customer_order_push ON public.orders;
CREATE TRIGGER enqueue_customer_order_push
AFTER INSERT OR UPDATE OF status, payment_status, fulfillment_status, total, currency
ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enqueue_customer_order_push();

REVOKE ALL ON FUNCTION public.enqueue_customer_order_push() FROM PUBLIC, anon, authenticated;
