-- Migration: 20260930100000_bookings_engine.sql
--
-- Bookings, part 1: the engine behind a services store's calendar.
--
-- A store takes a number of bookings per day (daily_capacity; a photo booth
-- team usually 1). A day is unavailable when it is before the store's notice
-- period, past its booking horizon, a closed weekday, blocked by the store,
-- or full. A day's places are taken by confirmed and completed bookings and by
-- live checkout holds; a booking request (a catalog store's "book via
-- WhatsApp") takes no place until the store confirms it.
--
--   booking_settings   one row per store: its rules (hours, durations, notice,
--                      horizon, capacity, closed weekdays, hold length)
--   bookings           each booking: its date and time, customer, place,
--                      status and source; booking_items its services
--   booking_blocks     days the store closes itself (holidays, maintenance)
--
-- Staff read their store's rows (can_access_brand). Bookings are written only
-- through the functions below, which lock the store's settings row, so two
-- bookings can never take the last place of a day. Anyone may read a store's
-- day availability (no customer data) with get_booking_availability.
--
-- Bookings are on for a store when its settings row exists and its bookings
-- module is on: store_modules.bookings, or by default for the services
-- vertical (src/lib/verticals/registry.ts; tests keep the two in step).

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.booking_settings (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Asia/Bahrain'
    CHECK ((timestamptz '2000-01-01 00:00+00' AT TIME ZONE timezone) IS NOT NULL),
  daily_capacity integer NOT NULL DEFAULT 1 CHECK (daily_capacity BETWEEN 1 AND 100),
  open_time time NOT NULL DEFAULT '10:00',
  last_start_time time NOT NULL DEFAULT '22:00',
  slot_minutes integer NOT NULL DEFAULT 30 CHECK (slot_minutes IN (15, 30, 60)),
  min_duration_minutes integer NOT NULL DEFAULT 180 CHECK (min_duration_minutes BETWEEN 15 AND 1440),
  max_duration_minutes integer NOT NULL DEFAULT 480 CHECK (max_duration_minutes BETWEEN 15 AND 1440),
  duration_step_minutes integer NOT NULL DEFAULT 60 CHECK (duration_step_minutes IN (15, 30, 60, 120)),
  lead_days integer NOT NULL DEFAULT 1 CHECK (lead_days BETWEEN 0 AND 365),
  horizon_days integer NOT NULL DEFAULT 365 CHECK (horizon_days BETWEEN 1 AND 730),
  hold_minutes integer NOT NULL DEFAULT 15 CHECK (hold_minutes BETWEEN 5 AND 120),
  closed_weekdays smallint[] NOT NULL DEFAULT '{}'
    CHECK (closed_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_duration_minutes >= min_duration_minutes),
  CHECK (last_start_time >= open_time)
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  reference text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('hold', 'requested', 'confirmed', 'completed', 'cancelled', 'expired')),
  event_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  customer_email text,
  location jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(location) = 'object'),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  source text NOT NULL CHECK (source IN ('storefront', 'whatsapp', 'admin')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  hold_expires_at timestamptz,
  total numeric(12, 3) NOT NULL DEFAULT 0 CHECK (total >= 0),
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancel_reason text CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 500),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (status <> 'hold' OR hold_expires_at IS NOT NULL),
  UNIQUE (brand_id, reference)
);

CREATE INDEX IF NOT EXISTS bookings_brand_date_idx ON public.bookings (brand_id, event_date);
CREATE INDEX IF NOT EXISTS bookings_brand_status_idx ON public.bookings (brand_id, status);
CREATE INDEX IF NOT EXISTS bookings_order_idx ON public.bookings (order_id) WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.booking_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  name_en text,
  name_ar text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100),
  unit_price numeric(12, 3) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total numeric(12, 3) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

CREATE INDEX IF NOT EXISTS booking_items_booking_idx ON public.booking_items (booking_id);

CREATE TABLE IF NOT EXISTS public.booking_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 200),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK (ends_on - starts_on <= 366)
);

CREATE INDEX IF NOT EXISTS booking_blocks_brand_idx ON public.booking_blocks (brand_id, starts_on, ends_on);

-- ── Row level security ──────────────────────────────────────────────────────

ALTER TABLE public.booking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand reads booking settings" ON public.booking_settings;
CREATE POLICY "brand reads booking settings" ON public.booking_settings
  FOR SELECT USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS "settings managers write booking settings" ON public.booking_settings;
CREATE POLICY "settings managers write booking settings" ON public.booking_settings
  FOR ALL
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));

