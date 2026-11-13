-- Where checkout stops, and which post a visit came from (the owner's request of 2026-11-13).
--
-- Pura's last 30 days: 34 visits began checkout and about 7 ordered, and only 1 of 48 carts left
-- a phone number, so nobody could tell where checkout lost the other 27 or ask them. Additive:
--
-- * a visit that opens checkout keeps how far into it it went (`checkout_step`: 0 opened, 1 its
--   name and phone typed, 2 its delivery or pickup filled in, 3 everything ready to order,
--   4 "place order" pressed) and what still stood in the way the last time anything changed
--   (`checkout_problem`, one code from the storefront, such as `terms` or `receipt`, or the
--   database's own refusal, such as `product_unavailable`); an order clears it;
-- * a visit keeps the campaign its link was tagged with (`utm_campaign`, a word the store chose:
--   `final-call`), so each post shows its visits and orders beside its source.
--
-- Nothing that names a shopper is kept, as before. The four-argument step function stays, for a
-- page left open across the release.

ALTER TABLE public.storefront_sessions
  ADD COLUMN IF NOT EXISTS checkout_step smallint CHECK (checkout_step BETWEEN 0 AND 4),
  ADD COLUMN IF NOT EXISTS checkout_problem text CHECK (checkout_problem ~ '^[a-z][a-z0-9_]{0,47}$'),
  ADD COLUMN IF NOT EXISTS campaign text CHECK (campaign ~ '^[a-z0-9][a-z0-9_-]{0,39}$');

-- A campaign word as the table keeps it, or null: lower case, letters, digits, dashes, 40 at most.
CREATE OR REPLACE FUNCTION public.storefront_campaign_word(p_campaign text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN w ~ '^[a-z0-9][a-z0-9_-]{0,39}$' THEN w
  END
  FROM (
    SELECT left(trim(both '-' FROM regexp_replace(lower(btrim(coalesce(p_campaign, ''))), '[^a-z0-9_-]+', '-', 'g')), 40) AS w
  ) cleaned;
$function$;

REVOKE ALL ON FUNCTION public.storefront_campaign_word(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_campaign_word(text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_storefront_step(
  p_slug text,
  p_session uuid,
  p_step integer,
  p_source text,
  p_campaign text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid;
  v_source text;
  v_campaign text;
BEGIN
  IF p_session IS NULL OR p_step IS NULL OR p_step < 1 OR p_step > 5
     OR p_slug IS NULL OR length(p_slug) > 64 THEN
    RETURN;
  END IF;

  SELECT id INTO v_brand FROM public.brands WHERE slug = p_slug AND is_active = true;
  IF v_brand IS NULL THEN
    RETURN;
  END IF;

  v_source := CASE
    WHEN p_source IN ('instagram', 'facebook', 'tiktok', 'snapchat', 'whatsapp', 'google', 'other', 'direct')
      THEN p_source
  END;
  v_campaign := public.storefront_campaign_word(p_campaign);

  UPDATE public.storefront_sessions
     SET reached = GREATEST(reached, p_step::smallint),
         last_seen = now(),
         source = COALESCE(source, v_source),
         campaign = COALESCE(campaign, v_campaign),
         checkout_problem = CASE WHEN p_step >= 5 THEN NULL ELSE checkout_problem END
   WHERE brand_id = v_brand AND session_id = p_session;
  IF FOUND THEN
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.storefront_sessions
       WHERE brand_id = v_brand AND first_seen > now() - interval '1 day') >= 100000 THEN
    RETURN;
  END IF;

  INSERT INTO public.storefront_sessions (brand_id, session_id, reached, source, campaign)
  VALUES (v_brand, p_session, p_step::smallint, v_source, v_campaign)
  ON CONFLICT (brand_id, session_id) DO UPDATE
    SET reached = GREATEST(public.storefront_sessions.reached, EXCLUDED.reached),
        last_seen = now(),
        source = COALESCE(public.storefront_sessions.source, EXCLUDED.source),
        campaign = COALESCE(public.storefront_sessions.campaign, EXCLUDED.campaign);
END;
$function$;

REVOKE ALL ON FUNCTION public.record_storefront_step(text, uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_storefront_step(text, uuid, integer, text, text)
  TO anon, authenticated, service_role;

-- How far into checkout a visit went, and what stood in its way. A visit's furthest part stays;
-- the problem is the latest one sent (null when nothing is in the way). A visit not recorded yet
-- (its checkout's own step on the way) is recorded as having begun checkout.
CREATE OR REPLACE FUNCTION public.record_checkout_step(
  p_slug text,
  p_session uuid,
  p_step integer,
  p_problem text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid;
  v_problem text;
BEGIN
  IF p_session IS NULL OR p_step IS NULL OR p_step < 0 OR p_step > 4
     OR p_slug IS NULL OR length(p_slug) > 64 THEN
    RETURN;
  END IF;

  SELECT id INTO v_brand FROM public.brands WHERE slug = p_slug AND is_active = true;
  IF v_brand IS NULL THEN
    RETURN;
  END IF;

  -- A code it does not know is no problem recorded, never a failed page.
  v_problem := CASE WHEN p_problem ~ '^[a-z][a-z0-9_]{0,47}$' THEN p_problem END;

  UPDATE public.storefront_sessions
     SET checkout_step = GREATEST(COALESCE(checkout_step, 0), p_step::smallint),
         checkout_problem = CASE WHEN reached >= 5 THEN NULL ELSE v_problem END,
         reached = GREATEST(reached, 4::smallint),
         last_seen = now()
   WHERE brand_id = v_brand AND session_id = p_session;
  IF FOUND THEN
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.storefront_sessions
       WHERE brand_id = v_brand AND first_seen > now() - interval '1 day') >= 100000 THEN
    RETURN;
  END IF;

  INSERT INTO public.storefront_sessions (brand_id, session_id, reached, checkout_step, checkout_problem)
  VALUES (v_brand, p_session, 4, p_step::smallint, v_problem)
  ON CONFLICT (brand_id, session_id) DO UPDATE
    SET checkout_step = GREATEST(COALESCE(public.storefront_sessions.checkout_step, 0), EXCLUDED.checkout_step),
        checkout_problem = CASE
          WHEN public.storefront_sessions.reached >= 5 THEN NULL
          ELSE EXCLUDED.checkout_problem
        END,
        reached = GREATEST(public.storefront_sessions.reached, 4::smallint),
        last_seen = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.record_checkout_step(text, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_checkout_step(text, uuid, integer, text)
  TO anon, authenticated, service_role;

-- The visits of a period that opened checkout: how many got to each part, and how many ordered.
CREATE OR REPLACE FUNCTION public.storefront_checkout_progress(
  p_brand_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (opened bigint, contact bigint, delivery bigint, ready bigint, pressed bigint, ordered bigint)
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
    count(*)::bigint,
    count(*) FILTER (WHERE s.checkout_step >= 1)::bigint,
    count(*) FILTER (WHERE s.checkout_step >= 2)::bigint,
    count(*) FILTER (WHERE s.checkout_step >= 3)::bigint,
    count(*) FILTER (WHERE s.checkout_step >= 4)::bigint,
    count(*) FILTER (WHERE s.reached >= 5)::bigint
  FROM public.storefront_sessions s
  WHERE s.brand_id = p_brand_id
    AND s.first_seen >= p_from AND s.first_seen < p_to
    AND s.checkout_step IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.storefront_checkout_progress(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storefront_checkout_progress(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;

-- What still stood in the way of the visits that opened checkout and did not order.
CREATE OR REPLACE FUNCTION public.storefront_checkout_problems(
  p_brand_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (problem text, visits bigint)
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
  SELECT s.checkout_problem, count(*)::bigint
  FROM public.storefront_sessions s
  WHERE s.brand_id = p_brand_id
    AND s.first_seen >= p_from AND s.first_seen < p_to
    AND s.checkout_step IS NOT NULL
    AND s.reached < 5
    AND s.checkout_problem IS NOT NULL
  GROUP BY s.checkout_problem
  ORDER BY count(*) DESC, s.checkout_problem;
END;
$function$;

REVOKE ALL ON FUNCTION public.storefront_checkout_problems(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storefront_checkout_problems(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;

-- Each campaign's visits and the orders placed in them.
CREATE OR REPLACE FUNCTION public.storefront_funnel_campaigns(
  p_brand_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (campaign text, visits bigint, orders bigint)
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
    s.campaign,
    count(*)::bigint,
    count(*) FILTER (WHERE s.reached >= 5)::bigint
  FROM public.storefront_sessions s
  WHERE s.brand_id = p_brand_id
    AND s.first_seen >= p_from AND s.first_seen < p_to
    AND s.campaign IS NOT NULL
  GROUP BY s.campaign
  ORDER BY count(*) DESC, s.campaign
  LIMIT 20;
END;
$function$;

REVOKE ALL ON FUNCTION public.storefront_funnel_campaigns(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storefront_funnel_campaigns(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;
