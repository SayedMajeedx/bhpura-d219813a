-- A shopper sees their bookings on their account, and a services store's home page shows its
-- reviews.
--
-- 1. storefront_my_bookings(brand): a signed-in shopper's own bookings with the store, for the
--    account page. The bookings table is read by the store's staff only, and a policy for
--    shoppers would hand them every column, the hold token and the reason staff wrote when they
--    cancelled (kept for the team, never sent to the customer) among them. So a shopper reads
--    through this function, which returns what the account shows: the reference, a state, the
--    day and the times, the place, the services, and the invoice with what is paid. A booking is
--    the shopper's when it, or the order it was paid with, names a customer whose account is the
--    caller's (customers.auth_user_id). A hold still being checked out and one that ran out are
--    left out; a hold with an order (a transfer waiting for its check) is shown.
-- 2. storefront_store_reviews(slug): the store's reviews as a whole, for a services store's home
--    page, by the rules of storefront_product_reviews (migration 20261022100000): the stars of
--    every review, and the words of those the customer let the store show and the store did not
--    hide, with a first name only. A review counts once, whatever its order held.
--
-- Tested in a real Postgres by tests/shopper-bookings-store-reviews-migration.test.ts.

CREATE OR REPLACE FUNCTION public.storefront_my_bookings(p_brand_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(row ORDER BY (row ->> 'starts_at') DESC), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
               'reference', b.reference,
               'status', b.status,
               'event_date', b.event_date,
               'starts_at', b.starts_at,
               'ends_at', b.ends_at,
               'timezone', COALESCE(s.timezone, 'Asia/Bahrain'),
               'location', b.location,
               'services', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'name_en', bi.name_en, 'name_ar', bi.name_ar, 'quantity', bi.quantity
                        ) ORDER BY bi.id)
                   FROM public.booking_items bi
                  WHERE bi.booking_id = b.id
                    AND bi.parent_item_id IS NULL
                    AND bi.option_id IS NULL
               ), '[]'::jsonb),
               'invoice_token', o.public_invoice_token,
               'total', COALESCE(o.total, b.total),
               'paid', COALESCE(o.advance_paid, 0),
               'currency', COALESCE(o.currency, bs.currency, 'BHD')
             ) AS row
        FROM public.bookings b
        LEFT JOIN public.orders o ON o.id = b.order_id
        JOIN public.customers c ON c.id = COALESCE(b.customer_id, o.customer_id)
        LEFT JOIN public.booking_settings s ON s.brand_id = b.brand_id
        LEFT JOIN public.business_settings bs ON bs.brand_id = b.brand_id
       WHERE b.brand_id = p_brand_id
         AND c.brand_id = p_brand_id
         AND c.auth_user_id = auth.uid()
         AND (
           b.status IN ('requested', 'confirmed', 'completed', 'cancelled')
           OR (b.status = 'hold' AND b.order_id IS NOT NULL)
         )
       ORDER BY b.starts_at DESC
       LIMIT 50
    ) mine;
$function$;
REVOKE ALL ON FUNCTION public.storefront_my_bookings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storefront_my_bookings(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.storefront_store_reviews(
  p_brand_slug text,
  p_limit integer DEFAULT 6
)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH store AS (
    SELECT b.id FROM public.brands b WHERE b.slug = p_brand_slug AND b.is_active
  ),
  reviewed AS (
    SELECT rv.id, rv.rating, rv.highlights, rv.comment, rv.created_at, rv.show_on_store,
           rv.hidden_at, o.customer_name_snapshot
      FROM public.order_reviews rv
      JOIN store st ON st.id = rv.brand_id
      JOIN public.orders o ON o.id = rv.order_id
  ),
  praise AS (
    SELECT h AS key, count(*) AS n FROM reviewed, unnest(reviewed.highlights) h GROUP BY h
  ),
  shown AS (
    SELECT * FROM reviewed
     WHERE show_on_store AND hidden_at IS NULL
     ORDER BY created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 6), 1), 24)
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
  WHERE EXISTS (SELECT 1 FROM store);
$function$;
REVOKE ALL ON FUNCTION public.storefront_store_reviews(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_store_reviews(text, integer)
  TO anon, authenticated, service_role;
