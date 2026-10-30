-- How many shoppers visit a store and how far they get: a visit, a product looked at, a piece
-- added to the bag, checkout begun. The dashboard showed revenue, orders and the average order,
-- but no visitors and no conversion rate; a store saw them only if it had set up Google
-- Analytics. The storefront already marks each step (`trackStorefrontEvent`); this keeps them
-- for the store itself, without anything that names a shopper.
--
-- One row per visit: a random id the browser keeps for that tab only (sessionStorage, never a
-- cookie), the store, when it started and the furthest step reached. No IP address, account,
-- device or address is kept. A visitor writes only through `record_storefront_step`, which bounds
-- what one call can do; staff read the counts through `storefront_funnel`. Visits older than 400
-- days are removed nightly.

CREATE TABLE IF NOT EXISTS public.storefront_sessions (
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  -- 1 visit, 2 product viewed, 3 added to bag, 4 checkout begun.
  reached smallint NOT NULL DEFAULT 1 CHECK (reached BETWEEN 1 AND 4),
  PRIMARY KEY (brand_id, session_id)
);

CREATE INDEX IF NOT EXISTS storefront_sessions_brand_first_seen
  ON public.storefront_sessions (brand_id, first_seen);

-- Read and written only through the functions below.
ALTER TABLE public.storefront_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.storefront_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.storefront_sessions TO service_role;

-- A step of a visit. Anyone may call it (it is the storefront's), so it checks what it is given:
-- an active store, a step it knows, and at most 100,000 new visits a day per store (a script
-- inventing visits fills nothing). A visit's step only ever goes up.
CREATE OR REPLACE FUNCTION public.record_storefront_step(p_slug text, p_session uuid, p_step integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid;
BEGIN
  IF p_session IS NULL OR p_step IS NULL OR p_step < 1 OR p_step > 4
     OR p_slug IS NULL OR length(p_slug) > 64 THEN
    RETURN;
  END IF;

  SELECT id INTO v_brand FROM public.brands WHERE slug = p_slug AND is_active = true;
  IF v_brand IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.storefront_sessions
     SET reached = GREATEST(reached, p_step::smallint), last_seen = now()
   WHERE brand_id = v_brand AND session_id = p_session;
  IF FOUND THEN
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.storefront_sessions
       WHERE brand_id = v_brand AND first_seen > now() - interval '1 day') >= 100000 THEN
    RETURN;
  END IF;

  INSERT INTO public.storefront_sessions (brand_id, session_id, reached)
  VALUES (v_brand, p_session, p_step::smallint)
  ON CONFLICT (brand_id, session_id) DO UPDATE
    SET reached = GREATEST(public.storefront_sessions.reached, EXCLUDED.reached),
        last_seen = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.record_storefront_step(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_storefront_step(text, uuid, integer)
  TO anon, authenticated, service_role;

-- The funnel of a period, for the store's own staff: visits, then how many of them looked at a
-- product, added to the bag and began checkout, and the storefront orders placed in the period
-- (any not left as a draft or a failed or voided payment), which the conversion rate is worked from.
CREATE OR REPLACE FUNCTION public.storefront_funnel(p_brand_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (visits bigint, product_views bigint, carts bigint, checkouts bigint, orders bigint)
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
    count(*) FILTER (WHERE s.reached >= 2)::bigint,
    count(*) FILTER (WHERE s.reached >= 3)::bigint,
    count(*) FILTER (WHERE s.reached >= 4)::bigint,
    (SELECT count(*)::bigint FROM public.orders o
      WHERE o.brand_id = p_brand_id
        AND o.channel = 'storefront'
        AND o.created_at >= p_from AND o.created_at < p_to
        AND lower(COALESCE(o.status, '')) NOT IN ('draft', 'failed', 'voided'))
  FROM public.storefront_sessions s
  WHERE s.brand_id = p_brand_id AND s.first_seen >= p_from AND s.first_seen < p_to;
END;
$function$;

REVOKE ALL ON FUNCTION public.storefront_funnel(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storefront_funnel(uuid, timestamptz, timestamptz)
  TO authenticated, service_role;

-- Visits are kept 400 days (a year compared with the one before), then removed.
CREATE OR REPLACE FUNCTION public.delete_old_storefront_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.storefront_sessions WHERE first_seen < now() - interval '400 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_old_storefront_sessions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_old_storefront_sessions() TO service_role;

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'storefront_sessions_cleanup_nightly') THEN
      PERFORM cron.unschedule('storefront_sessions_cleanup_nightly');
    END IF;
    PERFORM cron.schedule(
      'storefront_sessions_cleanup_nightly',
      '41 2 * * *',
      'SELECT public.delete_old_storefront_sessions();'
    );
  END IF;
END $$;
