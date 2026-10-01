-- Migration: 20261002140000_service_options_and_offers.sql
--
-- Services vertical: what a professional booking site sells around a service.
--
--   * service_options      add-ons of a service, as the customer sees them: a
--                          staff attendant that comes with every booking, instant
--                          prints added by default (removable), magnets (optional),
--                          envelopes in blocks of 50 with cheaper blocks after the
--                          first. Mode: included (free, shown), required (priced,
--                          always), default_on (priced, the customer may remove it),
--                          optional (the customer adds it).
--   * booking_items        option lines (option_id) under the service line.
--   * products.extra_hour_price   a booking longer than the service's longest
--                          length costs its longest price plus this per extra hour.
--   * booking_discount_rules      "50% off the memory phone when booked with a
--                          booth" (requires_product_ids), offers that add to the
--                          best one (stackable), and offers for chosen event dates
--                          (event_from, event_to): a free gift on a date is 100%.
--   * store_gallery_items, store_faq_items   the store's past-events pictures and
--                          its questions and answers, grouped.
--
-- Also fixed here: a card checkout's deposit was worked out from the order's
-- total before the booking's discount came off it. Additive.

-- ── Add-ons of a service ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.service_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name_en text,
  name_ar text,
  description_en text,
  description_ar text,
  mode text NOT NULL DEFAULT 'optional'
    CHECK (mode IN ('included', 'required', 'default_on', 'optional')),
  -- A flat price, or the first block's price when tiers are set.
  price numeric(12, 3) NOT NULL DEFAULT 0 CHECK (price >= 0),
  -- {"step": 50, "prices": [15, 12.5, 10]}: blocks of `step` units; block n costs
  -- prices[n] and the last price repeats. Null: a flat price.
  tiers jsonb,
  max_quantity integer CHECK (max_quantity IS NULL OR max_quantity > 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (name_en IS NOT NULL OR name_ar IS NOT NULL),
  CHECK (
    tiers IS NULL OR (
      jsonb_typeof(tiers -> 'prices') = 'array'
      AND jsonb_array_length(tiers -> 'prices') BETWEEN 1 AND 20
      AND (tiers ->> 'step')::integer BETWEEN 1 AND 1000
    )
  )
);

CREATE INDEX IF NOT EXISTS service_options_product_idx ON public.service_options (product_id);

ALTER TABLE public.service_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand reads service options" ON public.service_options;
CREATE POLICY "brand reads service options" ON public.service_options
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS "public reads active service options" ON public.service_options;
CREATE POLICY "public reads active service options" ON public.service_options
  FOR SELECT TO anon, authenticated USING (
    is_active AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active)
  );
DROP POLICY IF EXISTS "inventory managers write service options" ON public.service_options;
CREATE POLICY "inventory managers write service options" ON public.service_options
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_inventory'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_inventory'));

-- An option on a package or service belongs to the same store.
CREATE OR REPLACE FUNCTION public.service_options_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
     WHERE p.id = NEW.product_id AND p.brand_id = NEW.brand_id AND p.item_kind = 'service'
  ) THEN
    RAISE EXCEPTION 'OPTION_PRODUCT_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS service_options_guard ON public.service_options;
CREATE TRIGGER service_options_guard
  BEFORE INSERT OR UPDATE ON public.service_options
  FOR EACH ROW EXECUTE FUNCTION public.service_options_guard();

