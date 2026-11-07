-- Where a store's visits come from. The funnel counts visits and how far they go, but a store could
-- not tell whether Instagram brings any of them, so it could not tell which posts sell. Additive: a
-- visit keeps one word for its source and a fifth step, "ordered", so each source shows its orders.
--
-- Only that word is kept: no link, no referring address, no campaign and nothing about the shopper.
-- A visit's first source stays. Visits recorded before this have none and are left out of the
-- breakdown, instead of reading as "direct". The three-argument function stays, for a page left
-- open across the release.

ALTER TABLE public.storefront_sessions
  ADD COLUMN IF NOT EXISTS source text
  CHECK (source IN ('instagram', 'facebook', 'tiktok', 'snapchat', 'whatsapp', 'google', 'other', 'direct'));

-- 5: an order was placed in this visit. The orders the funnel counts still come from `orders`.
ALTER TABLE public.storefront_sessions DROP CONSTRAINT IF EXISTS storefront_sessions_reached_check;
ALTER TABLE public.storefront_sessions
  ADD CONSTRAINT storefront_sessions_reached_check CHECK (reached BETWEEN 1 AND 5);

CREATE OR REPLACE FUNCTION public.record_storefront_step(
  p_slug text,
  p_session uuid,
  p_step integer,
  p_source text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid;
  v_source text;
BEGIN
  IF p_session IS NULL OR p_step IS NULL OR p_step < 1 OR p_step > 5
     OR p_slug IS NULL OR length(p_slug) > 64 THEN
    RETURN;
  END IF;

  SELECT id INTO v_brand FROM public.brands WHERE slug = p_slug AND is_active = true;
  IF v_brand IS NULL THEN
    RETURN;
  END IF;

  -- A word it does not know is no source, never a failed page.
  v_source := CASE
    WHEN p_source IN ('instagram', 'facebook', 'tiktok', 'snapchat', 'whatsapp', 'google', 'other', 'direct')
      THEN p_source
  END;

  UPDATE public.storefront_sessions
     SET reached = GREATEST(reached, p_step::smallint),
         last_seen = now(),
         source = COALESCE(source, v_source)
   WHERE brand_id = v_brand AND session_id = p_session;
  IF FOUND THEN
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.storefront_sessions
       WHERE brand_id = v_brand AND first_seen > now() - interval '1 day') >= 100000 THEN
    RETURN;
  END IF;

  INSERT INTO public.storefront_sessions (brand_id, session_id, reached, source)
  VALUES (v_brand, p_session, p_step::smallint, v_source)
  ON CONFLICT (brand_id, session_id) DO UPDATE
    SET reached = GREATEST(public.storefront_sessions.reached, EXCLUDED.reached),
        last_seen = now(),
        source = COALESCE(public.storefront_sessions.source, EXCLUDED.source);
END;
$function$;

REVOKE ALL ON FUNCTION public.record_storefront_step(text, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_storefront_step(text, uuid, integer, text)
  TO anon, authenticated, service_role;

-- Each source's visits and the orders placed in those visits, for the store's own staff.
CREATE OR REPLACE FUNCTION public.storefront_funnel_sources(
  p_brand_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (source text, visits bigint, orders bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_brand_id IS NULL OR NOT public.can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.source,
    count(*)::bigint,
    count(*) FILTER (WHERE s.reached >= 5)::bigint
  FROM public.storefront_sessions s
  WHERE s.brand_id = p_brand_id
    AND s.first_seen >= p_from AND s.first_seen < p_to
    AND s.source IS NOT NULL
  GROUP BY s.source
  ORDER BY count(*) DESC, s.source;
END;
$function$;

REVOKE ALL ON FUNCTION public.storefront_funnel_sources(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storefront_funnel_sources(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;
