-- Migration: 20261002120000_service_packages.sql
--
-- Services vertical: packages. A package is a service made of other services
-- at its own price (its variants: one per length, like any service), for
-- example "Wedding night": photo booth + prints + backdrop at less than the
-- three apart.
--
--   products.is_package         the service is a package;
--   service_package_items       its included services and how many of each;
--   booking_items.parent_item_id  a booked package becomes its own priced line
--                               plus one unpriced line per included service,
--                               so every included service keeps its own
--                               capacity, setup time and notice: a booked
--                               package blocks the booth and the prints.
--
-- The package line carries the price; included lines are free and listed on the
-- order as "↳ name". Availability and free start times of a package are those of
-- its included services. A package may not include a package, and only
-- services of the same store can be included. Additive.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_package boolean NOT NULL DEFAULT false;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_package_is_service;
ALTER TABLE public.products
  ADD CONSTRAINT products_package_is_service CHECK (NOT is_package OR item_kind = 'service');

COMMENT ON COLUMN public.products.is_package IS
  'A service made of other services (service_package_items) at its own price.';

CREATE TABLE IF NOT EXISTS public.service_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, product_id),
  CHECK (package_id <> product_id)
);

CREATE INDEX IF NOT EXISTS service_package_items_package_idx
  ON public.service_package_items (package_id);
CREATE INDEX IF NOT EXISTS service_package_items_product_idx
  ON public.service_package_items (product_id);

-- Both ends are services of the store; the package is a package; no nesting.
CREATE OR REPLACE FUNCTION public.service_package_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
     WHERE p.id = NEW.package_id AND p.brand_id = NEW.brand_id AND p.is_package
  ) THEN
    RAISE EXCEPTION 'PACKAGE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
     WHERE p.id = NEW.product_id AND p.brand_id = NEW.brand_id
       AND p.item_kind = 'service' AND NOT p.is_package
  ) THEN
    RAISE EXCEPTION 'PACKAGE_ITEM_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS service_package_items_guard ON public.service_package_items;
CREATE TRIGGER service_package_items_guard
  BEFORE INSERT OR UPDATE ON public.service_package_items
  FOR EACH ROW EXECUTE FUNCTION public.service_package_items_guard();

-- A product that holds packages cannot become one of them (no nesting).
CREATE OR REPLACE FUNCTION public.products_package_nesting_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_package AND EXISTS (
    SELECT 1 FROM public.service_package_items WHERE product_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'PACKAGE_ITEM_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS products_package_nesting_guard ON public.products;
CREATE TRIGGER products_package_nesting_guard
  BEFORE INSERT OR UPDATE OF is_package ON public.products
  FOR EACH ROW WHEN (NEW.is_package)
  EXECUTE FUNCTION public.products_package_nesting_guard();

ALTER TABLE public.service_package_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand reads package items" ON public.service_package_items;
CREATE POLICY "brand reads package items" ON public.service_package_items
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
-- The storefront shows what a package includes.
DROP POLICY IF EXISTS "public reads active package items" ON public.service_package_items;
CREATE POLICY "public reads active package items" ON public.service_package_items
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = package_id AND p.is_active AND p.is_package)
  );
DROP POLICY IF EXISTS "inventory managers write package items" ON public.service_package_items;
CREATE POLICY "inventory managers write package items" ON public.service_package_items
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_inventory'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_inventory'));

ALTER TABLE public.booking_items
  ADD COLUMN IF NOT EXISTS parent_item_id uuid REFERENCES public.booking_items(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS booking_items_parent_idx
  ON public.booking_items (parent_item_id) WHERE parent_item_id IS NOT NULL;

-- ── Package helpers ─────────────────────────────────────────────────────────

-- The services a list of products stands for: packages become their included
-- services (this is what availability and free start times look at).
CREATE OR REPLACE FUNCTION public.booking_expand_product_ids(p_brand_id uuid, p_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT x.id), ARRAY[]::uuid[])
    FROM (
      SELECT p.id
        FROM public.products p
       WHERE p.brand_id = p_brand_id AND p.id = ANY (COALESCE(p_ids, ARRAY[]::uuid[]))
         AND NOT p.is_package
      UNION
      SELECT i.product_id
        FROM public.service_package_items i
        JOIN public.products pk ON pk.id = i.package_id AND pk.is_package
       WHERE i.brand_id = p_brand_id AND i.package_id = ANY (COALESCE(p_ids, ARRAY[]::uuid[]))
    ) AS x;