ALTER TABLE public.booking_items
  ADD COLUMN IF NOT EXISTS option_id uuid REFERENCES public.service_options(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS option_quantity integer;

-- What an option costs for `p_quantity` units: free when included; a flat
-- price; or blocks of `step` units at the tier prices (the last repeats).
CREATE OR REPLACE FUNCTION public.service_option_price(
  p_mode text, p_price numeric, p_tiers jsonb, p_quantity integer
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_mode = 'included' THEN 0::numeric
    WHEN p_tiers IS NULL THEN COALESCE(p_price, 0)
    ELSE COALESCE((
      SELECT sum((p_tiers -> 'prices' -> (LEAST(b, jsonb_array_length(p_tiers -> 'prices')) - 1))::text::numeric)
        FROM generate_series(
               1, ceil(GREATEST(p_quantity, 0)::numeric / GREATEST(1, (p_tiers ->> 'step')::integer))::integer
             ) AS b
    ), 0)
  END;
$function$;

-- Writes the options a booked service line carries. `p_selected` is what the
-- customer chose ([{option_id, quantity}], null when they sent nothing).
-- Included and required options are always there; default_on ones unless the
-- customer sent a choice that leaves them out; optional ones only when chosen.
CREATE OR REPLACE FUNCTION public.apply_booking_options(
  p_booking_id uuid, p_parent_item_id uuid, p_product_id uuid,
  p_selected jsonb, p_explicit boolean
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid;
  v_opt record;
  v_chosen jsonb;
  v_on boolean;
  v_step integer;
  v_qty integer;
  v_price numeric(12, 3);
  v_total numeric(12, 3) := 0;
  v_sel jsonb := CASE WHEN jsonb_typeof(p_selected) = 'array' THEN p_selected ELSE '[]'::jsonb END;
BEGIN
  IF p_product_id IS NULL THEN RETURN 0; END IF;
  SELECT brand_id INTO v_brand FROM public.bookings WHERE id = p_booking_id;

  -- A choice of an option the service does not have is refused.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_sel) AS e
     WHERE NOT EXISTS (
       SELECT 1 FROM public.service_options o
        WHERE o.id::text = e ->> 'option_id' AND o.product_id = p_product_id
          AND o.brand_id = v_brand AND o.is_active
     )
  ) THEN
    RAISE EXCEPTION 'BOOKING_OPTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  FOR v_opt IN
    SELECT * FROM public.service_options
     WHERE product_id = p_product_id AND brand_id = v_brand AND is_active
     ORDER BY sort_order, created_at, id
  LOOP
    SELECT e INTO v_chosen FROM jsonb_array_elements(v_sel) AS e
     WHERE e ->> 'option_id' = v_opt.id::text LIMIT 1;
    v_on := CASE v_opt.mode
      WHEN 'included' THEN true
      WHEN 'required' THEN true
      WHEN 'default_on' THEN (NOT p_explicit) OR v_chosen IS NOT NULL
      ELSE v_chosen IS NOT NULL
    END;
    CONTINUE WHEN NOT v_on;

    v_qty := 1;
    IF v_opt.tiers IS NOT NULL THEN
      v_step := (v_opt.tiers ->> 'step')::integer;
      v_qty := COALESCE((v_chosen ->> 'quantity')::integer, v_step);
      IF v_qty < v_step OR v_qty % v_step <> 0
         OR (v_opt.max_quantity IS NOT NULL AND v_qty > v_opt.max_quantity) THEN
        RAISE EXCEPTION 'BOOKING_OPTION_QUANTITY_INVALID' USING ERRCODE = '22023';
      END IF;
    END IF;
    v_price := public.service_option_price(v_opt.mode, v_opt.price, v_opt.tiers, v_qty);
    v_total := v_total + v_price;

    INSERT INTO public.booking_items (
      booking_id, brand_id, product_id, variant_id, name_en, name_ar, quantity, unit_price,
      parent_item_id, option_id, option_quantity
    ) VALUES (
      p_booking_id, v_brand, NULL, NULL,
      CASE WHEN v_opt.tiers IS NOT NULL
           THEN COALESCE(v_opt.name_en, v_opt.name_ar) || ' × ' || v_qty
           ELSE COALESCE(v_opt.name_en, v_opt.name_ar) END,
      CASE WHEN v_opt.tiers IS NOT NULL
           THEN COALESCE(v_opt.name_ar, v_opt.name_en) || ' × ' || v_qty
           ELSE COALESCE(v_opt.name_ar, v_opt.name_en) END,
      1, v_price, p_parent_item_id, v_opt.id, CASE WHEN v_opt.tiers IS NOT NULL THEN v_qty END
    );
  END LOOP;
  RETURN v_total;
END;
$function$;

-- ── A booking longer than the longest length ───────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS extra_hour_price numeric(12, 3)
    CHECK (extra_hour_price IS NULL OR extra_hour_price >= 0);

COMMENT ON COLUMN public.products.extra_hour_price IS
  'A service priced by length: each hour beyond its longest length costs this (null: no longer bookings).';

-- ── Offers: with another service, stacking, chosen dates ────────────────────

ALTER TABLE public.booking_discount_rules
  ADD COLUMN IF NOT EXISTS requires_product_ids uuid[],
  ADD COLUMN IF NOT EXISTS stackable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_from date,
  ADD COLUMN IF NOT EXISTS event_to date;

ALTER TABLE public.booking_discount_rules DROP CONSTRAINT IF EXISTS booking_discount_rules_event_range;
ALTER TABLE public.booking_discount_rules
  ADD CONSTRAINT booking_discount_rules_event_range
  CHECK (event_to IS NULL OR event_from IS NULL OR event_to >= event_from);

-- ── The store's pictures and questions ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.store_gallery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  caption_en text,
  caption_ar text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_faq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  group_en text,
  group_ar text,
  question_en text,
  question_ar text,
  answer_en text,
  answer_ar text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (question_en IS NOT NULL OR question_ar IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS store_gallery_items_brand_idx ON public.store_gallery_items (brand_id, sort_order);
CREATE INDEX IF NOT EXISTS store_faq_items_brand_idx ON public.store_faq_items (brand_id, sort_order);

ALTER TABLE public.store_gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_faq_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public reads active gallery" ON public.store_gallery_items;
CREATE POLICY "public reads active gallery" ON public.store_gallery_items
  FOR SELECT TO anon, authenticated USING (is_active OR public.can_access_brand(brand_id));
DROP POLICY IF EXISTS "settings managers write gallery" ON public.store_gallery_items;
CREATE POLICY "settings managers write gallery" ON public.store_gallery_items
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));