-- Bookings and their items: read here, written only by the functions below.
DROP POLICY IF EXISTS "brand reads bookings" ON public.bookings;
CREATE POLICY "brand reads bookings" ON public.bookings
  FOR SELECT USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS "brand reads booking items" ON public.booking_items;
CREATE POLICY "brand reads booking items" ON public.booking_items
  FOR SELECT USING (public.can_access_brand(brand_id));

DROP POLICY IF EXISTS "brand reads booking blocks" ON public.booking_blocks;
CREATE POLICY "brand reads booking blocks" ON public.booking_blocks
  FOR SELECT USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS "order managers write booking blocks" ON public.booking_blocks;
CREATE POLICY "order managers write booking blocks" ON public.booking_blocks
  FOR ALL
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_orders'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_orders'));

REVOKE ALL ON public.booking_settings, public.bookings, public.booking_items, public.booking_blocks
  FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.bookings, public.booking_items FROM authenticated;
GRANT SELECT ON public.bookings, public.booking_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_settings, public.booking_blocks TO authenticated;
GRANT ALL ON public.booking_settings, public.bookings, public.booking_items, public.booking_blocks
  TO service_role;

-- ── Helpers ─────────────────────────────────────────────────────────────────

-- Whether a store takes bookings: its settings row exists and its bookings
-- module is on (explicitly, or by default for the services vertical).
CREATE OR REPLACE FUNCTION public.bookings_enabled(p_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.booking_settings WHERE brand_id = p_brand_id)
    AND COALESCE(
      (SELECT CASE
                WHEN jsonb_typeof(bs.store_modules -> 'bookings') = 'boolean'
                  THEN (bs.store_modules ->> 'bookings')::boolean
                ELSE bs.store_vertical = 'services'
              END
         FROM public.business_settings bs
        WHERE bs.brand_id = p_brand_id),
      false);
$function$;

-- Places taken on a day: confirmed and completed bookings and live holds.
CREATE OR REPLACE FUNCTION public.booking_places_taken(
  p_brand_id uuid,
  p_day date,
  p_except uuid DEFAULT NULL
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
          OR (b.status = 'hold' AND b.hold_expires_at > now()));
$function$;

-- A day's state for a store: past (before the notice period), beyond (past
-- the horizon), closed (weekday), blocked, full or available. The notice
-- period and horizon are for customers: for staff (p_staff) they do not apply.
CREATE OR REPLACE FUNCTION public.booking_day_state(
  p_settings public.booking_settings,
  p_day date,
  p_except uuid DEFAULT NULL,
  p_staff boolean DEFAULT false
)
RETURNS TABLE (state text, remaining integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE p_settings.timezone)::date;
  v_taken integer;
BEGIN
  IF NOT p_staff AND p_day < v_today + p_settings.lead_days THEN
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

-- A short, readable booking reference, unique within the store.
CREATE OR REPLACE FUNCTION public.next_booking_reference(p_brand_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ref text;
BEGIN
  LOOP
    v_ref := 'BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.bookings WHERE brand_id = p_brand_id AND reference = v_ref
    );
  END LOOP;
  RETURN v_ref;
END;
$function$;

-- The store's settings row, locked, when the caller manages its orders.
CREATE OR REPLACE FUNCTION public.lock_booking_settings_for_staff(p_brand_id uuid)
RETURNS public.booking_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.booking_settings;
BEGIN
  IF NOT (public.can_access_brand(p_brand_id) AND public.has_permission('manage_orders')) THEN
    RAISE EXCEPTION 'BOOKING_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_settings FROM public.booking_settings WHERE brand_id = p_brand_id FOR UPDATE;
  IF NOT FOUND OR NOT public.bookings_enabled(p_brand_id) THEN
    RAISE EXCEPTION 'BOOKINGS_DISABLED' USING ERRCODE = '22023';
  END IF;
  RETURN v_settings;
END;
$function$;

-- Checks a start time and duration against the store's hours and returns
-- the booking's start and end instants.
CREATE OR REPLACE FUNCTION public.booking_window(
  p_settings public.booking_settings,
  p_day date,
  p_start time,
  p_duration_minutes integer
)
RETURNS TABLE (starts_at timestamptz, ends_at timestamptz)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_start IS NULL OR p_start < p_settings.open_time OR p_start > p_settings.last_start_time
     OR (extract(epoch FROM p_start)::integer / 60) % p_settings.slot_minutes <> 0 THEN
    RAISE EXCEPTION 'BOOKING_TIME_OUTSIDE_HOURS' USING ERRCODE = '22023';
  END IF;
  IF p_duration_minutes IS NULL
     OR p_duration_minutes < p_settings.min_duration_minutes
     OR p_duration_minutes > p_settings.max_duration_minutes
     OR (p_duration_minutes - p_settings.min_duration_minutes) % p_settings.duration_step_minutes <> 0 THEN
    RAISE EXCEPTION 'BOOKING_DURATION_INVALID' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT
    (p_day + p_start) AT TIME ZONE p_settings.timezone,
    (p_day + p_start + make_interval(mins => p_duration_minutes)) AT TIME ZONE p_settings.timezone;
