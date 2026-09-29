-- Migration: 20260930180000_booking_pricing.sql
--
-- Bookings, part 4: prices by duration and travel fees by area.
--
-- 1. A service may be priced by how long it is booked: its variants carry
--    duration_minutes (e.g. 3 hours at 55, 4 hours at 70). request_booking
--    (and hold_booking, which uses it) books such a service at its variant
--    for the booking's length, so every order, invoice, tax and promo keeps
--    working from variant prices. Services without durations are unchanged.
-- 2. A store may charge a travel fee for the event's area: a fee per area
--    (booking_area_fees, keyed by the storefront's Bahrain area codes) or a
--    default (booking_settings.travel_fee_default; null = no travel fees).
--    The booking records it (bookings.travel_fee) and its total includes
--    it; at checkout it becomes the order's delivery fee, set here rather
--    than by the browser.
-- 3. The storefront reads the fees with the public rules.

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS duration_minutes integer
    CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 15 AND 1440);

ALTER TABLE public.booking_settings
  ADD COLUMN IF NOT EXISTS travel_fee_default numeric(12, 3)
    CHECK (travel_fee_default IS NULL OR travel_fee_default >= 0);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS travel_fee numeric(12, 3)
    CHECK (travel_fee IS NULL OR travel_fee >= 0);

CREATE TABLE IF NOT EXISTS public.booking_area_fees (
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  area_code text NOT NULL CHECK (area_code ~ '^[a-z0-9_]{1,50}$'),
  fee numeric(12, 3) NOT NULL CHECK (fee >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, area_code)
);

ALTER TABLE public.booking_area_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand reads booking area fees" ON public.booking_area_fees;
CREATE POLICY "brand reads booking area fees" ON public.booking_area_fees
  FOR SELECT USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS "settings managers write booking area fees" ON public.booking_area_fees;
CREATE POLICY "settings managers write booking area fees" ON public.booking_area_fees
  FOR ALL
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));

REVOKE ALL ON public.booking_area_fees FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_area_fees TO authenticated;
GRANT ALL ON public.booking_area_fees TO service_role;

-- The travel fee for an area: its own fee, else the store's default, else none.
CREATE OR REPLACE FUNCTION public.booking_travel_fee(p_brand_id uuid, p_area_code text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT f.fee FROM public.booking_area_fees f
      WHERE f.brand_id = p_brand_id AND f.area_code = NULLIF(btrim(p_area_code), '')),
    (SELECT s.travel_fee_default FROM public.booking_settings s WHERE s.brand_id = p_brand_id)
  );
$function$;

