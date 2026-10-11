-- A shopper's order notification names its own store and opens its own account page.
--
-- enqueue_customer_order_push was written when one store had a customer app: the "delivered"
-- message thanked every store's customer for choosing Pura Line, and every notification opened
-- /pura/account. This is the previous definition with three changes:
--
--   * the store's own name (Arabic first, the message is Arabic) in the thank-you, which is
--     left out when a store has no name;
--   * the link is the store's own account page, as a full address
--     (https://<slug>.boutq.store/<slug>/account), like a campaign's link, so the sender does
--     not have to guess a host; no link is written when the store has no slug;
--   * a repeated event refreshes its link along with its text.
--
-- No notification with the wrong name ever reached a customer: every event so far was
-- processed with no device to send to.

CREATE OR REPLACE FUNCTION public.enqueue_customer_order_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invoice text := COALESCE(NEW.invoice_number::text, '—');
  v_amount text := public.format_currency_amount(NEW.total, NEW.currency);
  v_title text;
  v_body text;
  v_state text;
  v_status_label text;
  v_slug text;
  v_store text;
BEGIN
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  -- The order's own store: its name for the thank-you, its address for the link.
  SELECT NULLIF(lower(trim(slug)), ''),
         COALESCE(NULLIF(trim(name_ar), ''), NULLIF(trim(name_en), ''))
    INTO v_slug, v_store
  FROM public.brands WHERE id = NEW.brand_id;
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
        v_body := 'تم تسليم طلبك بنجاح. نتمنى أن ينال إعجابك!'
          || COALESCE(' شكراً لاختيارك ' || v_store || '.', '');
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
    v_title, v_body,
    'https://' || v_slug || '.boutq.store/' || v_slug || '/account',
    jsonb_build_object('order_id', NEW.id, 'invoice_number', NEW.invoice_number, 'total', NEW.total, 'currency', NEW.currency)
  )
  ON CONFLICT (brand_id, dedupe_key) DO UPDATE SET
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    target_url = EXCLUDED.target_url,
    payload = EXCLUDED.payload;

  RETURN NEW;
END;
$function$;
