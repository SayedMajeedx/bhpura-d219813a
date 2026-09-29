-- Migration: 20260930140000_booking_checkout.sql
--
-- Bookings, part 3: a shop store's customers book and pay at checkout.
--
-- 1. hold_booking: the storefront reserves the day for the store's hold time
--    (booking_settings.hold_minutes) while the customer checks out. It is a
--    booking request (request_booking: same checks, prices and limits) turned
--    into a hold, which takes the day's place. The customer gets a secret
--    hold token to finish the booking with.
-- 2. place_booking_order: the checkout places the order through
--    place_storefront_order (unchanged) and ties the booking to it, in one
--    transaction. The cart must carry the booked services. A card payment
--    keeps the day held while the customer pays (at least 30 minutes); cash
--    and bank transfer confirm the booking at once (the store frees the day by
--    cancelling the order). A hold that ran out still works if the day is free.
-- 3. The booking follows its order: paid confirms it, cancelled or returned
--    cancels it, completed completes it.

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS hold_token uuid;

-- ── 1. Hold ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hold_booking(
  p_brand_id uuid,
  p_day date,
  p_start time,
  p_duration_minutes integer,
  p_items jsonb,
  p_customer jsonb,
  p_location jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request jsonb;
  v_booking public.bookings;
  v_minutes integer;
  v_token uuid := gen_random_uuid();
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.business_settings
     WHERE brand_id = p_brand_id AND storefront_mode = 'catalog'
  ) THEN
    RAISE EXCEPTION 'CHECKOUT_DISABLED_CATALOG_MODE' USING ERRCODE = '22023';
  END IF;

  -- Every check, the prices and the limits of a request (it also locks the
  -- store's settings row, so the day's place cannot be taken meanwhile).
  v_request := public.request_booking(
    p_brand_id, p_day, p_start, p_duration_minutes, p_items, p_customer, p_location, p_notes
  );

  SELECT hold_minutes INTO v_minutes FROM public.booking_settings WHERE brand_id = p_brand_id;

  UPDATE public.bookings
     SET status = 'hold',
         hold_expires_at = now() + make_interval(mins => v_minutes),
         hold_token = v_token,
         updated_at = now()
   WHERE brand_id = p_brand_id AND reference = v_request ->> 'reference'
  RETURNING * INTO v_booking;

  RETURN v_request || jsonb_build_object(
    'booking_id', v_booking.id,
    'status', 'hold',
    'hold_token', v_token,
    'hold_expires_at', v_booking.hold_expires_at,
    'items', (
      SELECT jsonb_agg(jsonb_build_object(
        'product_id', bi.product_id,
        'variant_id', bi.variant_id,
        'quantity', bi.quantity,
        'unit_price', bi.unit_price
      ))
      FROM public.booking_items bi
      WHERE bi.booking_id = v_booking.id
    )
  );
END;
$function$;