$function$;

-- A request's items (jsonb [{product_id, quantity...}]) with each package
-- replaced by its included services: what capacity and notice are checked on.
CREATE OR REPLACE FUNCTION public.booking_rule_items(p_brand_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(x.item), '[]'::jsonb)
    FROM (
      SELECT i AS item
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
             ) AS i
       WHERE NOT EXISTS (
         SELECT 1 FROM public.products p
          WHERE p.id = NULLIF(i ->> 'product_id', '')::uuid
            AND p.brand_id = p_brand_id AND p.is_package
       )
      UNION ALL
      SELECT jsonb_build_object(
               'product_id', pi.product_id,
               'quantity', pi.quantity * GREATEST(1, COALESCE((i ->> 'quantity')::integer, 1))
             )
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
             ) AS i
        JOIN public.products pk
          ON pk.id = NULLIF(i ->> 'product_id', '')::uuid AND pk.brand_id = p_brand_id AND pk.is_package
        JOIN public.service_package_items pi ON pi.package_id = pk.id
    ) AS x;
$function$;

-- Writes a booked package's included services under it, unpriced, so each
-- holds its own capacity. Safe to call again: a package line already
-- expanded is left alone.
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
     AND NOT EXISTS (SELECT 1 FROM public.booking_items k WHERE k.parent_item_id = bi.id)
   ORDER BY bi.id, pi.sort_order, pi.created_at;
END;
$function$;

-- A booking is governed by its services' capacities when every real service
-- (not a package line) has one. A package is its included services.
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
            WHERE bi.booking_id = p_booking_id AND NOT COALESCE(p.is_package, false)
         )
     AND NOT EXISTS (
       SELECT 1
         FROM public.booking_items bi
         LEFT JOIN public.products p ON p.id = bi.product_id
        WHERE bi.booking_id = p_booking_id
          AND NOT COALESCE(p.is_package, false)
          AND (bi.product_id IS NULL OR p.booking_capacity IS NULL)
     );
$function$;