DROP POLICY IF EXISTS "public reads active faq" ON public.store_faq_items;
CREATE POLICY "public reads active faq" ON public.store_faq_items
  FOR SELECT TO anon, authenticated USING (is_active OR public.can_access_brand(brand_id));
DROP POLICY IF EXISTS "settings managers write faq" ON public.store_faq_items;
CREATE POLICY "settings managers write faq" ON public.store_faq_items
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));

-- ── Package and governance helpers that now know about option lines ─────────

CREATE OR REPLACE FUNCTION public.expand_booking_packages(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.booking_items (
    booking_id, brand_id, product_id, variant_id, name_en, name_ar, quantity, unit_price, parent_item_id
  )
  SELECT bi.booking_id, bi.brand_id, c.id, NULL,
         COALESCE(c.name_en, c.name), COALESCE(c.name_ar, c.name),
         LEAST(100, bi.quantity * pi.quantity), 0, bi.id
    FROM public.booking_items bi
    JOIN public.products pk ON pk.id = bi.product_id AND pk.is_package
    JOIN public.service_package_items pi ON pi.package_id = pk.id
    JOIN public.products c ON c.id = pi.product_id
   WHERE bi.booking_id = p_booking_id
     AND bi.parent_item_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.booking_items k WHERE k.parent_item_id = bi.id AND k.option_id IS NULL
     )
   ORDER BY bi.id, pi.sort_order, pi.created_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.booking_is_governed(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
           SELECT 1
             FROM public.booking_items bi
             LEFT JOIN public.products p ON p.id = bi.product_id
            WHERE bi.booking_id = p_booking_id AND bi.option_id IS NULL
              AND NOT COALESCE(p.is_package, false)
         )
     AND NOT EXISTS (
       SELECT 1
         FROM public.booking_items bi
         LEFT JOIN public.products p ON p.id = bi.product_id
        WHERE bi.booking_id = p_booking_id AND bi.option_id IS NULL
          AND NOT COALESCE(p.is_package, false)
          AND (bi.product_id IS NULL OR p.booking_capacity IS NULL)
     );
$function$;

