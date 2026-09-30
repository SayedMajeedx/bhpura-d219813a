-- Migration: 20260930240000_booking_calendar_feed.sql
--
-- Bookings, part 5b: a store's bookings in its own calendar app.
--
-- A store can make a private calendar link (booking_settings.calendar_token,
-- a random secret its staff with manage_settings set and reset). Calendar
-- apps (Google, Apple, Outlook) subscribe to
-- /api/public/bookings/calendar/<token>.ics; the server reads the feed with
-- booking_calendar_feed, which only the service role may call, and only for
-- a token that matches. The feed holds the store's confirmed and completed
-- bookings from 60 days ago to its booking horizon.

ALTER TABLE public.booking_settings
  ADD COLUMN IF NOT EXISTS calendar_token uuid;

CREATE UNIQUE INDEX IF NOT EXISTS booking_settings_calendar_token_key
  ON public.booking_settings (calendar_token)
  WHERE calendar_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.booking_calendar_feed(p_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'brand_name_en', b.name_en,
    'brand_name_ar', b.name_ar,
    'timezone', s.timezone,
    'bookings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', bk.id,
        'reference', bk.reference,
        'status', bk.status,
        'starts_at', bk.starts_at,
        'ends_at', bk.ends_at,
        'customer_name', bk.customer_name,
        'customer_phone', bk.customer_phone,
        'location', bk.location,
        'notes', bk.notes,
        'updated_at', bk.updated_at,
        'services', COALESCE((
          SELECT jsonb_agg(COALESCE(bi.name_en, bi.name_ar) ORDER BY bi.name_en)
            FROM public.booking_items bi
           WHERE bi.booking_id = bk.id
        ), '[]'::jsonb)
      ) ORDER BY bk.starts_at)
        FROM public.bookings bk
       WHERE bk.brand_id = s.brand_id
         AND bk.status IN ('confirmed', 'completed')
         AND bk.event_date >= (now() AT TIME ZONE s.timezone)::date - 60
         AND bk.event_date <= (now() AT TIME ZONE s.timezone)::date + s.horizon_days
    ), '[]'::jsonb)
  )
    FROM public.booking_settings s
    JOIN public.brands b ON b.id = s.brand_id
   WHERE p_token IS NOT NULL
     AND s.calendar_token = p_token;
$function$;

REVOKE ALL ON FUNCTION public.booking_calendar_feed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_calendar_feed(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
