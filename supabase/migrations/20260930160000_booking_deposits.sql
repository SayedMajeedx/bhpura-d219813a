-- Migration: 20260930160000_booking_deposits.sql
--
-- Bookings, part 3b: deposits.
--
-- A store may take a deposit (booking_settings.deposit_percent, 0 = none,
-- 100 = full payment). When a booking is paid by card, place_booking_order
-- records the deposit on the booking (bookings.deposit_amount: the percent of
-- the order's total, rounded up to the fils); the card payment charges only
-- that (the charge route, the redirect and the webhook all read it) and the
-- order becomes partially paid with the deposit as its advance payment, the
-- rest due at the event. A paid deposit confirms the booking like a full
-- payment. Cash and bank transfer are unchanged.

ALTER TABLE public.booking_settings
  ADD COLUMN IF NOT EXISTS deposit_percent integer NOT NULL DEFAULT 0
    CHECK (deposit_percent BETWEEN 0 AND 100);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(12, 3)
    CHECK (deposit_amount IS NULL OR deposit_amount >= 0);

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
    -- A card payment charges only the store's deposit (rounded up to the
    -- fils); the rest is due at the event. None at 0% or 100%.
    deposit_amount = CASE
      WHEN v_card AND v_settings.deposit_percent > 0 AND v_settings.deposit_percent < 100
        THEN ceil(v_order.total * v_settings.deposit_percent * 10) / 1000
    END,
    updated_at = now()
  WHERE id = v_booking.id
  RETURNING * INTO v_booking;

  RETURN v_result || jsonb_build_object(
    'booking_reference', v_booking.reference,
    'booking_status', v_booking.status,
    'deposit_amount', v_booking.deposit_amount
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_bookings_with_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Paid in full, or the booking's deposit paid: the day is the customer's.
  IF NEW.payment_status IN ('paid', 'partially_paid')
     AND OLD.payment_status IS DISTINCT FROM NEW.payment_status
     AND COALESCE(OLD.payment_status, '') NOT IN ('paid', 'partially_paid') THEN
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

-- The storefront shows the deposit before checkout.
CREATE OR REPLACE FUNCTION public.get_public_booking_rules(p_brand_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.bookings_enabled(p_brand_id) THEN
    jsonb_build_object(
      'timezone', s.timezone,
      'open_time', to_char(s.open_time, 'HH24:MI'),
      'last_start_time', to_char(s.last_start_time, 'HH24:MI'),
      'slot_minutes', s.slot_minutes,
      'min_duration_minutes', s.min_duration_minutes,
      'max_duration_minutes', s.max_duration_minutes,
      'duration_step_minutes', s.duration_step_minutes,
      'lead_days', s.lead_days,
      'horizon_days', s.horizon_days,
      'closed_weekdays', to_jsonb(s.closed_weekdays),
      'deposit_percent', s.deposit_percent
    ) END
    FROM public.booking_settings s
   WHERE s.brand_id = p_brand_id;
$function$;

NOTIFY pgrst, 'reload schema';
