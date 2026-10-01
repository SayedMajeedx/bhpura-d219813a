-- Migration: 20261002100000_booking_discounts.sql
--
-- Services vertical: discounts for when a booking is made.
--
-- A store sets its own rules: "booking within 1 day: 25% off", "within 7 days:
-- 10% off", "6 weeks ahead: 15% off", "Sundays to Tuesdays: 20 off", for all its
-- services or chosen ones, between two dates if it likes, switched on or off.
-- Each rule is a window of days between the booking and the event (min_days to
-- max_days; none: no upper limit), a percent or a fixed amount, and optionally
-- the event's weekdays, the services, and the dates it can be booked on.
--
--   * the best matching rule is applied once, when the booking is made
--     (request_booking, hold_booking through it, create_staff_booking) and stays
--     with the booking (rescheduling keeps what was promised);
--   * the booking records bookings.discount_amount and the rule's name;
--     bookings.total = services - discount + travel fee;
--   * a checkout order carries the discount (place_booking_order);
--   * staff can set or clear a booking's discount by hand (set_booking_discount);
--   * the storefront reads the active rules with get_booking_discounts.
--
-- Additive: no rule, no discount; existing bookings are unchanged.

CREATE TABLE IF NOT EXISTS public.booking_discount_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name_en text,
  name_ar text,
  kind text NOT NULL DEFAULT 'percent' CHECK (kind IN ('percent', 'fixed')),
  value numeric(12, 3) NOT NULL CHECK (value > 0),
  min_days integer NOT NULL DEFAULT 0 CHECK (min_days BETWEEN 0 AND 730),
  max_days integer CHECK (max_days BETWEEN 0 AND 730),
  weekdays smallint[],
  product_ids uuid[],
  valid_from date,
  valid_to date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_days IS NULL OR max_days >= min_days),
  CHECK (kind <> 'percent' OR value <= 100),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK (weekdays IS NULL OR weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[])
);

CREATE INDEX IF NOT EXISTS booking_discount_rules_brand_idx
  ON public.booking_discount_rules (brand_id) WHERE is_active;

ALTER TABLE public.booking_discount_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand reads booking discount rules" ON public.booking_discount_rules;
CREATE POLICY "brand reads booking discount rules" ON public.booking_discount_rules
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS "settings managers write booking discount rules" ON public.booking_discount_rules;
CREATE POLICY "settings managers write booking discount rules" ON public.booking_discount_rules
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12, 3) NOT NULL DEFAULT 0
    CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS discount_rule_id uuid
    REFERENCES public.booking_discount_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_label_en text,
  ADD COLUMN IF NOT EXISTS discount_label_ar text;

COMMENT ON COLUMN public.bookings.discount_amount IS
  'Booking-time discount (a rule, or set by staff); total = services - discount + travel fee.';

-- ── The rules the storefront may show (active, no internal data) ────────────

