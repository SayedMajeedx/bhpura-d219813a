-- Migration: 20261001180000_booking_resource_capacity.sql
--
-- Booking engine v2 (docs/services-vertical-plan.md): availability by what
-- is being booked, not only by the day.
--
-- Until now the engine counted bookings per day for the whole store
-- (booking_settings.daily_capacity) and ignored time: two bookings of one
-- pool an hour apart were "two places on the day", and a store with two photo
-- booths could not say so. A service now carries its own rules:
--
--   products.booking_capacity       how many bookings of it may run at once
--                                   (2 booths, 1 pool). NULL = not limited by
--                                   itself: the store's daily places apply, as
--                                   before.
--   products.booking_scope          'day': a booking keeps its unit for the
--                                   whole day (an event); 'time': only for its
--                                   own hours (a pool, a court, a chair).
--   products.booking_buffer_minutes setup and clean-up kept free before and
--                                   after a booking of it ('time' scope).
--   products.booking_notice_hours   its own minimum notice, in place of the
--                                   store's lead days (same-day pool, booth
--                                   two days ahead).
--
-- A booking whose every service has its own capacity is limited by those
-- capacities and does not use up the store's daily places; any other booking
-- still does. Nothing changes for a store that sets none of this.
--
-- The write functions (request, staff create, reschedule, confirm, and
-- paying an expired hold) are redefined from their live definitions
-- (2026-10-01) with only the capacity and notice checks added, so the
-- storefront, the admin and the checkout all answer to the same rules, under
-- the store's settings lock. Two read functions give the storefront the same
-- answers before the customer commits: the free days for the chosen services,
-- and the free start times of a day.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS booking_capacity integer
    CHECK (booking_capacity IS NULL OR booking_capacity BETWEEN 1 AND 50),
  ADD COLUMN IF NOT EXISTS booking_scope text NOT NULL DEFAULT 'day'
    CHECK (booking_scope IN ('day', 'time')),
  ADD COLUMN IF NOT EXISTS booking_buffer_minutes integer NOT NULL DEFAULT 0
    CHECK (booking_buffer_minutes BETWEEN 0 AND 480),
  ADD COLUMN IF NOT EXISTS booking_notice_hours integer
    CHECK (booking_notice_hours IS NULL OR booking_notice_hours BETWEEN 0 AND 8760);

COMMENT ON COLUMN public.products.booking_capacity IS
  'How many bookings of this service may run at once (NULL: limited only by the store''s daily places).';
COMMENT ON COLUMN public.products.booking_scope IS
  'day: a booking keeps its unit all day; time: only for its own hours.';
COMMENT ON COLUMN public.products.booking_buffer_minutes IS
  'Setup and clean-up time kept free before and after a booking of this service (time scope).';
COMMENT ON COLUMN public.products.booking_notice_hours IS
  'This service''s own minimum notice in hours (NULL: the store''s lead days).';

CREATE INDEX IF NOT EXISTS booking_items_product_booking_idx
  ON public.booking_items (product_id, booking_id) WHERE product_id IS NOT NULL;