END;
$function$;

-- ── Public availability ─────────────────────────────────────────────────────

-- Each day's state from p_from to p_to (at most 62 days). No customer data.
CREATE OR REPLACE FUNCTION public.get_booking_availability(
  p_brand_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (day date, state text, remaining integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.booking_settings;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62 THEN
    RAISE EXCEPTION 'BOOKING_RANGE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT public.bookings_enabled(p_brand_id) THEN
    RETURN;
  END IF;
  SELECT * INTO v_settings FROM public.booking_settings WHERE brand_id = p_brand_id;
  RETURN QUERY
    SELECT d::date, s.state, s.remaining
      FROM generate_series(p_from, p_to, interval '1 day') AS d,
           LATERAL public.booking_day_state(v_settings, d::date) AS s;
END;
$function$;

-- The store's booking rules a storefront needs (hours, durations, notice).
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
      'closed_weekdays', to_jsonb(s.closed_weekdays)
    ) END
    FROM public.booking_settings s
   WHERE s.brand_id = p_brand_id;
$function$;

-- ── Staff actions ───────────────────────────────────────────────────────────

-- A booking the store takes itself (phone, WhatsApp, walk-in). Confirmed at
-- once unless p_status = 'requested'; refused on a full or unavailable day
-- unless p_allow_overbook (the store's own decision, recorded in notes).
CREATE OR REPLACE FUNCTION public.create_staff_booking(
  p_brand_id uuid,
  p_day date,
  p_start time,
  p_duration_minutes integer,
  p_customer jsonb,
  p_items jsonb,
  p_location jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL,
  p_status text DEFAULT 'confirmed',
  p_source text DEFAULT 'admin',
  p_allow_overbook boolean DEFAULT false
)
RETURNS public.bookings
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
    SELECT * INTO v_state FROM public.booking_day_state(v_settings, p_day, NULL, true);
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

  UPDATE public.bookings SET total = v_total WHERE id = v_booking.id RETURNING * INTO v_booking;
  RETURN v_booking;
END;
$function$;

-- Moves a booking through its life: a request is confirmed (if its day still
-- has a place) or declined; a confirmed booking is completed or cancelled; a
-- cancelled one can be reinstated (if its day still has a place), and a
-- completed one reopened.
CREATE OR REPLACE FUNCTION public.set_booking_status(
  p_booking_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS public.bookings
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
    SELECT * INTO v_state FROM public.booking_day_state(v_settings, v_booking.event_date, v_booking.id, true);
    IF v_state.state <> 'available' THEN
      RAISE EXCEPTION 'BOOKING_DAY_%', upper(v_state.state) USING ERRCODE = '23P01';
    END IF;
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

-- Moves a booking to another day or time (the new day must have a place,
-- not counting the booking itself, unless p_allow_overbook).
CREATE OR REPLACE FUNCTION public.reschedule_booking(
  p_booking_id uuid,
  p_day date,
  p_start time,
  p_duration_minutes integer,
  p_allow_overbook boolean DEFAULT false
)
RETURNS public.bookings
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
    SELECT * INTO v_state FROM public.booking_day_state(v_settings, p_day, v_booking.id, true);
    IF v_state.state <> 'available' THEN
      RAISE EXCEPTION 'BOOKING_DAY_%', upper(v_state.state) USING ERRCODE = '23P01';
    END IF;
  END IF;

  UPDATE public.bookings SET
    event_date = p_day, starts_at = v_window.starts_at, ends_at = v_window.ends_at, updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;
  RETURN v_booking;
END;
$function$;

-- ── Grants ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.bookings_enabled(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_places_taken(uuid, date, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_day_state(public.booking_settings, date, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_booking_reference(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_booking_settings_for_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.booking_window(public.booking_settings, date, time, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_staff_booking(uuid, date, time, integer, jsonb, jsonb, jsonb, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_booking_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reschedule_booking(uuid, date, time, integer, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.bookings_enabled(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_availability(uuid, date, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_booking_rules(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_staff_booking(uuid, date, time, integer, jsonb, jsonb, jsonb, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_booking_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_booking(uuid, date, time, integer, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