CREATE OR REPLACE FUNCTION public.get_service_availability(p_brand_id uuid, p_product_ids uuid[], p_from date, p_to date, p_duration_minutes integer DEFAULT NULL::integer)
 RETURNS TABLE(product_id uuid, day date, state text, remaining integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.booking_settings;
  v_product record;
  v_day date;
  v_state record;
  v_duration integer;
  v_free integer;
  v_ids uuid[];
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62
     OR p_product_ids IS NULL OR cardinality(p_product_ids) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'BOOKING_RANGE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT public.bookings_enabled(p_brand_id) THEN
    RETURN;
  END IF;
  SELECT * INTO v_settings FROM public.booking_settings WHERE brand_id = p_brand_id;
  v_duration := COALESCE(p_duration_minutes, v_settings.min_duration_minutes);
  -- A package is its included services.
  v_ids := public.booking_expand_product_ids(p_brand_id, p_product_ids);

  FOR v_product IN
    SELECT p.id, p.booking_capacity AS capacity, p.booking_scope AS scope,
           p.booking_notice_hours AS notice
      FROM public.products p
     WHERE p.brand_id = p_brand_id AND p.id = ANY (v_ids) AND p.is_active
  LOOP
    FOR v_day IN SELECT d::date FROM generate_series(p_from, p_to, interval '1 day') AS d LOOP
      SELECT * INTO v_state FROM public.booking_day_state_for(
        v_settings, v_day, NULL, false, v_product.notice, v_product.capacity IS NOT NULL);
      product_id := v_product.id;
      day := v_day;
      IF v_state.state <> 'available' THEN
        state := v_state.state;
        remaining := 0;
      ELSIF v_product.capacity IS NULL THEN
        state := 'available';
        remaining := v_state.remaining;
      ELSIF v_product.scope = 'day' THEN
        v_free := v_product.capacity
                  - public.booking_service_units_used(p_brand_id, v_product.id, v_day, NULL, NULL, NULL);
        state := CASE WHEN v_free > 0 THEN 'available' ELSE 'full' END;
        remaining := GREATEST(v_free, 0);
      ELSE
        SELECT count(*)::integer INTO v_free
          FROM public.booking_service_free_starts(v_settings, v_product.id, v_day, v_duration) AS f
         WHERE f.free;
        state := CASE WHEN v_free > 0 THEN 'available' ELSE 'full' END;
        remaining := v_free;
      END IF;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_service_free_starts(p_brand_id uuid, p_day date, p_product_ids uuid[], p_duration_minutes integer)
 RETURNS TABLE(start_time time without time zone, free boolean, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.booking_settings;
  v_items jsonb;
  v_ids uuid[];
  v_state record;
  v_product record;
  v_minute integer;
  v_last integer;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_day IS NULL OR p_product_ids IS NULL OR cardinality(p_product_ids) NOT BETWEEN 1 AND 20
     OR p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 15 AND 1440 THEN
    RAISE EXCEPTION 'BOOKING_RANGE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT public.bookings_enabled(p_brand_id) THEN
    RETURN;
  END IF;
  SELECT * INTO v_settings FROM public.booking_settings WHERE brand_id = p_brand_id;

  -- A package is its included services.
  v_ids := public.booking_expand_product_ids(p_brand_id, p_product_ids);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', pid)), '[]'::jsonb)
    INTO v_items FROM unnest(v_ids) AS pid;
  SELECT * INTO v_state FROM public.booking_day_state_for(
    v_settings, p_day, NULL, false,
    public.booking_items_notice_hours(p_brand_id, v_items),
    public.booking_items_all_governed(p_brand_id, v_items));

  v_minute := (extract(epoch FROM v_settings.open_time)::integer) / 60;
  v_last := (extract(epoch FROM v_settings.last_start_time)::integer) / 60;
  WHILE v_minute <= v_last LOOP
    start_time := make_time(v_minute / 60, v_minute % 60, 0);
    free := true;
    reason := NULL;
    IF v_state.state <> 'available' THEN
      free := false;
      reason := v_state.state;
    ELSE
      v_start := (p_day + start_time) AT TIME ZONE v_settings.timezone;
      v_end := v_start + make_interval(mins => p_duration_minutes);
      FOR v_product IN
        SELECT p.id, p.booking_notice_hours AS notice
          FROM public.products p
         WHERE p.brand_id = p_brand_id AND p.id = ANY (v_ids) AND p.is_active
      LOOP
        IF v_product.notice IS NOT NULL AND v_start < now() + make_interval(hours => v_product.notice) THEN
          free := false;
          reason := 'notice';
          EXIT;
        ELSIF NOT public.booking_service_has_room(
                 p_brand_id, v_product.id, p_day, v_start, v_end, 1, NULL) THEN
          free := false;
          reason := 'taken';
          EXIT;
        END IF;
      END LOOP;
    END IF;
    RETURN NEXT;
    v_minute := v_minute + v_settings.slot_minutes;
  END LOOP;
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
  v_rule_items jsonb;
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
    );
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

CREATE OR REPLACE FUNCTION public.hold_booking(p_brand_id uuid, p_day date, p_start time without time zone, p_duration_minutes integer, p_items jsonb, p_customer jsonb, p_location jsonb DEFAULT '{}'::jsonb, p_notes text DEFAULT NULL::text)
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
      WHERE bi.booking_id = v_booking.id AND bi.parent_item_id IS NULL
    )
  );
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

  -- What a booked package includes, listed free on the order.
  INSERT INTO public.order_items (
    order_id, brand_id, user_id, product_id, description, quantity, unit_price, line_total, location
  )
  SELECT v_order.id, v_order.brand_id, v_order.user_id, bi.product_id,
         '↳ ' || COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Service'),
         bi.quantity, 0, 0, 'main'
    FROM public.booking_items bi
   WHERE bi.booking_id = v_booking.id AND bi.parent_item_id IS NOT NULL
   ORDER BY bi.id;
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
         CASE WHEN bi.parent_item_id IS NOT NULL THEN '↳ ' ELSE '' END
           || COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Service'),
         bi.quantity, bi.unit_price, bi.line_total, 'main'
    FROM public.booking_items bi
   WHERE bi.booking_id = v_booking.id
   ORDER BY bi.id;

  UPDATE public.bookings SET order_id = v_order_id, updated_at = now() WHERE id = v_booking.id;
  RETURN v_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.booking_expand_product_ids(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_rule_items(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expand_booking_packages(uuid) FROM PUBLIC, anon, authenticated;
