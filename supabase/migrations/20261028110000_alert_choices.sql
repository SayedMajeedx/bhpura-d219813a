-- Choosing the alerts a device takes (the owner's request of 2026-10-27, after #437): each installed
-- admin picks which of the store's events reach it (Settings → Account → Mobile Apps,
-- `OrderAlertsSettings`). New booking requests join the event queue (they reached no one), and a
-- new order says which channel made it, so a device can leave out the orders staff typed in
-- themselves (`order_new_staff`, off by default). The push sender reads the choice through
-- `web_push_targets`, as before.

-- 1. A storefront booking request is an event of its own.
ALTER TABLE public.push_notification_events
  DROP CONSTRAINT IF EXISTS push_notification_events_event_type_check;
ALTER TABLE public.push_notification_events
  ADD CONSTRAINT push_notification_events_event_type_check CHECK (event_type = ANY (ARRAY[
    'order_new', 'order_updated', 'review_due', 'review_completed', 'low_stock', 'system_failure',
    'booking_new'
  ]));

CREATE OR REPLACE FUNCTION public.enqueue_mobile_booking_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.push_notification_events (
    brand_id, event_type, entity_type, entity_id, dedupe_key, title, body, target_url, payload
  )
  VALUES (
    NEW.brand_id, 'booking_new', 'booking', NEW.id,
    'booking-new:' || NEW.id,
    'طلب حجز جديد',
    COALESCE(NULLIF(NEW.customer_name, ''), 'عميل جديد') || ' — ' || to_char(NEW.event_date, 'YYYY-MM-DD'),
    '/bookings',
    jsonb_build_object('booking_id', NEW.id, 'event_date', NEW.event_date, 'source', NEW.source)
  )
  ON CONFLICT (brand_id, dedupe_key) DO NOTHING;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enqueue_mobile_booking_push() FROM PUBLIC, anon, authenticated;
-- A request waiting for the store, from a shopper (a held day becomes an order, which has its own).
DROP TRIGGER IF EXISTS enqueue_mobile_booking_push ON public.bookings;
CREATE TRIGGER enqueue_mobile_booking_push AFTER INSERT ON public.bookings
FOR EACH ROW WHEN (NEW.status = 'requested' AND NEW.source = 'storefront')
EXECUTE FUNCTION public.enqueue_mobile_booking_push();

-- 2. A new order's event says which channel made it ('channel'). The live function
-- (pg_get_functiondef, 2026-10-27) with that one key added where the event's payload is written.
CREATE OR REPLACE FUNCTION public.enqueue_mobile_order_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      jsonb_build_object('order_id', NEW.id, 'invoice_number', NEW.invoice_number, 'total', NEW.total, 'currency', NEW.currency, 'status', NEW.status, 'channel', NEW.channel)
    )
    ON CONFLICT (brand_id, dedupe_key) DO UPDATE SET
      body = EXCLUDED.body,
      payload = EXCLUDED.payload;
  ELSE
    IF (OLD.total IS NOT DISTINCT FROM 0 AND NEW.total > 0) OR (OLD.customer_name_snapshot IS NULL AND NEW.customer_name_snapshot IS NOT NULL) THEN
      UPDATE public.push_notification_events
      SET body = v_customer_name || ' — ' || v_amount,
          payload = jsonb_build_object('order_id', NEW.id, 'invoice_number', NEW.invoice_number, 'total', NEW.total, 'currency', NEW.currency, 'status', NEW.status, 'channel', NEW.channel)
      WHERE brand_id = NEW.brand_id AND dedupe_key = 'order-new:' || NEW.id;
    END IF;

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
$function$;

-- 3. What a device takes: every kind of event, new orders and booking requests on by default.
ALTER TABLE public.web_push_subscriptions
  ALTER COLUMN preferences SET DEFAULT '{"order_new": true, "order_new_staff": false, "booking_new": true, "order_updated": false, "review_due": false, "review_completed": false, "low_stock": false, "system_failure": false}'::jsonb;
UPDATE public.web_push_subscriptions
   SET preferences = '{"order_new": true, "order_new_staff": false, "booking_new": true, "order_updated": false, "review_due": false, "review_completed": false, "low_stock": false, "system_failure": false}'::jsonb || preferences;

CREATE OR REPLACE FUNCTION public.web_push_alert_choices(p_endpoint text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT preferences FROM public.web_push_subscriptions
   WHERE endpoint = p_endpoint AND user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.web_push_alert_choices(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.web_push_alert_choices(text) TO authenticated;

-- A person sets their own device's choices: known kinds only, each on or off.
CREATE OR REPLACE FUNCTION public.set_web_push_alert_choices(p_endpoint text, p_choices jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_known text[] := ARRAY['order_new', 'order_new_staff', 'booking_new', 'order_updated',
    'review_due', 'review_completed', 'low_stock', 'system_failure'];
  v_key text;
  v_value jsonb;
  v_clean jsonb := '{}'::jsonb;
  v_saved jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF jsonb_typeof(p_choices) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_CHOICES'; END IF;
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_choices) LOOP
    IF v_key = ANY (v_known) AND jsonb_typeof(v_value) = 'boolean' THEN
      v_clean := v_clean || jsonb_build_object(v_key, v_value);
    END IF;
  END LOOP;
  UPDATE public.web_push_subscriptions
     SET preferences = preferences || v_clean, updated_at = now()
   WHERE endpoint = p_endpoint AND user_id = auth.uid()
  RETURNING preferences INTO v_saved;
  IF v_saved IS NULL THEN RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND'; END IF;
  RETURN v_saved;
END;
$$;
REVOKE ALL ON FUNCTION public.set_web_push_alert_choices(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_web_push_alert_choices(text, jsonb) TO authenticated;