-- ── The best offer, and the ones that add to it ─────────────────────────────

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
  v_base numeric(12, 3);
  v_sum numeric(12, 3);
  v_first uuid;
  v_names_en text;
  v_names_ar text;
  v_amount numeric(12, 3) := 0;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT timezone INTO v_tz FROM public.booking_settings WHERE brand_id = v_booking.brand_id;
  v_today := (now() AT TIME ZONE COALESCE(v_tz, 'Asia/Bahrain'))::date;
  v_lead := v_booking.event_date - v_today;

  SELECT COALESCE(sum(line_total), 0) INTO v_services
    FROM public.booking_items WHERE booking_id = v_booking.id;
  -- An offer takes off the services, not the add-ons.
  SELECT COALESCE(sum(line_total), 0) INTO v_base
    FROM public.booking_items WHERE booking_id = v_booking.id AND option_id IS NULL;

  WITH matched AS (
    SELECT r.id, r.name_en, r.name_ar, r.stackable, r.min_days, r.created_at,
           CASE WHEN r.kind = 'percent'
                THEN round(s.applicable * r.value / 100, 3)
                ELSE LEAST(r.value, s.applicable) END AS amount
      FROM public.booking_discount_rules r
      CROSS JOIN LATERAL (
        SELECT COALESCE(sum(bi.line_total), 0) AS applicable
          FROM public.booking_items bi
         WHERE bi.booking_id = v_booking.id AND bi.option_id IS NULL
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
       AND (r.event_from IS NULL OR v_booking.event_date >= r.event_from)
       AND (r.event_to IS NULL OR v_booking.event_date <= r.event_to)
       AND (r.requires_product_ids IS NULL OR cardinality(r.requires_product_ids) = 0
            OR EXISTS (
              SELECT 1 FROM public.booking_items k
               WHERE k.booking_id = v_booking.id AND k.product_id = ANY (r.requires_product_ids)
            ))
       AND s.applicable > 0
  ), ranked AS (
    SELECT m.*,
           CASE WHEN NOT m.stackable
                THEN row_number() OVER (
                       PARTITION BY m.stackable
                       ORDER BY m.amount DESC, m.min_days DESC, m.created_at, m.id)
           END AS rn
      FROM matched m
  ), picked AS (
    SELECT * FROM ranked WHERE stackable OR rn = 1
  )
  SELECT COALESCE(sum(amount), 0),
         (array_agg(id ORDER BY stackable, amount DESC, id))[1],
         string_agg(name_en, ' + ' ORDER BY stackable, amount DESC, id) FILTER (WHERE name_en IS NOT NULL),
         string_agg(name_ar, ' + ' ORDER BY stackable, amount DESC, id) FILTER (WHERE name_ar IS NOT NULL)
    INTO v_sum, v_first, v_names_en, v_names_ar
    FROM picked
   WHERE amount > 0;

  IF v_sum > 0 THEN
    v_amount := LEAST(v_sum, v_base);
    UPDATE public.bookings SET
      discount_amount = v_amount,
      discount_rule_id = v_first,
      discount_label_en = v_names_en,
      discount_label_ar = v_names_ar,
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

DROP FUNCTION IF EXISTS public.get_booking_discounts(uuid);
CREATE FUNCTION public.get_booking_discounts(p_brand_id uuid)
RETURNS TABLE (
  id uuid, name_en text, name_ar text, kind text, value numeric,
  min_days integer, max_days integer, weekdays smallint[], product_ids uuid[],
  valid_from date, valid_to date,
  requires_product_ids uuid[], stackable boolean, event_from date, event_to date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.id, r.name_en, r.name_ar, r.kind, r.value, r.min_days, r.max_days,
         r.weekdays, r.product_ids, r.valid_from, r.valid_to,
         r.requires_product_ids, r.stackable, r.event_from, r.event_to
    FROM public.booking_discount_rules r
   WHERE r.brand_id = p_brand_id
     AND r.is_active
     AND public.bookings_enabled(p_brand_id)
   ORDER BY r.min_days, r.created_at;
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
  v_rule_items jsonb;
  v_eff_minutes integer;
  v_extra numeric(12, 3);
  v_extra_price numeric(12, 3);
  v_max_len integer;
  v_line_id uuid;
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
  -- Capacity and notice are checked on the services themselves: a package is its included ones.
  v_rule_items := public.booking_rule_items(p_brand_id, p_items);
  -- A service with its own capacity is limited by that, not by the store's
  -- daily places; one with its own notice by that notice.
  SELECT * INTO v_state FROM public.booking_day_state_for(
    v_settings, p_day, NULL, false,
    public.booking_items_notice_hours(p_brand_id, v_rule_items),
    public.booking_items_all_governed(p_brand_id, v_rule_items));
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
    -- A booking longer than the service's longest length: that length's price
    -- plus the service's price for each extra hour.
    v_eff_minutes := p_duration_minutes;
    v_extra := 0;
    SELECT p.extra_hour_price,
           (SELECT max(dv.duration_minutes) FROM public.product_variants dv WHERE dv.product_id = p.id)
      INTO v_extra_price, v_max_len
      FROM public.products p
     WHERE p.id = NULLIF(v_item ->> 'product_id', '')::uuid AND p.brand_id = p_brand_id;
    IF v_extra_price IS NOT NULL AND v_max_len IS NOT NULL AND p_duration_minutes > v_max_len THEN
      v_eff_minutes := v_max_len;
      v_extra := ceil((p_duration_minutes - v_max_len) / 60.0) * v_extra_price;
    END IF;

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
         ) THEN v.duration_minutes = v_eff_minutes
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
      v_quantity, v_product.price + v_extra
    )
    RETURNING id INTO v_line_id;
    v_total := v_total + v_quantity * (v_product.price + v_extra);
    -- The add-ons the customer chose (and the ones that come with it).
    PERFORM public.apply_booking_options(
      v_booking.id, v_line_id, v_product.id, v_item -> 'options',
      jsonb_typeof(v_item -> 'options') = 'array');
  END LOOP;

  -- A booked package puts its included services under it.
  PERFORM public.expand_booking_packages(v_booking.id);

  -- Each service's own notice and capacity (this booking does not count yet:
  -- a request takes no place until it is held or confirmed).
  PERFORM public.assert_booking_items_notice(p_brand_id, v_rule_items, v_window.starts_at);
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
    'options_total', COALESCE((
      SELECT sum(line_total) FROM public.booking_items
       WHERE booking_id = v_booking.id AND option_id IS NOT NULL), 0),
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
  v_line_id uuid;
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
      v_settings, p_day, NULL, true, NULL, public.booking_items_all_governed(p_brand_id, public.booking_rule_items(p_brand_id, p_items)));
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
    )
    RETURNING id INTO v_line_id;
    -- The add-ons chosen for it (and the ones that come with it).
    PERFORM public.apply_booking_options(
      v_booking.id, v_line_id, NULLIF(v_item ->> 'product_id', '')::uuid, v_item -> 'options',
      jsonb_typeof(v_item -> 'options') = 'array');
    v_total := v_total
      + COALESCE((v_item ->> 'quantity')::integer, 1) * COALESCE((v_item ->> 'unit_price')::numeric, 0);
  END LOOP;

  -- A booked package puts its included services under it.
  PERFORM public.expand_booking_packages(v_booking.id);

  -- Each service's capacity (the booking is written, so it is excluded from its own count).
  IF p_status = 'confirmed' AND NOT p_allow_overbook THEN
    PERFORM public.assert_booking_services_free(v_booking.id);
  END IF;

  UPDATE public.bookings SET total = v_total WHERE id = v_booking.id RETURNING * INTO v_booking;

  -- The discount a customer would get for this day (staff can change it on the booking).
  PERFORM public.apply_booking_discount(v_booking.id);
  SELECT * INTO v_booking FROM public.bookings WHERE id = v_booking.id;

  -- Entered as confirmed: invoiced from the start.
  IF p_status = 'confirmed' THEN
    PERFORM public.create_booking_order(v_booking.id);
    SELECT * INTO v_booking FROM public.bookings WHERE id = v_booking.id;
  END IF;
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
  v_options numeric(12, 3) := 0;
  v_gap numeric(12, 3) := 0;
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
     AND bi.parent_item_id IS NULL
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

  -- The order prices each service at its variant; the booking may price it higher
  -- (extra hours beyond its longest length). The difference is its own line.
  v_gap := COALESCE((SELECT sum(bi.line_total) FROM public.booking_items bi
                      WHERE bi.booking_id = v_booking.id AND bi.parent_item_id IS NULL), 0)
         - COALESCE((SELECT sum(oi.line_total) FROM public.order_items oi
                      WHERE oi.order_id = v_order.id), 0);

  -- What a booked package includes, listed free on the order.
  INSERT INTO public.order_items (
    order_id, brand_id, user_id, product_id, description, quantity, unit_price, line_total, location
  )
  SELECT v_order.id, v_order.brand_id, v_order.user_id, bi.product_id,
         '↳ ' || COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Service'),
         bi.quantity, 0, 0, 'main'
    FROM public.booking_items bi
   WHERE bi.booking_id = v_booking.id AND bi.parent_item_id IS NOT NULL AND bi.option_id IS NULL
   ORDER BY bi.id;

  -- The add-ons the customer chose, priced on the order.
  INSERT INTO public.order_items (
    order_id, brand_id, user_id, product_id, description, quantity, unit_price, line_total, location
  )
  SELECT v_order.id, v_order.brand_id, v_order.user_id, NULL,
         '+ ' || COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Add-on'),
         1, bi.unit_price, bi.line_total, 'main'
    FROM public.booking_items bi
   WHERE bi.booking_id = v_booking.id AND bi.option_id IS NOT NULL
   ORDER BY bi.id;
  SELECT COALESCE(sum(line_total), 0) INTO v_options
    FROM public.booking_items WHERE booking_id = v_booking.id AND option_id IS NOT NULL;
  IF v_gap > 0.0005 THEN
    INSERT INTO public.order_items (
      order_id, brand_id, user_id, product_id, description, quantity, unit_price, line_total, location
    ) VALUES (v_order.id, v_order.brand_id, v_order.user_id, NULL, '+ Extra time', 1, v_gap, v_gap, 'main');
    v_options := v_options + v_gap;
  END IF;
  IF v_options > 0 THEN
    UPDATE public.orders SET subtotal = subtotal + v_options WHERE id = v_order.id;
    PERFORM public.reprice_order_totals(v_order.id);
  END IF;

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

  -- The totals as they stand now (the deposit is a share of this, after the offer).
  SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
  v_result := v_result || jsonb_build_object('total', v_order.total);

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

