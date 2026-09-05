-- ==============================================================================
-- Migration: 20260905100000_remediate_phase4_categories_rls_and_counts.sql
-- Description:
--   1. Fix categories RLS: brand admins manage categories
--   2. Atomic category product counter RPC: get_brand_categories_with_counts
-- ==============================================================================

-- 1. Secure categories RLS
DROP POLICY IF EXISTS "Permissive categories" ON public.categories;

DROP POLICY IF EXISTS "Brand admins manage categories" ON public.categories;
CREATE POLICY "Brand admins manage categories" ON public.categories
  FOR ALL TO authenticated
  USING (is_admin() AND can_access_brand(brand_id))
  WITH CHECK (is_admin() AND can_access_brand(brand_id));

-- 2. Atomic get_brand_categories_with_counts RPC
CREATE OR REPLACE FUNCTION public.get_brand_categories_with_counts(p_brand_id uuid)
RETURNS TABLE (
    id uuid,
    name_ar text,
    name_en text,
    slug text,
    sort_order integer,
    is_active boolean,
    parent_id uuid,
    image_url text,
    menu_icon_url text,
    is_smart boolean,
    product_count integer,
    total_product_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
                SELECT COUNT(*)::int FROM products p WHERE p.brand_id = c.brand_id AND p.is_active = true
            )
            WHEN c.slug IN ('most-selling', 'best-sellers', 'best-selling') THEN (
                SELECT COUNT(DISTINCT oi.product_id)::int 
                FROM order_items oi 
                JOIN orders o ON o.id = oi.order_id 
                JOIN products p ON p.id = oi.product_id
                WHERE o.brand_id = c.brand_id AND p.is_active = true AND o.payment_status = 'paid'
            )
            WHEN c.slug IN ('sale', 'offers', 'discounts') THEN (
                SELECT COUNT(DISTINCT p.id)::int 
                FROM products p 
                WHERE p.brand_id = c.brand_id 
                  AND p.is_active = true 
                  AND (
                      p.show_sale_badge = true 
                      OR EXISTS (
                          SELECT 1 FROM product_variants pv 
                          WHERE pv.product_id = p.id AND pv.original_price > pv.selling_price
                      )
                  )
            )
            ELSE (
                SELECT COUNT(*)::int 
                FROM products p 
                WHERE p.brand_id = c.brand_id 
                  AND p.is_active = true 
                  AND (p.category = c.slug OR p.category = c.name_en OR p.category = c.id::text)
            )
        END AS product_count,
        CASE 
            WHEN c.slug IN ('new-arrivals', 'new') THEN (
                SELECT COUNT(*)::int FROM products p WHERE p.brand_id = c.brand_id AND p.is_active = true
            )
            WHEN c.slug IN ('most-selling', 'best-sellers', 'best-selling') THEN (
                SELECT COUNT(DISTINCT oi.product_id)::int 
                FROM order_items oi 
                JOIN orders o ON o.id = oi.order_id 
                JOIN products p ON p.id = oi.product_id
                WHERE o.brand_id = c.brand_id AND p.is_active = true AND o.payment_status = 'paid'
            )
            WHEN c.slug IN ('sale', 'offers', 'discounts') THEN (
                SELECT COUNT(DISTINCT p.id)::int 
                FROM products p 
                WHERE p.brand_id = c.brand_id 
                  AND p.is_active = true 
                  AND (
                      p.show_sale_badge = true 
                      OR EXISTS (
                          SELECT 1 FROM product_variants pv 
                          WHERE pv.product_id = p.id AND pv.original_price > pv.selling_price
                      )
                  )
            )
            ELSE (
                SELECT COUNT(*)::int 
                FROM products p 
                WHERE p.brand_id = c.brand_id 
                  AND (p.category = c.slug OR p.category = c.name_en OR p.category = c.id::text)
            )
        END AS total_product_count
    FROM categories c
    WHERE c.brand_id = p_brand_id
    ORDER BY c.sort_order ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_brand_categories_with_counts(uuid) TO authenticated, anon;