CREATE OR REPLACE FUNCTION public.get_booking_discounts(p_brand_id uuid)
RETURNS TABLE (
  id uuid, name_en text, name_ar text, kind text, value numeric,
  min_days integer, max_days integer, weekdays smallint[], product_ids uuid[],
  valid_from date, valid_to date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.id, r.name_en, r.name_ar, r.kind, r.value, r.min_days, r.max_days,
         r.weekdays, r.product_ids, r.valid_from, r.valid_to
    FROM public.booking_discount_rules r
   WHERE r.brand_id = p_brand_id
     AND r.is_active
     AND public.bookings_enabled(p_brand_id)
   ORDER BY r.min_days, r.created_at;
$function$;

-- ── An order's totals from its subtotal, discount, shipping and VAT ────────

CREATE OR REPLACE FUNCTION public.reprice_order_totals(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders;
  v_inclusive boolean := false;
  v_taxable numeric;
  v_tax numeric;
  v_total numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT COALESCE(vat_inclusive, false) INTO v_inclusive
    FROM public.business_settings WHERE brand_id = v_order.brand_id;
  v_taxable := greatest(0, v_order.subtotal - v_order.discount);
  IF v_inclusive THEN
    v_tax := v_taxable - (v_taxable / (1 + (v_order.tax_rate / 100)));
    v_total := v_taxable + v_order.shipping;
  ELSE
    v_tax := (v_taxable * v_order.tax_rate) / 100;
    v_total := v_taxable + v_tax + v_order.shipping;
  END IF;
  UPDATE public.orders SET tax_amount = round(v_tax, 3), total = round(v_total, 3)
   WHERE id = p_order_id;
END;
$function$;

-- ── Apply the best matching rule to a booking ──────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_booking_discount(p_booking_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_tz text;
  v_today date;
  v_lead integer;
  v_services numeric(12, 3);
  v_rule record;
  v_amount numeric(12, 3) := 0;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT timezone INTO v_tz FROM public.booking_settings WHERE brand_id = v_booking.brand_id;
  v_today := (now() AT TIME ZONE COALESCE(v_tz, 'Asia/Bahrain'))::date;
  v_lead := v_booking.event_date - v_today;

  SELECT COALESCE(sum(line_total), 0) INTO v_services
    FROM public.booking_items WHERE booking_id = v_booking.id;

  SELECT r.id, r.name_en, r.name_ar,
         CASE WHEN r.kind = 'percent'
              THEN round(s.applicable * r.value / 100, 3)
              ELSE LEAST(r.value, s.applicable) END AS amount
    INTO v_rule
    FROM public.booking_discount_rules r
    CROSS JOIN LATERAL (
      SELECT COALESCE(sum(bi.line_total), 0) AS applicable
        FROM public.booking_items bi
       WHERE bi.booking_id = v_booking.id
         AND (r.product_ids IS NULL OR cardinality(r.product_ids) = 0
              OR bi.product_id = ANY (r.product_ids))
    ) s
   WHERE r.brand_id = v_booking.brand_id
     AND r.is_active
     AND v_lead >= r.min_days
     AND (r.max_days IS NULL OR v_lead <= r.max_days)
     AND (r.weekdays IS NULL OR cardinality(r.weekdays) = 0
          OR extract(dow FROM v_booking.event_date)::smallint = ANY (r.weekdays))
     AND (r.valid_from IS NULL OR v_today >= r.valid_from)
     AND (r.valid_to IS NULL OR v_today <= r.valid_to)
     AND s.applicable > 0
   ORDER BY CASE WHEN r.kind = 'percent'
                 THEN round(s.applicable * r.value / 100, 3)
                 ELSE LEAST(r.value, s.applicable) END DESC,
            r.min_days DESC, r.created_at, r.id
   LIMIT 1;

  IF FOUND AND v_rule.amount > 0 THEN
    v_amount := LEAST(v_rule.amount, v_services);
    UPDATE public.bookings SET
      discount_amount = v_amount,
      discount_rule_id = v_rule.id,
      discount_label_en = v_rule.name_en,
      discount_label_ar = v_rule.name_ar,
      total = v_services - v_amount + COALESCE(travel_fee, 0)
    WHERE id = v_booking.id;
  ELSE
    UPDATE public.bookings SET
      discount_amount = 0, discount_rule_id = NULL,
      discount_label_en = NULL, discount_label_ar = NULL,
      total = v_services + COALESCE(travel_fee, 0)
    WHERE id = v_booking.id;
  END IF;
  RETURN v_amount;
END;
$function$;

-- ── Staff set or clear a booking's discount by hand ────────────────────────

CREATE OR REPLACE FUNCTION public.set_booking_discount(
  p_booking_id uuid, p_amount numeric, p_label text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_services numeric(12, 3);
  v_amount numeric(12, 3) := round(COALESCE(p_amount, 0), 3);
  v_before numeric(12, 3);
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR NOT (
    public.can_access_brand(v_booking.brand_id) AND public.has_permission('manage_orders')
  ) THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  v_before := v_booking.discount_amount;
  IF v_booking.status IN ('cancelled', 'expired', 'completed') THEN
    RAISE EXCEPTION 'BOOKING_TRANSITION_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(line_total), 0) INTO v_services
    FROM public.booking_items WHERE booking_id = v_booking.id;
  IF v_amount < 0 OR v_amount > v_services THEN
    RAISE EXCEPTION 'BOOKING_DISCOUNT_INVALID' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bookings SET
    discount_amount = v_amount,
    discount_rule_id = NULL,
    discount_label_en = CASE WHEN v_amount > 0 THEN COALESCE(NULLIF(btrim(p_label), ''), 'Discount') END,
    discount_label_ar = CASE WHEN v_amount > 0 THEN COALESCE(NULLIF(btrim(p_label), ''), 'خصم') END,
    total = v_services - v_amount + COALESCE(travel_fee, 0),
    updated_at = now()
  WHERE id = v_booking.id
  RETURNING * INTO v_booking;

  -- Its order carries the same discount (a checkout's promo code stays).
  IF v_booking.order_id IS NOT NULL THEN
    UPDATE public.orders SET
      discount = LEAST(subtotal, GREATEST(0, discount - v_before) + v_amount)
    WHERE id = v_booking.order_id AND status NOT IN ('completed', 'cancelled', 'canceled', 'returned');
    PERFORM public.reprice_order_totals(v_booking.order_id);
  END IF;
  RETURN v_booking;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_booking(p_brand_id uuid, p_day date, p_start time without time zone, p_duration_minutes integer, p_items jsonb, p_customer jsonb, p_location jsonb DEFAULT '{}'::jsonb, p_notes text DEFAULT NULL::text)
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
  v_discount numeric(12, 3);
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
  -- A service with its own capacity is limited by that, not by the store's
  -- daily places; one with its own notice by that notice.
  SELECT * INTO v_state FROM public.booking_day_state_for(
    v_settings, p_day, NULL, false,
    public.booking_items_notice_hours(p_brand_id, p_items),
    public.booking_items_all_governed(p_brand_id, p_items));
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

  -- Each service's own notice and capacity (this booking does not count yet:
  -- a request takes no place until it is held or confirmed).
  PERFORM public.assert_booking_items_notice(p_brand_id, p_items, v_window.starts_at);
  PERFORM public.assert_booking_services_free(v_booking.id);

  -- The trip to the event's area, when the store charges one.
  v_travel_fee := public.booking_travel_fee(p_brand_id, p_location ->> 'area_code');
  v_total := v_total + COALESCE(v_travel_fee, 0);

  UPDATE public.bookings SET total = v_total, travel_fee = v_travel_fee WHERE id = v_booking.id;

  -- The store's discount for booking this far ahead or on this day.
  v_discount := public.apply_booking_discount(v_booking.id);
  SELECT total INTO v_total FROM public.bookings WHERE id = v_booking.id;

  RETURN jsonb_build_object(
    'travel_fee', v_travel_fee,
    'reference', v_booking.reference,
    'status', 'requested',
    'event_date', v_booking.event_date,
    'starts_at', v_booking.starts_at,
    'ends_at', v_booking.ends_at,
    'discount', v_discount,
    'total', v_total
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_staff_booking(p_brand_id uuid, p_day date, p_start time without time zone, p_duration_minutes integer, p_customer jsonb, p_items jsonb, p_location jsonb DEFAULT '{}'::jsonb, p_notes text DEFAULT NULL::text, p_status text DEFAULT 'confirmed'::text, p_source text DEFAULT 'admin'::text, p_allow_overbook boolean DEFAULT false)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.booking_settings;
  v_state record;
  v_window record;
  v_customer_id uuid;
  v_booking public.bookings;
  v_item jsonb;
  v_total numeric(12, 3) := 0;
BEGIN
  v_settings := public.lock_booking_settings_for_staff(p_brand_id);

  IF p_status NOT IN ('confirmed', 'requested') THEN
    RAISE EXCEPTION 'BOOKING_STATUS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_source NOT IN ('admin', 'whatsapp') THEN
    RAISE EXCEPTION 'BOOKING_SOURCE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0
     OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'BOOKING_ITEMS_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_window FROM public.booking_window(v_settings, p_day, p_start, p_duration_minutes);

  IF p_status = 'confirmed' AND NOT p_allow_overbook THEN
    SELECT * INTO v_state FROM public.booking_day_state_for(
      v_settings, p_day, NULL, true, NULL, public.booking_items_all_governed(p_brand_id, p_items));
    IF v_state.state <> 'available' THEN
      RAISE EXCEPTION 'BOOKING_DAY_%', upper(v_state.state) USING ERRCODE = '23P01';
    END IF;
  END IF;

  -- A customer given by id must be the store's own.
  v_customer_id := NULLIF(p_customer ->> 'id', '')::uuid;
  IF v_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = v_customer_id AND brand_id = p_brand_id
  ) THEN
    RAISE EXCEPTION 'BOOKING_CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.bookings (
    brand_id, reference, status, event_date, starts_at, ends_at, customer_id,
    customer_name, customer_phone, customer_email, location, notes, source,
    confirmed_at, confirmed_by, created_by
  ) VALUES (
    p_brand_id, public.next_booking_reference(p_brand_id), p_status, p_day,
    v_window.starts_at, v_window.ends_at, v_customer_id,
    NULLIF(btrim(p_customer ->> 'name'), ''), NULLIF(btrim(p_customer ->> 'phone'), ''),
    NULLIF(btrim(p_customer ->> 'email'), ''), COALESCE(p_location, '{}'::jsonb),
    NULLIF(btrim(p_notes), ''), p_source,
    CASE WHEN p_status = 'confirmed' THEN now() END,
    CASE WHEN p_status = 'confirmed' THEN auth.uid() END,
    auth.uid()
  )
  RETURNING * INTO v_booking;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- A product given by id must be the store's own.
    IF NULLIF(v_item ->> 'product_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products
       WHERE id = (v_item ->> 'product_id')::uuid AND brand_id = p_brand_id
    ) THEN
      RAISE EXCEPTION 'BOOKING_PRODUCT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.booking_items (
      booking_id, brand_id, product_id, variant_id, name_en, name_ar, quantity, unit_price
    ) VALUES (
      v_booking.id, p_brand_id,
      NULLIF(v_item ->> 'product_id', '')::uuid,
      (SELECT pv.id FROM public.product_variants pv
        WHERE pv.id = NULLIF(v_item ->> 'variant_id', '')::uuid
          AND pv.product_id = NULLIF(v_item ->> 'product_id', '')::uuid),
      NULLIF(btrim(v_item ->> 'name_en'), ''),
      NULLIF(btrim(v_item ->> 'name_ar'), ''),
      COALESCE((v_item ->> 'quantity')::integer, 1),
      COALESCE((v_item ->> 'unit_price')::numeric, 0)
    );
    v_total := v_total
      + COALESCE((v_item ->> 'quantity')::integer, 1) * COALESCE((v_item ->> 'unit_price')::numeric, 0);
  END LOOP;

  -- Each service's capacity (the booking is written, so it is excluded from its own count).
  IF p_status = 'confirmed' AND NOT p_allow_overbook THEN
    PERFORM public.assert_booking_services_free(v_booking.id);
  END IF;

  UPDATE public.bookings SET total = v_total WHERE id = v_booking.id RETURNING * INTO v_booking;

  -- The discount a customer would get for this day (staff can change it on the booking).
  PERFORM public.apply_booking_discount(v_booking.id);
  SELECT * INTO v_booking FROM public.bookings WHERE id = v_booking.id;
  RETURN v_booking;
END;
$function$;

CREATE OR REPLACE FUNCTION public.place_booking_order(p_booking_id uuid, p_hold_token uuid, p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text, p_notes text DEFAULT NULL::text, p_fulfillment text DEFAULT 'delivery'::text, p_branch_id uuid DEFAULT NULL::uuid, p_digital_channel text DEFAULT NULL::text, p_digital_contact text DEFAULT NULL::text, p_promo_code text DEFAULT NULL::text, p_benefit_receipt_id uuid DEFAULT NULL::uuid, p_shipping_fee numeric DEFAULT NULL::numeric, p_shipping_zone text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
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
    SELECT * INTO v_state FROM public.booking_day_state_for(
      v_settings, v_booking.event_date, v_booking.id, false, NULL,
      public.booking_is_governed(v_booking.id));
    IF v_state.state <> 'available' THEN
      RAISE EXCEPTION 'BOOKING_HOLD_EXPIRED' USING ERRCODE = '23P01';
    END IF;
    -- ...and while its services have room.
    BEGIN
      PERFORM public.assert_booking_services_free(v_booking.id);
    EXCEPTION WHEN SQLSTATE '23P01' THEN
      RAISE EXCEPTION 'BOOKING_HOLD_EXPIRED' USING ERRCODE = '23P01';
    END;
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

  -- The booking's travel fee is its order's delivery fee (the order function
  -- charges at least the store's usual delivery fee). Shipping is not taxed,
  -- so the total moves by the difference.
  IF v_booking.travel_fee IS NOT NULL AND p_fulfillment = 'delivery' THEN
    UPDATE public.orders
       SET total = total - shipping + v_booking.travel_fee,
           shipping = v_booking.travel_fee
     WHERE id = (v_result ->> 'order_id')::uuid;
    v_result := v_result || jsonb_build_object('shipping', v_booking.travel_fee);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = (v_result ->> 'order_id')::uuid;
  v_result := v_result || jsonb_build_object('total', v_order.total);

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

  -- The booking's discount comes off the order too (with any promo code's).
  IF v_booking.discount_amount > 0 THEN
    UPDATE public.orders
       SET discount = LEAST(subtotal, discount + v_booking.discount_amount)
     WHERE id = v_order.id;
    PERFORM public.reprice_order_totals(v_order.id);
  END IF;

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

REVOKE ALL ON FUNCTION public.get_booking_discounts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booking_discounts(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.reprice_order_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_booking_discount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_booking_discount(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_booking_discount(uuid, numeric, text) TO authenticated;