-- Two windows clash when they overlap or come closer than the buffer.
CREATE OR REPLACE FUNCTION public.booking_windows_overlap(
  p_start_a timestamptz, p_end_a timestamptz,
  p_start_b timestamptz, p_end_b timestamptz,
  p_buffer_minutes integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT p_start_a < p_end_b + make_interval(mins => COALESCE(p_buffer_minutes, 0))
     AND p_end_a + make_interval(mins => COALESCE(p_buffer_minutes, 0)) > p_start_b;
$function$;

-- Units of a service in use that clash with a day (day scope) or a window
-- (time scope): confirmed and completed bookings, and holds still running.
CREATE OR REPLACE FUNCTION public.booking_service_units_used(
  p_brand_id uuid, p_product_id uuid, p_day date,
  p_start timestamptz, p_end timestamptz, p_except uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(sum(bi.quantity), 0)::integer
    FROM public.booking_items bi
    JOIN public.bookings b ON b.id = bi.booking_id
    JOIN public.products p ON p.id = bi.product_id AND p.brand_id = p_brand_id
   WHERE bi.brand_id = p_brand_id
     AND bi.product_id = p_product_id
     AND (p_except IS NULL OR b.id <> p_except)
     AND (b.status IN ('confirmed', 'completed')
          OR (b.status = 'hold' AND b.hold_expires_at > now()))
     AND CASE
           WHEN p.booking_scope = 'day' THEN b.event_date = p_day
           ELSE public.booking_windows_overlap(
                  b.starts_at, b.ends_at, p_start, p_end, p.booking_buffer_minutes)
         END;
$function$;

-- Whether a service has room for `p_quantity` more units then. A service
-- with no capacity of its own always does (the store's places limit it).
CREATE OR REPLACE FUNCTION public.booking_service_has_room(
  p_brand_id uuid, p_product_id uuid, p_day date,
  p_start timestamptz, p_end timestamptz,
  p_quantity integer DEFAULT 1, p_except uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT CASE
             WHEN p.booking_capacity IS NULL THEN true
             ELSE public.booking_service_units_used(
                    p_brand_id, p.id, p_day, p_start, p_end, p_except)
                  + COALESCE(p_quantity, 1) <= p.booking_capacity
           END
      FROM public.products p
     WHERE p.id = p_product_id AND p.brand_id = p_brand_id
  ), true);
$function$;

-- A booking is governed by its services' capacities, not by the store's daily
-- places, when it has services and every one has a capacity of its own.
CREATE OR REPLACE FUNCTION public.booking_is_governed(p_booking_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.booking_items WHERE booking_id = p_booking_id)
     AND NOT EXISTS (
       SELECT 1
         FROM public.booking_items bi
         LEFT JOIN public.products p ON p.id = bi.product_id
        WHERE bi.booking_id = p_booking_id
          AND (bi.product_id IS NULL OR p.booking_capacity IS NULL)
     );
$function$;

-- The same, for a request's items (jsonb [{product_id, ...}]) before they exist.
CREATE OR REPLACE FUNCTION public.booking_items_all_governed(p_brand_id uuid, p_items jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_typeof(p_items) = 'array'
     AND jsonb_array_length(p_items) > 0
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(p_items) AS i
        WHERE NOT EXISTS (
          SELECT 1 FROM public.products p
           WHERE p.id = NULLIF(i ->> 'product_id', '')::uuid
             AND p.brand_id = p_brand_id
             AND p.booking_capacity IS NOT NULL
        )
     );
$function$;

-- The notice that replaces the store's lead days: the longest of the items'
-- own, when every item has one (otherwise the store's lead days apply, and
-- each item's own notice is still enforced by assert_booking_items_notice).
CREATE OR REPLACE FUNCTION public.booking_items_notice_hours(p_brand_id uuid, p_items jsonb)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN count(*) > 0 AND bool_and(p.booking_notice_hours IS NOT NULL)
              THEN max(p.booking_notice_hours) END
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
         ) AS i
    JOIN public.products p
      ON p.id = NULLIF(i ->> 'product_id', '')::uuid AND p.brand_id = p_brand_id;
$function$;

-- Each item's own minimum notice, for a booking that starts at p_starts_at.
CREATE OR REPLACE FUNCTION public.assert_booking_items_notice(
  p_brand_id uuid, p_items jsonb, p_starts_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_notice integer;
BEGIN
  SELECT max(p.booking_notice_hours) INTO v_notice
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
         ) AS i
    JOIN public.products p
      ON p.id = NULLIF(i ->> 'product_id', '')::uuid AND p.brand_id = p_brand_id;
  IF v_notice IS NOT NULL AND p_starts_at < now() + make_interval(hours => v_notice) THEN
    RAISE EXCEPTION 'BOOKING_DAY_PAST' USING ERRCODE = '23P01';
  END IF;
END;
$function$;

-- A booking (already written, with its window and items) must fit each of its
-- services' capacity, not counting itself. Raises BOOKING_SERVICE_FULL with
-- the service's id as the detail.
CREATE OR REPLACE FUNCTION public.assert_booking_services_free(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_row record;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  FOR v_row IN
    SELECT bi.product_id, sum(bi.quantity)::integer AS quantity
      FROM public.booking_items bi
     WHERE bi.booking_id = p_booking_id AND bi.product_id IS NOT NULL
     GROUP BY bi.product_id
  LOOP
    IF NOT public.booking_service_has_room(
         v_booking.brand_id, v_row.product_id, v_booking.event_date,
         v_booking.starts_at, v_booking.ends_at, v_row.quantity, p_booking_id) THEN
      RAISE EXCEPTION 'BOOKING_SERVICE_FULL' USING ERRCODE = '23P01', DETAIL = v_row.product_id::text;
    END IF;
  END LOOP;
END;
$function$;

-- The store's places taken on a day: only bookings the store's daily places
-- limit (see booking_is_governed).
CREATE OR REPLACE FUNCTION public.booking_places_taken(
  p_brand_id uuid, p_day date, p_except uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(*)::integer
    FROM public.bookings b
   WHERE b.brand_id = p_brand_id
     AND b.event_date = p_day
     AND (p_except IS NULL OR b.id <> p_except)
     AND (b.status IN ('confirmed', 'completed')
          OR (b.status = 'hold' AND b.hold_expires_at > now()))
     AND NOT public.booking_is_governed(b.id);
$function$;

-- A day's state as booking_day_state decided it, with two things a service can
-- change: its own notice in hours in place of the store's lead days, and
-- being governed by its own capacity (the store's daily places then do not
-- apply). booking_day_state keeps its signature and meaning.
CREATE OR REPLACE FUNCTION public.booking_day_state_for(
  p_settings public.booking_settings, p_day date, p_except uuid, p_staff boolean,
  p_notice_hours integer, p_governed boolean DEFAULT false
)
RETURNS TABLE(state text, remaining integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE p_settings.timezone)::date;
  v_taken integer;
BEGIN
  IF NOT p_staff AND (
       CASE
         WHEN p_notice_hours IS NULL THEN p_day < v_today + p_settings.lead_days
         ELSE ((p_day + p_settings.last_start_time) AT TIME ZONE p_settings.timezone)
              < now() + make_interval(hours => p_notice_hours)
       END
     ) THEN
    RETURN QUERY SELECT 'past'::text, 0;
  ELSIF NOT p_staff AND p_day > v_today + p_settings.horizon_days THEN
    RETURN QUERY SELECT 'beyond'::text, 0;
  ELSIF extract(dow FROM p_day)::smallint = ANY (p_settings.closed_weekdays) THEN
    RETURN QUERY SELECT 'closed'::text, 0;
  ELSIF EXISTS (
    SELECT 1 FROM public.booking_blocks bb
     WHERE bb.brand_id = p_settings.brand_id AND p_day BETWEEN bb.starts_on AND bb.ends_on
  ) THEN
    RETURN QUERY SELECT 'blocked'::text, 0;
  ELSIF p_governed THEN
    RETURN QUERY SELECT 'available'::text, NULL::integer;
  ELSE
    v_taken := public.booking_places_taken(p_settings.brand_id, p_day, p_except);
    IF v_taken >= p_settings.daily_capacity THEN
      RETURN QUERY SELECT 'full'::text, 0;
    ELSE
      RETURN QUERY SELECT 'available'::text, p_settings.daily_capacity - v_taken;
    END IF;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.booking_day_state(
  p_settings public.booking_settings, p_day date,
  p_except uuid DEFAULT NULL, p_staff boolean DEFAULT false
)
RETURNS TABLE(state text, remaining integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT * FROM public.booking_day_state_for(p_settings, p_day, p_except, p_staff, NULL, false);
$function$;

-- The start times of one day for one service and one length, with whether
-- each is free: the store's slots, the service's notice and its capacity.
CREATE OR REPLACE FUNCTION public.booking_service_free_starts(
  p_settings public.booking_settings, p_product_id uuid, p_day date, p_duration_minutes integer
)
RETURNS TABLE(start_time time, free boolean, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_notice integer;
  v_minute integer := (extract(epoch FROM p_settings.open_time)::integer) / 60;
  v_last integer := (extract(epoch FROM p_settings.last_start_time)::integer) / 60;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  SELECT p.booking_notice_hours INTO v_notice
    FROM public.products p
   WHERE p.id = p_product_id AND p.brand_id = p_settings.brand_id;
  WHILE v_minute <= v_last LOOP
    start_time := make_time(v_minute / 60, v_minute % 60, 0);
    v_start := (p_day + start_time) AT TIME ZONE p_settings.timezone;
    v_end := v_start + make_interval(mins => p_duration_minutes);
    IF v_notice IS NOT NULL AND v_start < now() + make_interval(hours => v_notice) THEN
      free := false; reason := 'notice';
    ELSIF NOT public.booking_service_has_room(
             p_settings.brand_id, p_product_id, p_day, v_start, v_end, 1, NULL) THEN
      free := false; reason := 'taken';
    ELSE
      free := true; reason := NULL;
    END IF;
    RETURN NEXT;
    v_minute := v_minute + p_settings.slot_minutes;
  END LOOP;
END;
$function$;

-- The storefront's calendar for the services a customer chose: for each
-- service and day, whether it can be booked (the store's closed and blocked
-- days, the notice, and the service's own capacity). The customer combines
-- them: a day is free when every chosen service is.
CREATE OR REPLACE FUNCTION public.get_service_availability(
  p_brand_id uuid, p_product_ids uuid[], p_from date, p_to date,
  p_duration_minutes integer DEFAULT NULL
)
RETURNS TABLE(product_id uuid, day date, state text, remaining integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.booking_settings;
  v_product record;
  v_day date;
  v_state record;
  v_duration integer;
  v_free integer;
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

  FOR v_product IN
    SELECT p.id, p.booking_capacity AS capacity, p.booking_scope AS scope,
           p.booking_notice_hours AS notice
      FROM public.products p
     WHERE p.brand_id = p_brand_id AND p.id = ANY (p_product_ids) AND p.is_active
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

-- The free start times of one day for the chosen services and length.
CREATE OR REPLACE FUNCTION public.get_service_free_starts(
  p_brand_id uuid, p_day date, p_product_ids uuid[], p_duration_minutes integer
)
RETURNS TABLE(start_time time, free boolean, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.booking_settings;
  v_items jsonb;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id', pid)), '[]'::jsonb)
    INTO v_items FROM unnest(p_product_ids) AS pid;
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
         WHERE p.brand_id = p_brand_id AND p.id = ANY (p_product_ids) AND p.is_active
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
  RETURN v_booking;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_booking(p_booking_id uuid, p_day date, p_start time without time zone, p_duration_minutes integer, p_allow_overbook boolean DEFAULT false)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_settings public.booking_settings;
  v_state record;
  v_window record;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR NOT public.can_access_brand(v_booking.brand_id) THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  v_settings := public.lock_booking_settings_for_staff(v_booking.brand_id);
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.status NOT IN ('requested', 'confirmed') THEN
    RAISE EXCEPTION 'BOOKING_TRANSITION_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_window FROM public.booking_window(v_settings, p_day, p_start, p_duration_minutes);
  IF v_booking.status = 'confirmed' AND NOT p_allow_overbook THEN
    SELECT * INTO v_state FROM public.booking_day_state_for(
      v_settings, p_day, v_booking.id, true, NULL, public.booking_is_governed(v_booking.id));
    IF v_state.state <> 'available' THEN
      RAISE EXCEPTION 'BOOKING_DAY_%', upper(v_state.state) USING ERRCODE = '23P01';
    END IF;
  END IF;

  UPDATE public.bookings SET
    event_date = p_day, starts_at = v_window.starts_at, ends_at = v_window.ends_at, updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  -- Each service's capacity at the new time.
  IF v_booking.status = 'confirmed' AND NOT p_allow_overbook THEN
    PERFORM public.assert_booking_services_free(p_booking_id);
  END IF;
  RETURN v_booking;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_booking_status(p_booking_id uuid, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_settings public.booking_settings;
  v_state record;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR NOT public.can_access_brand(v_booking.brand_id) THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  v_settings := public.lock_booking_settings_for_staff(v_booking.brand_id);
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  IF NOT (
    (v_booking.status = 'requested' AND p_status IN ('confirmed', 'cancelled'))
    OR (v_booking.status = 'confirmed' AND p_status IN ('completed', 'cancelled'))
    OR (v_booking.status = 'completed' AND p_status = 'confirmed')
    OR (v_booking.status = 'cancelled' AND p_status = 'confirmed')
  ) THEN
    RAISE EXCEPTION 'BOOKING_TRANSITION_INVALID' USING ERRCODE = '22023';
  END IF;

  IF v_booking.status IN ('requested', 'cancelled') AND p_status = 'confirmed' THEN
    SELECT * INTO v_state FROM public.booking_day_state_for(
      v_settings, v_booking.event_date, v_booking.id, true, NULL,
      public.booking_is_governed(v_booking.id));
    IF v_state.state <> 'available' THEN
      RAISE EXCEPTION 'BOOKING_DAY_%', upper(v_state.state) USING ERRCODE = '23P01';
    END IF;
    PERFORM public.assert_booking_services_free(p_booking_id);
  END IF;

  UPDATE public.bookings SET
    status = p_status,
    confirmed_at = CASE WHEN p_status = 'confirmed' AND confirmed_at IS NULL THEN now() ELSE confirmed_at END,
    confirmed_by = CASE WHEN p_status = 'confirmed' AND confirmed_by IS NULL THEN auth.uid() ELSE confirmed_by END,
    cancelled_at = CASE WHEN p_status = 'cancelled' THEN now() END,
    cancelled_by = CASE WHEN p_status = 'cancelled' THEN auth.uid() END,
    cancel_reason = CASE WHEN p_status = 'cancelled' THEN NULLIF(btrim(p_reason), '') END,
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;
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

-- Internal helpers: only the booking functions call them.
REVOKE ALL ON FUNCTION public.booking_windows_overlap(timestamptz, timestamptz, timestamptz, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_service_units_used(uuid, uuid, date, timestamptz, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_service_has_room(uuid, uuid, date, timestamptz, timestamptz, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_is_governed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_items_all_governed(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_items_notice_hours(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_booking_items_notice(uuid, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_booking_services_free(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_day_state_for(public.booking_settings, date, uuid, boolean, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_service_free_starts(public.booking_settings, uuid, date, integer) FROM PUBLIC, anon, authenticated;

-- What the storefront asks before a customer commits.
REVOKE ALL ON FUNCTION public.get_service_availability(uuid, uuid[], date, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_service_free_starts(uuid, date, uuid[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_service_availability(uuid, uuid[], date, date, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_service_free_starts(uuid, date, uuid[], integer) TO anon, authenticated;