CREATE OR REPLACE FUNCTION public.create_booking_order(p_booking_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_vat_inclusive boolean := false;
  v_currency text := 'BHD';
  v_order_id uuid;
  v_subtotal numeric(12, 3);
  v_discount numeric(12, 3);
  v_shipping numeric(12, 3);
  v_taxable numeric(12, 3);
  v_tax_rate numeric;
  v_tax numeric(12, 3);
  v_total numeric(12, 3);
  v_status text;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR NOT (
    public.can_access_brand(v_booking.brand_id) AND public.has_permission('manage_orders')
  ) THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Already invoiced: the same order.
  IF v_booking.order_id IS NOT NULL THEN
    RETURN v_booking.order_id;
  END IF;

  IF v_booking.status IN ('hold', 'expired') THEN
    RAISE EXCEPTION 'BOOKING_TRANSITION_INVALID' USING ERRCODE = '22023';
  END IF;

  v_tax_rate := 0;
  SELECT COALESCE(default_tax_rate, 0), COALESCE(vat_inclusive, false),
         COALESCE(NULLIF(currency, ''), 'BHD')
    INTO v_tax_rate, v_vat_inclusive, v_currency
    FROM public.business_settings WHERE brand_id = v_booking.brand_id;

  SELECT COALESCE(sum(line_total), 0) INTO v_subtotal
    FROM public.booking_items WHERE booking_id = v_booking.id;
  v_shipping := COALESCE(v_booking.travel_fee, 0);
  v_discount := LEAST(v_subtotal, COALESCE(v_booking.discount_amount, 0));
  v_taxable := v_subtotal - v_discount;
  IF v_vat_inclusive THEN
    v_tax := v_taxable - (v_taxable / (1 + (v_tax_rate / 100)));
    v_total := v_taxable + v_shipping;
  ELSE
    v_tax := (v_taxable * v_tax_rate) / 100;
    v_total := v_taxable + v_tax + v_shipping;
  END IF;

  v_status := CASE WHEN v_booking.status = 'cancelled' THEN 'cancelled'
                   WHEN v_booking.status IN ('confirmed', 'completed') THEN 'confirmed'
                   ELSE 'pending' END;

  INSERT INTO public.orders (
    brand_id, user_id, customer_id, invoice_number, status, fulfillment_method,
    customer_name_snapshot, customer_phone_snapshot, customer_email_snapshot,
    notes, subtotal, discount, shipping, tax_rate, tax_amount, total, currency,
    order_date, payment_status, advance_paid, channel
  ) VALUES (
    v_booking.brand_id, auth.uid(), v_booking.customer_id, 0, v_status, 'appointment',
    v_booking.customer_name, v_booking.customer_phone, v_booking.customer_email,
    NULLIF(btrim(concat_ws(E'\n', CASE WHEN v_discount > 0 THEN '🏷 ' || COALESCE(v_booking.discount_label_en, v_booking.discount_label_ar, 'Discount') END, v_booking.notes)), ''),
    v_subtotal, v_discount, v_shipping, v_tax_rate, round(v_tax, 3), round(v_total, 3), v_currency,
    v_booking.event_date, 'unpaid', 0, 'admin'
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id, brand_id, user_id, product_id, variant_id, description, quantity,
    unit_price, line_total, location
  )
  SELECT v_order_id, v_booking.brand_id, auth.uid(), bi.product_id, bi.variant_id,
         CASE WHEN bi.option_id IS NOT NULL THEN '+ '
              WHEN bi.parent_item_id IS NOT NULL THEN '↳ '
              ELSE '' END
           || COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Service'),
         bi.quantity, bi.unit_price, bi.line_total, 'main'
    FROM public.booking_items bi
   WHERE bi.booking_id = v_booking.id
   ORDER BY bi.id;

  UPDATE public.bookings SET order_id = v_order_id, updated_at = now() WHERE id = v_booking.id;
  RETURN v_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_booking_options(uuid, uuid, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_booking_discounts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booking_discounts(uuid) TO anon, authenticated;
