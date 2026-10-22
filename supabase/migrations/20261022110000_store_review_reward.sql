-- Each store's own thank-you discount for a review (bug #41).
--
-- Every store's review handed out the fixed code THANKU10 and every page promised "10%", but
-- only Pura has a code by that name: the first review in any other store gave a code that does
-- not exist. A store now names one of its own promo codes (business_settings.
-- review_reward_promo_id, chosen on the Reviews page) or none. The code is given only while it
-- can be used by anyone (store_review_reward: active, started, not ended, open to more than one
-- shopper); otherwise no discount is given and the pages promise none.

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS review_reward_promo_id uuid
    REFERENCES public.promo_codes(id) ON DELETE SET NULL;

-- A store that already has a code named THANKU10 (Pura) keeps it: that is what its customers
-- were promised.
UPDATE public.business_settings bs
   SET review_reward_promo_id = pc.id
  FROM public.promo_codes pc
 WHERE pc.brand_id = bs.brand_id
   AND upper(pc.code) = 'THANKU10'
   AND bs.review_reward_promo_id IS NULL;

-- A review now keeps the code it was given, or none.
ALTER TABLE public.order_reviews ALTER COLUMN reward_code DROP DEFAULT;
ALTER TABLE public.order_reviews ALTER COLUMN reward_code DROP NOT NULL;

-- The store's thank-you code while it can be used by anyone, else no row. Its own store's code
-- only. Called inside the review functions; no browser calls it.
CREATE OR REPLACE FUNCTION public.store_review_reward(p_brand_id uuid)
 RETURNS TABLE(code text, discount_type text, discount_value numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT pc.code, pc.discount_type, pc.discount_value
    FROM public.business_settings bs
    JOIN public.promo_codes pc
      ON pc.id = bs.review_reward_promo_id AND pc.brand_id = bs.brand_id
   WHERE bs.brand_id = p_brand_id
     AND pc.is_active
     AND (pc.start_date IS NULL OR pc.start_date <= now())
     AND (pc.end_date IS NULL OR pc.end_date > now())
     AND (pc.max_redemptions IS NULL OR pc.max_redemptions > 1)
   LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.store_review_reward(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_review_reward(uuid) TO service_role;

-- Submitting gives the store's code, or none. The live function (migration 20261022100000)
-- with the fixed 'THANKU10' replaced by the store's own reward.
CREATE OR REPLACE FUNCTION public.submit_public_order_review(
  p_token uuid,
  p_rating integer,
  p_highlights text[] DEFAULT '{}'::text[],
  p_comment text DEFAULT NULL::text,
  p_show_on_store boolean DEFAULT false
)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.order_review_requests%ROWTYPE;
  v_allowed text[] := ARRAY['quality','packaging','speed','delivery','service'];
  v_reward text;
BEGIN
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_RATING'; END IF;
  IF char_length(COALESCE(p_comment, '')) > 600 THEN RAISE EXCEPTION 'COMMENT_TOO_LONG'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_highlights, '{}')) h WHERE NOT h = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'INVALID_HIGHLIGHT';
  END IF;

  SELECT * INTO v_request FROM public.order_review_requests
  WHERE public_token = p_token AND eligible_at <= now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;

  SELECT r.code INTO v_reward FROM public.store_review_reward(v_request.brand_id) r;

  INSERT INTO public.order_reviews (request_id, brand_id, order_id, rating, highlights, comment, show_on_store, reward_code)
  VALUES (v_request.id, v_request.brand_id, v_request.order_id, p_rating,
    COALESCE(p_highlights, '{}'), NULLIF(trim(p_comment), ''), COALESCE(p_show_on_store, false), v_reward)
  ON CONFLICT (request_id) DO NOTHING;

  UPDATE public.order_review_requests SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
  WHERE id = v_request.id;

  -- A second submission of the same link answers with the code the review was given.
  SELECT rv.reward_code INTO v_reward FROM public.order_reviews rv WHERE rv.request_id = v_request.id;
  RETURN v_reward;
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_public_order_review(uuid, integer, text[], text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_order_review(uuid, integer, text[], text, boolean)
  TO anon, authenticated, service_role;

-- The review page learns what the store offers before the review (the kind and amount, never the
-- code), and after it the code the review was given with what that code takes off. The live
-- function (pg_get_functiondef, 2026-10-22) with the fallback to 'THANKU10' removed and the
-- offer and the store's currency added (a new result shape, so it is dropped first).
DROP FUNCTION IF EXISTS public.get_public_order_review(uuid);
CREATE FUNCTION public.get_public_order_review(p_token uuid)
 RETURNS TABLE(state text, brand_name text, brand_logo_url text, invoice_number integer, customer_name text, brand_whatsapp_number text, reward_code text, reward_discount_type text, reward_discount_value numeric, currency text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE WHEN r.status = 'completed' THEN 'completed' ELSE 'ready' END,
    COALESCE(NULLIF(bs.business_name, ''), b.name_ar, b.name_en, b.slug),
    COALESCE(bs.logo_url, b.logo_url),
    o.invoice_number,
    COALESCE(NULLIF(split_part(o.customer_name_snapshot, ' ', 1), ''), 'عميلنا'),
    bs.whatsapp_number,
    CASE WHEN r.status = 'completed' THEN rv.reward_code ELSE NULL END,
    CASE WHEN r.status = 'completed' THEN given.discount_type ELSE offer.discount_type END,
    CASE WHEN r.status = 'completed' THEN given.discount_value ELSE offer.discount_value END,
    COALESCE(NULLIF(bs.currency, ''), 'BHD')
  FROM public.order_review_requests r
  JOIN public.orders o ON o.id = r.order_id
  JOIN public.brands b ON b.id = r.brand_id AND b.is_active = true
  LEFT JOIN public.business_settings bs ON bs.brand_id = r.brand_id
  LEFT JOIN public.order_reviews rv ON rv.request_id = r.id
  LEFT JOIN LATERAL public.store_review_reward(r.brand_id) offer ON true
  LEFT JOIN LATERAL (
    SELECT pc.discount_type, pc.discount_value
      FROM public.promo_codes pc
     WHERE pc.brand_id = r.brand_id AND upper(pc.code) = upper(rv.reward_code)
     LIMIT 1
  ) given ON true
  WHERE r.public_token = p_token AND r.eligible_at <= now();
$function$;
REVOKE ALL ON FUNCTION public.get_public_order_review(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_review(uuid) TO anon, authenticated, service_role;