-- ── 2. Order ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.place_booking_order(
  p_booking_id uuid,
  p_hold_token uuid,
  p_brand_slug text,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text,
  p_notes text DEFAULT NULL,
  p_fulfillment text DEFAULT 'delivery',
  p_branch_id uuid DEFAULT NULL,
  p_digital_channel text DEFAULT NULL,
  p_digital_contact text DEFAULT NULL,
  p_promo_code text DEFAULT NULL,
  p_benefit_receipt_id uuid DEFAULT NULL,
  p_shipping_fee numeric DEFAULT NULL,
  p_shipping_zone text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_settings public.booking_settings;
  v_state record;
  v_brand_id uuid;
  v_missing integer;
  v_result jsonb;
  v_order public.orders;
  v_card boolean := p_payment_method = 'card';
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  SELECT id INTO v_brand_id FROM public.brands WHERE slug = p_brand_slug;
  IF NOT FOUND OR v_booking.id IS NULL OR v_booking.hold_token IS NULL
     OR v_booking.hold_token <> p_hold_token OR v_booking.brand_id IS DISTINCT FROM v_brand_id THEN
    RAISE EXCEPTION 'BOOKING_HOLD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- The same checkout again (a retried card payment): the same order.
  IF v_booking.order_id IS NOT NULL THEN
    v_result := public.place_storefront_order(
      p_brand_slug => p_brand_slug, p_customer => p_customer, p_items => p_items,
      p_payment_method => p_payment_method, p_notes => p_notes, p_fulfillment => p_fulfillment,
      p_branch_id => p_branch_id, p_digital_channel => p_digital_channel,
      p_digital_contact => p_digital_contact, p_promo_code => p_promo_code,
      p_benefit_receipt_id => p_benefit_receipt_id, p_shipping_fee => p_shipping_fee,
      p_shipping_zone => p_shipping_zone, p_idempotency_key => p_idempotency_key
    );
    IF (v_result ->> 'order_id')::uuid IS DISTINCT FROM v_booking.order_id THEN
      RAISE EXCEPTION 'BOOKING_ALREADY_ORDERED' USING ERRCODE = '23505';
    END IF;
    RETURN v_result || jsonb_build_object(
      'booking_reference', v_booking.reference, 'booking_status', v_booking.status
    );
  END IF;

  IF v_booking.status NOT IN ('hold', 'expired') THEN
    RAISE EXCEPTION 'BOOKING_HOLD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_settings FROM public.booking_settings WHERE brand_id = v_booking.brand_id FOR UPDATE;

  -- A hold that ran out still works while the day is free.
  IF v_booking.status = 'expired' OR v_booking.hold_expires_at <= now() THEN
    SELECT * INTO v_state FROM public.booking_day_state(v_settings, v_booking.event_date, v_booking.id);
    IF v_state.state <> 'available' THEN
      RAISE EXCEPTION 'BOOKING_HOLD_EXPIRED' USING ERRCODE = '23P01';
    END IF;
  END IF;

  -- The cart must carry every booked service.
  SELECT count(*) INTO v_missing
    FROM public.booking_items bi
   WHERE bi.booking_id = v_booking.id
     AND COALESCE((
       SELECT sum(GREATEST(1, COALESCE((line ->> 'quantity')::integer, 1)))
         FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS line
        WHERE NULLIF(line ->> 'variant_id', '')::uuid = bi.variant_id
     ), 0) < bi.quantity;
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'BOOKING_ITEMS_MISMATCH' USING ERRCODE = '22023';
  END IF;

  v_result := public.place_storefront_order(
    p_brand_slug => p_brand_slug, p_customer => p_customer, p_items => p_items,
    p_payment_method => p_payment_method, p_notes => p_notes, p_fulfillment => p_fulfillment,
    p_branch_id => p_branch_id, p_digital_channel => p_digital_channel,
    p_digital_contact => p_digital_contact, p_promo_code => p_promo_code,
    p_benefit_receipt_id => p_benefit_receipt_id, p_shipping_fee => p_shipping_fee,
    p_shipping_zone => p_shipping_zone, p_idempotency_key => p_idempotency_key
  );

  SELECT * INTO v_order FROM public.orders WHERE id = (v_result ->> 'order_id')::uuid;

  -- The order says which booking it pays for (order screen, invoice, messages).
  UPDATE public.orders
     SET notes = concat_ws(E'\n\n',
       format('📅 %s · %s · %s–%s',
         v_booking.reference,
         to_char(v_booking.event_date, 'YYYY-MM-DD'),
         to_char(v_booking.starts_at AT TIME ZONE v_settings.timezone, 'HH24:MI'),
         to_char(v_booking.ends_at AT TIME ZONE v_settings.timezone, 'HH24:MI')),
       notes)
   WHERE id = v_order.id;

  UPDATE public.bookings SET
    order_id = v_order.id,
    customer_id = v_order.customer_id,
    customer_name = COALESCE(v_order.customer_name_snapshot, customer_name),
    customer_phone = COALESCE(v_order.customer_phone_snapshot, customer_phone),
    customer_email = COALESCE(v_order.customer_email_snapshot, customer_email),
    -- Card: held while the customer pays; cash and transfer: confirmed now.
    status = CASE WHEN v_card THEN 'hold' ELSE 'confirmed' END,
    hold_expires_at = CASE
      WHEN v_card THEN GREATEST(COALESCE(hold_expires_at, now()), now() + interval '30 minutes')
    END,
    confirmed_at = CASE WHEN v_card THEN NULL ELSE now() END,
    updated_at = now()
  WHERE id = v_booking.id
  RETURNING * INTO v_booking;

  RETURN v_result || jsonb_build_object(
    'booking_reference', v_booking.reference, 'booking_status', v_booking.status
  );
END;
$function$;

-- ── 3. The booking follows its order ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_bookings_with_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    UPDATE public.bookings SET
      status = 'confirmed',
      confirmed_at = COALESCE(confirmed_at, now()),
      notes = CASE
        WHEN hold_expires_at < now()
          THEN concat_ws(E'\n', notes, 'Paid after the hold ran out: check the day is still free.')
        ELSE notes
      END,
      hold_expires_at = NULL,
      updated_at = now()
    WHERE order_id = NEW.id AND status IN ('hold', 'expired');
  END IF;

  IF NEW.status IN ('cancelled', 'canceled', 'returned') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.bookings SET
      status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = COALESCE(cancel_reason, 'Order cancelled'),
      hold_expires_at = NULL,
      updated_at = now()
    WHERE order_id = NEW.id AND status IN ('hold', 'expired', 'requested', 'confirmed');
  ELSIF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    UPDATE public.bookings SET status = 'completed', updated_at = now()
    WHERE order_id = NEW.id AND status = 'confirmed';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_sync_bookings ON public.orders;
CREATE TRIGGER trg_orders_sync_bookings
  AFTER UPDATE OF status, payment_status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.payment_status IS DISTINCT FROM NEW.payment_status)
  EXECUTE FUNCTION public.sync_bookings_with_order();

-- ── Grants ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.hold_booking(uuid, date, time, integer, jsonb, jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hold_booking(uuid, date, time, integer, jsonb, jsonb, jsonb, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.place_booking_order(uuid, uuid, text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_booking_order(uuid, uuid, text, jsonb, jsonb, text, text, text, uuid, text, text, text, uuid, numeric, text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_bookings_with_order() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
