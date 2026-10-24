-- Two things found walking Pura's live admin before going live (2026-10-24).
--
-- 1. The categories page counted its automatic collections by rules of its own. "Sale" counted
--    every active product whose sale-badge switch was on (the switch is on by default), so Pura's
--    admin said "Sale: 12 products" while its storefront showed one. "Best sellers" counted only
--    orders paid in full. Both now count as the storefront does:
--    - on sale: a variant a shopper can buy now is priced below its own original price (the
--      twin of productOnSale / cardPrice in src/lib/product-price.ts: a variant with ready pieces,
--      or any variant of a service or of a made-to-order product while making is open; when none
--      can be bought, every variant counts, as the card does), whatever the badge switch says;
--    - best sellers: products of orders that count as sold (order_counts_as_sold, the twin of
--      countsAsSold), paid or not yet.
--    The rest of the function is the live definition unchanged, its caller check included.
--
-- 2. Support access (Boutq's team entering a store's admin to help) was on for every new store
--    (brands.support_access_enabled DEFAULT true). The owner decided a new store agrees to it at
--    onboarding instead: the default is off, and the onboarding form and the super admin's wizard
--    ask. Stores that exist keep what they have.
--
-- Guarded by tests/category-counts-optin-migration.test.ts.

CREATE OR REPLACE FUNCTION public.category_product_on_sale(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH p AS (
    SELECT pr.id, pr.base_price, pr.item_kind, pr.is_made_to_order,
           pr.made_to_order_paused_at, pr.made_to_order_available
    FROM public.products pr
    WHERE pr.id = p_product_id
  ),
  v AS (
    SELECT pv.selling_price, pv.original_price,
           COALESCE(pv.selling_price, p.base_price, 0) AS selling,
           (p.item_kind = 'service'
             OR (COALESCE(p.is_made_to_order, false)
                 AND p.made_to_order_paused_at IS NULL
                 AND (p.made_to_order_available IS NULL OR p.made_to_order_available > 0))
             OR GREATEST(COALESCE(pv.stock_main, 0) + COALESCE(pv.stock_incubator, 0), 0) > 0
           ) AS buyable
    FROM public.product_variants pv
    JOIN p ON p.id = pv.product_id
  )
  SELECT EXISTS (
    SELECT 1 FROM v
    WHERE v.selling > 0
      AND COALESCE(v.original_price, 0) > v.selling
      AND (v.buyable OR NOT EXISTS (SELECT 1 FROM v AS w WHERE w.buyable))
  );
$$;

REVOKE ALL ON FUNCTION public.category_product_on_sale(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_brand_categories_with_counts(p_brand_id uuid)
 RETURNS TABLE(id uuid, name_ar text, name_en text, slug text, sort_order integer, is_active boolean, parent_id uuid, image_url text, menu_icon_url text, is_smart boolean, product_count integer, total_product_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Strict admin access check to prevent cross-tenant & anonymous exposure of unlisted categories
    IF NOT (public.is_admin() AND public.can_access_brand(p_brand_id)) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.name_ar,
        c.name_en,
        c.slug,
        c.sort_order,
        c.is_active,
        c.parent_id,
        c.image_url,
        c.menu_icon_url,
        CASE
            WHEN c.slug IN ('new-arrivals', 'new') THEN true
            WHEN c.slug IN ('most-selling', 'best-sellers', 'best-selling') THEN true
            WHEN c.slug IN ('sale', 'offers', 'discounts') THEN true
            ELSE false
        END AS is_smart,
        CASE
            WHEN c.slug IN ('new-arrivals', 'new') THEN (
                SELECT COUNT(*)::int
                FROM public.products p
                WHERE p.brand_id = c.brand_id
                  AND p.is_active = true
                  AND p.created_at >= (now() - interval '30 days')
            )
            WHEN c.slug IN ('most-selling', 'best-sellers', 'best-selling') THEN (
                SELECT COUNT(DISTINCT oi.product_id)::int
                FROM public.order_items oi
                JOIN public.orders o ON o.id = oi.order_id
                JOIN public.products p ON p.id = oi.product_id
                WHERE o.brand_id = c.brand_id AND p.is_active = true
                  AND public.order_counts_as_sold(o.status)
            )
            WHEN c.slug IN ('sale', 'offers', 'discounts') THEN (
                SELECT COUNT(*)::int
                FROM public.products p
                WHERE p.brand_id = c.brand_id
                  AND p.is_active = true
                  AND public.category_product_on_sale(p.id)
            )
            ELSE (
                SELECT COUNT(*)::int
                FROM public.products p
                WHERE p.brand_id = c.brand_id
                  AND p.is_active = true
                  AND (p.category = c.slug OR p.category = c.name_en OR p.category = c.id::text)
            )
        END AS product_count,
        CASE
            WHEN c.slug IN ('new-arrivals', 'new') THEN (
                SELECT COUNT(*)::int
                FROM public.products p
                WHERE p.brand_id = c.brand_id
                  AND p.created_at >= (now() - interval '30 days')
            )
            WHEN c.slug IN ('most-selling', 'best-sellers', 'best-selling') THEN (
                SELECT COUNT(DISTINCT oi.product_id)::int
                FROM public.order_items oi
                JOIN public.orders o ON o.id = oi.order_id
                JOIN public.products p ON p.id = oi.product_id
                WHERE o.brand_id = c.brand_id AND p.is_active = true
                  AND public.order_counts_as_sold(o.status)
            )
            WHEN c.slug IN ('sale', 'offers', 'discounts') THEN (
                SELECT COUNT(*)::int
                FROM public.products p
                WHERE p.brand_id = c.brand_id
                  AND public.category_product_on_sale(p.id)
            )
            ELSE (
                SELECT COUNT(*)::int
                FROM public.products p
                WHERE p.brand_id = c.brand_id
                  AND (p.category = c.slug OR p.category = c.name_en OR p.category = c.id::text)
            )
        END AS total_product_count
    FROM public.categories c
    WHERE c.brand_id = p_brand_id
    ORDER BY c.sort_order ASC;
END;
$function$;

ALTER TABLE public.brands ALTER COLUMN support_access_enabled SET DEFAULT false;

COMMENT ON COLUMN public.brands.support_access_enabled IS
  'Whether Boutq''s support team may enter the store''s admin to help. Off for a new store until its owner agrees (onboarding, or Settings > Account > Support access).';