REVOKE ALL ON FUNCTION public.booking_travel_fee(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_booking(
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
  v_settings public.booking_settings;
  v_state record;
  v_window record;
  v_name text := NULLIF(btrim(p_customer ->> 'name'), '');
  v_phone text := NULLIF(btrim(p_customer ->> 'phone'), '');
  v_phone_digits text;
  v_email text := NULLIF(btrim(p_customer ->> 'email'), '');
  v_customer_id uuid;
  v_booking public.bookings;
  v_item jsonb;
  v_product record;
  v_quantity integer;
  v_total numeric(12, 3) := 0;
  v_count integer;
  v_travel_fee numeric(12, 3);
BEGIN
  IF NOT public.bookings_enabled(p_brand_id) THEN
    RAISE EXCEPTION 'BOOKINGS_DISABLED' USING ERRCODE = '22023';
  END IF;

  -- One request at a time per store, like the staff functions.
  SELECT * INTO v_settings FROM public.booking_settings WHERE brand_id = p_brand_id FOR UPDATE;

  IF v_name IS NULL OR char_length(v_name) > 100 THEN
    RAISE EXCEPTION 'BOOKING_NAME_REQUIRED' USING ERRCODE = '22023';
  END IF;
  v_phone_digits := regexp_replace(COALESCE(v_phone, ''), '\D', '', 'g');
  IF char_length(v_phone_digits) NOT BETWEEN 7 AND 15 THEN
    RAISE EXCEPTION 'BOOKING_PHONE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL AND (char_length(v_email) > 200 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'BOOKING_EMAIL_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_notes IS NOT NULL AND char_length(p_notes) > 1000 THEN
    RAISE EXCEPTION 'BOOKING_NOTES_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  IF p_location IS NULL OR jsonb_typeof(p_location) <> 'object' OR char_length(p_location::text) > 1000 THEN
    RAISE EXCEPTION 'BOOKING_LOCATION_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Flood guards.
  SELECT count(*) INTO v_count FROM public.bookings
   WHERE brand_id = p_brand_id AND source = 'storefront'
     AND created_at >= now() - interval '10 minutes';
  IF v_count >= 60 THEN
    RAISE EXCEPTION 'BOOKING_RATE_LIMITED' USING ERRCODE = '54000';
  END IF;
  SELECT count(*) INTO v_count FROM public.bookings
   WHERE brand_id = p_brand_id AND source = 'storefront'
     AND regexp_replace(COALESCE(customer_phone, ''), '\D', '', 'g') = v_phone_digits
     AND created_at >= now() - interval '1 hour';
  IF v_count >= 3 THEN
    RAISE EXCEPTION 'BOOKING_RATE_LIMITED' USING ERRCODE = '54000';
  END IF;

  SELECT * INTO v_window FROM public.booking_window(v_settings, p_day, p_start, p_duration_minutes);
  SELECT * INTO v_state FROM public.booking_day_state(v_settings, p_day);
  IF v_state.state <> 'available' THEN
    RAISE EXCEPTION 'BOOKING_DAY_%', upper(v_state.state) USING ERRCODE = '23P01';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'BOOKING_ITEMS_REQUIRED' USING ERRCODE = '22023';
  END IF;

  -- The store's own customer with this phone, if there is one.
  SELECT id INTO v_customer_id FROM public.customers
   WHERE brand_id = p_brand_id
     AND regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = v_phone_digits
   ORDER BY created_at
   LIMIT 1;

  INSERT INTO public.bookings (
    brand_id, reference, status, event_date, starts_at, ends_at, customer_id,
    customer_name, customer_phone, customer_email, location, notes, source
  ) VALUES (
    p_brand_id, public.next_booking_reference(p_brand_id), 'requested', p_day,
    v_window.starts_at, v_window.ends_at, v_customer_id,
    v_name, v_phone, v_email, p_location, NULLIF(btrim(p_notes), ''), 'storefront'
  )
  RETURNING * INTO v_booking;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- The store's active service at its variant's price. A service priced by
    -- duration (variants with duration_minutes) is booked at its variant for
    -- this booking's length, whatever the browser asked for; any other is
    -- booked at the variant asked for, or else its cheapest ("from" price).
    SELECT p.id, p.name, p.name_en, p.name_ar, v.id AS variant_id, v.selling_price AS price
      INTO v_product
      FROM public.products p
      JOIN public.product_variants v ON v.product_id = p.id AND v.brand_id = p.brand_id
     WHERE p.id = NULLIF(v_item ->> 'product_id', '')::uuid
       AND p.brand_id = p_brand_id
       AND p.is_active
       AND CASE
         WHEN EXISTS (
           SELECT 1 FROM public.product_variants dv
            WHERE dv.product_id = p.id AND dv.duration_minutes IS NOT NULL
         ) THEN v.duration_minutes = p_duration_minutes
         ELSE (NULLIF(v_item ->> 'variant_id', '') IS NULL
               OR v.id = NULLIF(v_item ->> 'variant_id', '')::uuid)
       END
     ORDER BY v.selling_price ASC, v.created_at ASC
     LIMIT 1;
    IF NOT FOUND THEN
      IF EXISTS (
        SELECT 1 FROM public.product_variants dv
         WHERE dv.product_id = NULLIF(v_item ->> 'product_id', '')::uuid
           AND dv.brand_id = p_brand_id
           AND dv.duration_minutes IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'BOOKING_DURATION_NOT_OFFERED' USING ERRCODE = '22023';
      END IF;
      RAISE EXCEPTION 'BOOKING_PRODUCT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    v_quantity := COALESCE((v_item ->> 'quantity')::integer, 1);
    IF v_quantity NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION 'BOOKING_QUANTITY_INVALID' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.booking_items (
      booking_id, brand_id, product_id, variant_id, name_en, name_ar, quantity, unit_price
    ) VALUES (
      v_booking.id, p_brand_id, v_product.id, v_product.variant_id,
      COALESCE(v_product.name_en, v_product.name), COALESCE(v_product.name_ar, v_product.name),
      v_quantity, v_product.price
    );
    v_total := v_total + v_quantity * v_product.price;
  END LOOP;

  -- The trip to the event's area, when the store charges one.
  v_travel_fee := public.booking_travel_fee(p_brand_id, p_location ->> 'area_code');
  v_total := v_total + COALESCE(v_travel_fee, 0);

  UPDATE public.bookings SET total = v_total, travel_fee = v_travel_fee WHERE id = v_booking.id;

  RETURN jsonb_build_object(
    'travel_fee', v_travel_fee,
    'reference', v_booking.reference,
    'status', 'requested',
    'event_date', v_booking.event_date,
    'starts_at', v_booking.starts_at,
    'ends_at', v_booking.ends_at,
    'total', v_total
  );
END;
$function$;

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
    p_benefit_receipt_id => p_benefit_receipt_id,
    -- A booking's delivery fee is its travel fee, set by the database from
    -- the event's area (never the browser's), when the store charges one.
    p_shipping_fee => CASE
      WHEN v_booking.travel_fee IS NOT NULL AND p_fulfillment = 'delivery' THEN v_booking.travel_fee
      ELSE p_shipping_fee
    END,
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
      'deposit_percent', s.deposit_percent,
      'travel_fee_default', s.travel_fee_default,
      'travel_fees', COALESCE((
        SELECT jsonb_object_agg(f.area_code, f.fee)
          FROM public.booking_area_fees f
         WHERE f.brand_id = p_brand_id
      ), '{}'::jsonb)
    ) END
    FROM public.booking_settings s
   WHERE s.brand_id = p_brand_id;
$function$;

NOTIFY pgrst, 'reload schema';
