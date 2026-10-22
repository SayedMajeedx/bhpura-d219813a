-- Reviews on each product's page.
--
-- A review is given for an order (order_reviews), so a product's reviews are those of the orders
-- that held it. The page shows them in two parts:
--   * every review counts in the stars: the average, how many, and what customers praise most;
--   * a review's words, with the customer's first name only, are shown when the customer agreed
--     (show_on_store, a box on the review form) and the store has not hidden it (hidden_at).
-- Hiding a review takes its words off the page but never its stars, so hiding cannot raise a
-- rating. Who hid it and when is kept (hidden_by, hidden_at).

ALTER TABLE public.order_reviews
  ADD COLUMN IF NOT EXISTS show_on_store boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid;

-- The owner's decision (2026-10-22): the reviews given before the form asked are shown.
UPDATE public.order_reviews SET show_on_store = true WHERE show_on_store = false;

-- The review form now asks whether the review may be shown on the store. The function is the
-- live one (pg_get_functiondef, 2026-10-22) with that answer added; a call without it (the page
-- before this change) keeps the review private.
DROP FUNCTION IF EXISTS public.submit_public_order_review(uuid, integer, text[], text);
CREATE FUNCTION public.submit_public_order_review(
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
BEGIN
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_RATING'; END IF;
  IF char_length(COALESCE(p_comment, '')) > 600 THEN RAISE EXCEPTION 'COMMENT_TOO_LONG'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_highlights, '{}')) h WHERE NOT h = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'INVALID_HIGHLIGHT';
  END IF;

  SELECT * INTO v_request FROM public.order_review_requests
  WHERE public_token = p_token AND eligible_at <= now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;

  INSERT INTO public.order_reviews (request_id, brand_id, order_id, rating, highlights, comment, show_on_store)
  VALUES (v_request.id, v_request.brand_id, v_request.order_id, p_rating,
    COALESCE(p_highlights, '{}'), NULLIF(trim(p_comment), ''), COALESCE(p_show_on_store, false))
  ON CONFLICT (request_id) DO NOTHING;

  UPDATE public.order_review_requests SET status = 'completed', completed_at = COALESCE(completed_at, now()), updated_at = now()
  WHERE id = v_request.id;
  RETURN 'THANKU10';
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_public_order_review(uuid, integer, text[], text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_order_review(uuid, integer, text[], text, boolean)
  TO anon, authenticated, service_role;

-- The Reviews page sees whether each review may be shown and whether it is hidden. The live
-- function with the two columns added (a new result shape, so it is dropped first).
DROP FUNCTION IF EXISTS public.list_brand_order_reviews(uuid);
CREATE FUNCTION public.list_brand_order_reviews(p_brand_id uuid)
 RETURNS TABLE(review_id uuid, request_id uuid, order_id uuid, invoice_number integer, customer_name text, customer_phone text, rating smallint, highlights text[], comment text, reward_code text, reviewed_at timestamp with time zone, request_sent_at timestamp with time zone, show_on_store boolean, hidden_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    rv.id,
    rv.request_id,
    rv.order_id,
    o.invoice_number,
    COALESCE(NULLIF(trim(o.customer_name_snapshot), ''), 'Customer'),
    o.customer_phone_snapshot,
    rv.rating,
    rv.highlights,
    rv.comment,
    rv.reward_code,
    rv.created_at,
    rr.sent_at,
    rv.show_on_store,
    rv.hidden_at
  FROM public.order_reviews rv
  JOIN public.order_review_requests rr ON rr.id = rv.request_id
  JOIN public.orders o ON o.id = rv.order_id
  WHERE rv.brand_id = p_brand_id
    AND public.can_access_brand(rv.brand_id)
  ORDER BY rv.created_at DESC;
$function$;
REVOKE ALL ON FUNCTION public.list_brand_order_reviews(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_brand_order_reviews(uuid) TO authenticated, service_role;

-- Hiding (or showing again) a review's words on the store: staff of the store who may manage
-- customers, as the Reviews page asks.
CREATE OR REPLACE FUNCTION public.set_order_review_hidden(p_review_id uuid, p_hidden boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid;
BEGIN
  SELECT brand_id INTO v_brand FROM public.order_reviews WHERE id = p_review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_brand)
     OR NOT public.has_permission('manage_customers') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  UPDATE public.order_reviews
     SET hidden_at = CASE WHEN p_hidden THEN now() ELSE NULL END,
         hidden_by = CASE WHEN p_hidden THEN auth.uid() ELSE NULL END
   WHERE id = p_review_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_order_review_hidden(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_review_hidden(uuid, boolean) TO authenticated, service_role;

-- What a product's page shows: the stars of every review of an order that held the product, and
-- the words of those the customer let the store show and the store did not hide, newest first,
-- with the customer's first name only. Nothing else about the customer or the order leaves.
CREATE OR REPLACE FUNCTION public.storefront_product_reviews(
  p_brand_slug text,
  p_product_id uuid,
  p_limit integer DEFAULT 12
)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH product AS (
    SELECT p.id, p.brand_id
      FROM public.products p
      JOIN public.brands b ON b.id = p.brand_id
     WHERE b.slug = p_brand_slug AND b.is_active AND p.id = p_product_id AND p.is_active
  ),
  reviewed AS (
    SELECT rv.id, rv.rating, rv.highlights, rv.comment, rv.created_at, rv.show_on_store,
           rv.hidden_at, o.customer_name_snapshot
      FROM public.order_reviews rv
      JOIN product pr ON pr.brand_id = rv.brand_id
      JOIN public.orders o ON o.id = rv.order_id
     WHERE EXISTS (
       SELECT 1 FROM public.order_items oi
        WHERE oi.order_id = rv.order_id AND oi.product_id = pr.id
     )
  ),
  praise AS (
    SELECT h AS key, count(*) AS n FROM reviewed, unnest(reviewed.highlights) h GROUP BY h
  ),
  shown AS (
    SELECT * FROM reviewed
     WHERE show_on_store AND hidden_at IS NULL
     ORDER BY created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 50)
  )
  SELECT jsonb_build_object(
    'count', (SELECT count(*) FROM reviewed),
    'average', (SELECT round(avg(rating)::numeric, 1) FROM reviewed),
    'stars', (SELECT jsonb_object_agg(s, (SELECT count(*) FROM reviewed WHERE rating = s))
                FROM generate_series(1, 5) s),
    'highlights', COALESCE((SELECT jsonb_object_agg(key, n) FROM praise), '{}'::jsonb),
    'reviews', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', id,
               'rating', rating,
               'highlights', highlights,
               'comment', comment,
               'name', NULLIF(split_part(trim(COALESCE(customer_name_snapshot, '')), ' ', 1), ''),
               'date', created_at
             ) ORDER BY created_at DESC)
        FROM shown
    ), '[]'::jsonb)
  )
  WHERE EXISTS (SELECT 1 FROM product);
$function$;
REVOKE ALL ON FUNCTION public.storefront_product_reviews(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_product_reviews(text, uuid, integer)
  TO anon, authenticated, service_role;
