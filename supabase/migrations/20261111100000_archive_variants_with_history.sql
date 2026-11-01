-- A size with history is archived, never deleted.
--
-- A variant is a product's size (or colour, or its default, src/lib/default-variant.ts). Deleting
-- one deletes with it its stock ledger (inventory_movements), the pieces its orders took
-- (order_inventory_allocations, which the stock engine reads to give pieces back on a cancel)
-- and its cost, and leaves its order, supplier and return lines pointing at nothing: a completed
-- Pura order line of 2026-09-28 lost its size that way. The owner's decision of 2026-11-01: a
-- size that has a history is archived instead, hidden from the store and the inventory and kept
-- for its history; a size with none is still deleted.
--
-- * `product_variants.archived_at`: when it was archived; null for a size in use.
-- * `remove_product_variants(ids)`: what the inventory's delete calls. Each size is deleted when
--   it has no history and archived when it has one (`variant_has_history`), and its barcode is
--   freed for a new size. It holds no pieces first (VARIANT_HAS_STOCK: record them as sold, lost
--   or moved), and a product keeps a size in use (PRODUCT_NEEDS_A_VARIANT). Staff with
--   `manage_inventory`, as for stock changes.
-- * A direct delete of a size with history is refused (VARIANT_HAS_HISTORY), unless its product
--   is being deleted (the product is gone by then). A service is left alone: its lengths are one
--   set that set_service_lengths writes whole, matched by length.
-- * A size that gets pieces back (an order cancelled, a return restocked, a supplier's pieces
--   received) is in use again: it is no longer archived.
-- * Hidden from a shopper: the visitors' read policy, the home page's products
--   (get_storefront_page_data) and the sale collection (category_product_on_sale), each the live
--   function with one condition added, and a storefront order line (PRODUCT_UNAVAILABLE, the
--   words checkout already has). Staff orders are not touched.
-- * A product keeps a size in use: product_keeps_a_variant (migration 20261110100000) now counts
--   only sizes that are not archived.

ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS archived_at timestamptz;
GRANT SELECT (archived_at) ON public.product_variants TO authenticated, anon;

-- ── Whether a size has a history ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.variant_has_history(p_variant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.inventory_movements WHERE variant_id = p_variant_id)
      OR EXISTS (SELECT 1 FROM public.order_items WHERE variant_id = p_variant_id)
      OR EXISTS (SELECT 1 FROM public.purchase_order_items WHERE variant_id = p_variant_id)
      OR EXISTS (SELECT 1 FROM public.purchase_order_receipts WHERE variant_id = p_variant_id)
      OR EXISTS (
           SELECT 1 FROM public.return_items
            WHERE variant_id = p_variant_id OR replacement_variant_id = p_variant_id
         )
      OR EXISTS (SELECT 1 FROM public.booking_items WHERE variant_id = p_variant_id)
      OR EXISTS (SELECT 1 FROM public.incubator_movements WHERE variant_id = p_variant_id)
      OR EXISTS (SELECT 1 FROM public.incubator_sales WHERE variant_id = p_variant_id);
$$;

REVOKE ALL ON FUNCTION public.variant_has_history(uuid) FROM PUBLIC, anon, authenticated;

-- ── A direct delete never takes a history ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.variant_delete_keeps_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The product is being deleted, or is a service: as before.
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
     WHERE p.id = OLD.product_id AND COALESCE(p.item_kind, 'product') <> 'service'
  ) THEN
    RETURN OLD;
  END IF;
  IF public.variant_has_history(OLD.id) THEN
    RAISE EXCEPTION 'VARIANT_HAS_HISTORY';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.variant_delete_keeps_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_product_variants_keep_history ON public.product_variants;
CREATE TRIGGER trg_product_variants_keep_history
  BEFORE DELETE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.variant_delete_keeps_history();

-- ── A size with pieces is in use ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.variant_with_pieces_is_in_use()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL
     AND COALESCE(NEW.stock_main, 0) + COALESCE(NEW.stock_incubator, 0) > 0 THEN
    NEW.archived_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.variant_with_pieces_is_in_use() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_product_variants_pieces_in_use ON public.product_variants;
CREATE TRIGGER trg_product_variants_pieces_in_use
  BEFORE UPDATE OF stock_main, stock_incubator ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.variant_with_pieces_is_in_use();

-- ── What the inventory's delete calls ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_product_variants(p_variant_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant public.product_variants%ROWTYPE;
  v_id uuid;
  v_products uuid[] := '{}';
  v_deleted integer := 0;
  v_archived integer := 0;
BEGIN
  IF p_variant_ids IS NULL OR cardinality(p_variant_ids) = 0 THEN
    RETURN jsonb_build_object('deleted', 0, 'archived', 0);
  END IF;
  IF cardinality(p_variant_ids) > 500 THEN
    RAISE EXCEPTION 'TOO_MANY_VARIANTS';
  END IF;

  FOREACH v_id IN ARRAY (SELECT array_agg(DISTINCT x) FROM unnest(p_variant_ids) AS x) LOOP
    SELECT * INTO v_variant FROM public.product_variants WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'VARIANT_NOT_FOUND';
    END IF;
    IF NOT public.can_access_brand(v_variant.brand_id)
       OR NOT public.has_permission('manage_inventory') THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    IF v_variant.archived_at IS NOT NULL THEN
      CONTINUE;
    END IF;
    IF COALESCE(v_variant.stock_main, 0) + COALESCE(v_variant.stock_incubator, 0) > 0 THEN
      RAISE EXCEPTION 'VARIANT_HAS_STOCK';
    END IF;
    v_products := array_append(v_products, v_variant.product_id);

    IF public.variant_has_history(v_id)
       AND EXISTS (
         SELECT 1 FROM public.products p
          WHERE p.id = v_variant.product_id AND COALESCE(p.item_kind, 'product') <> 'service'
       ) THEN
      UPDATE public.product_variants SET archived_at = now(), barcode = NULL WHERE id = v_id;
      v_archived := v_archived + 1;
    ELSE
      DELETE FROM public.product_variants WHERE id = v_id;
      v_deleted := v_deleted + 1;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.products p
     WHERE p.id = ANY (v_products)
       AND COALESCE(p.item_kind, 'product') <> 'service'
       AND NOT EXISTS (
         SELECT 1 FROM public.product_variants v
          WHERE v.product_id = p.id AND v.archived_at IS NULL
       )
  ) THEN
    RAISE EXCEPTION 'PRODUCT_NEEDS_A_VARIANT';
  END IF;

  RETURN jsonb_build_object('deleted', v_deleted, 'archived', v_archived);
END;
$$;

REVOKE ALL ON FUNCTION public.remove_product_variants(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_product_variants(uuid[]) TO authenticated;

-- ── A product keeps a size in use ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.product_keeps_a_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.products p
     WHERE p.id = OLD.product_id
       AND COALESCE(p.item_kind, 'product') <> 'service'
       AND NOT EXISTS (
         SELECT 1 FROM public.product_variants v
          WHERE v.product_id = p.id AND v.archived_at IS NULL
       )
  ) THEN
    RAISE EXCEPTION 'PRODUCT_NEEDS_A_VARIANT';
  END IF;
  RETURN NULL;
END;
$$;

-- ── Hidden from a shopper ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "variants public read" ON public.product_variants;
CREATE POLICY "variants public read" ON public.product_variants
  FOR SELECT TO anon, authenticated
  USING (
    archived_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = product_variants.product_id AND p.is_active = true
    )
  );

CREATE OR REPLACE FUNCTION public.refuse_storefront_line_archived_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.variant_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = NEW.order_id AND o.channel = 'storefront'
  ) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.product_variants v
     WHERE v.id = NEW.variant_id AND v.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE:%', NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_storefront_line_archived_variant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_items_archived_variant ON public.order_items;
CREATE TRIGGER trg_order_items_archived_variant
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.refuse_storefront_line_archived_variant();

-- Whether a product is on sale (the sale collection): the live rule (migration 20261025100000),
-- reading its sizes in use only. An archived size's old sale price no longer puts it on sale.
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
    WHERE pv.archived_at IS NULL
  )
  SELECT EXISTS (
    SELECT 1 FROM v
    WHERE v.selling > 0
      AND COALESCE(v.original_price, 0) > v.selling
      AND (v.buyable OR NOT EXISTS (SELECT 1 FROM v AS w WHERE w.buyable))
  );
$$;

-- The home page's products: the live function (migration 20261028140000), its sizes in use only.
CREATE OR REPLACE FUNCTION public.get_storefront_page_data(p_brand_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand jsonb;
  v_settings jsonb;
  v_benefit jsonb;
  v_tracking jsonb;
  v_products jsonb;
  v_categories jsonb;
  v_bestsellers jsonb;
  v_trending jsonb;
  v_size_guides jsonb;
  v_addons jsonb;
  v_brand_id uuid;
  v_is_trial_expired boolean := false;
BEGIN
  -- 1. Fetch brand
  SELECT jsonb_build_object(
    'id', b.id,
    'slug', b.slug,
    'name_en', b.name_en,
    'name_ar', b.name_ar,
    'logo_url', b.logo_url,
    'is_active', b.is_active,
    'plan_type', b.plan_type,
    'trial_ends_at', b.trial_ends_at,
    'subscription_status', b.subscription_status,
    'hero_media', b.hero_media,
    'primary_color', b.primary_color,
    'about_ar', b.about_ar,
    'about_en', b.about_en,
    'meta_title', b.meta_title,
    'meta_description', b.meta_description,
    'meta_title_en', b.meta_title_en,
    'meta_description_en', b.meta_description_en,
    'google_site_verification', b.google_site_verification
  ), b.id
  INTO v_brand, v_brand_id
  FROM public.brands b
  WHERE b.slug = p_brand_slug
  LIMIT 1;

  IF v_brand IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check if trial has expired or store is inactive
  IF v_brand->>'plan_type' = 'trial'
     AND v_brand->>'trial_ends_at' IS NOT NULL
     AND (v_brand->>'trial_ends_at')::timestamptz <= now()
     AND COALESCE(v_brand->>'subscription_status', '') <> 'active_paid'
  THEN
    v_is_trial_expired := true;
  END IF;

  IF (v_brand->>'is_active')::boolean = false OR v_is_trial_expired THEN
    RETURN jsonb_build_object(
      'brand', v_brand,
      'is_suspended', true,
      'suspension_reason', CASE WHEN v_is_trial_expired THEN 'trial_expired' ELSE 'inactive' END
    );
  END IF;

  -- 2. Fetch brand_public_settings
  SELECT to_jsonb(s.*)
  INTO v_settings
  FROM public.brand_public_settings s
  WHERE s.brand_id = v_brand_id;

  -- 3. Fetch benefit settings
  SELECT COALESCE(jsonb_agg(to_jsonb(bs.*)), '[]'::jsonb)
  INTO v_benefit
  FROM public.get_public_benefit_settings(v_brand_id) bs;

  -- 4. Fetch tracking settings
  SELECT jsonb_build_object(
    'google_analytics_enabled', ts.google_analytics_enabled,
    'google_analytics_id', ts.google_analytics_id,
    'meta_pixel_enabled', ts.meta_pixel_enabled,
    'meta_pixel_id', ts.meta_pixel_id,
    'consent_required', ts.consent_required
  )
  INTO v_tracking
  FROM public.brand_tracking_settings ts
  WHERE ts.brand_id = v_brand_id;

  -- 5. Fetch active products with variants: the same columns as the app's
  --    PRODUCT_CARD_SELECT (src/lib/data/storefront/selects.ts), plus a
  --    service's kind, whether it is a package, its extra-hour price, place and
  --    included lines.
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'name_ar', p.name_ar,
      'name_en', p.name_en,
      'description', p.description,
      'description_ar', p.description_ar,
      'description_en', p.description_en,
      'category', p.category,
      'image_url', p.image_url,
      'media', p.media,
      'brand_id', p.brand_id,
      'created_at', p.created_at,
      'featured_trending', p.featured_trending,
      'show_sale_badge', p.show_sale_badge,
      'is_made_to_order', p.is_made_to_order,
      'made_to_order_available', p.made_to_order_available,
      'made_to_order_paused_at', p.made_to_order_paused_at,
      -- ADDED (20261027120000): off sale until (its own, and its category's).
      'unavailable_until', p.unavailable_until,
      'category_unavailable_until', p.category_unavailable_until,
      'item_kind', p.item_kind,
      'is_package', p.is_package,
      'extra_hour_price', p.extra_hour_price,
      'service_location', p.service_location,
      'service_includes', p.service_includes,
      'size_guide_id', p.size_guide_id,
      'size_guide_hidden', p.size_guide_hidden,
      'custom_fields', p.custom_fields,
      -- What the product is (products.details): the cards' key fact reads it.
      'details', p.details,
      'product_variants', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', pv.id,
          'selling_price', pv.selling_price,
          'original_price', pv.original_price,
          'stock_main', pv.stock_main,
          'stock_incubator', pv.stock_incubator,
          'size', pv.size,
          'size_unit', pv.size_unit,
          'color', pv.color,
          'image_url', pv.image_url,
          'duration_minutes', pv.duration_minutes
        ))
        FROM public.product_variants pv
        WHERE pv.product_id = p.id AND pv.archived_at IS NULL
      ), '[]'::jsonb)
    ) ORDER BY p.created_at DESC
  ), '[]'::jsonb)
  INTO v_products
  FROM public.products p
  WHERE p.brand_id = v_brand_id AND p.is_active = true;

  -- 6. Fetch active categories (including size_guide_id)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name_en', c.name_en,
      'name_ar', c.name_ar,
      'slug', c.slug,
      'image_url', c.image_url,
      'parent_id', c.parent_id,
      'sort_order', c.sort_order,
      'menu_icon_url', c.menu_icon_url,
      'size_guide_id', c.size_guide_id,
      'seo_title_ar', c.seo_title_ar,
      'seo_title_en', c.seo_title_en,
      'seo_description_ar', c.seo_description_ar,
      'seo_description_en', c.seo_description_en
    ) ORDER BY c.sort_order ASC
  ), '[]'::jsonb)
  INTO v_categories
  FROM public.categories c
  WHERE c.brand_id = v_brand_id AND c.is_active = true;

  -- 7. Fetch best sellers
  SELECT COALESCE(jsonb_agg(to_jsonb(bs.*)), '[]'::jsonb)
  INTO v_bestsellers
  FROM public.get_storefront_best_sellers(p_brand_slug, 8) bs;

  -- 8. Fetch trending
  SELECT COALESCE(jsonb_agg(to_jsonb(tr.*)), '[]'::jsonb)
  INTO v_trending
  FROM public.get_storefront_trending(p_brand_slug, 8) tr;

  -- 9. Fetch active size guides
  SELECT COALESCE(jsonb_agg(to_jsonb(g.*) ORDER BY g.sort_order, g.created_at), '[]'::jsonb)
  INTO v_size_guides
  FROM public.size_guides g
  WHERE g.brand_id = v_brand_id AND g.is_active = true;

  -- 10. Fetch installed addons from brand_public_addons view
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'addon_id', ba.addon_id,
      'status', ba.status,
      'public_settings', ba.public_settings
    )
  ), '[]'::jsonb)
  INTO v_addons
  FROM public.brand_public_addons ba
  WHERE ba.brand_id = v_brand_id;

  RETURN jsonb_build_object(
    'brand', v_brand,
    'is_suspended', false,
    'settings', v_settings,
    'benefitSettings', v_benefit,
    'trackingSettings', v_tracking,
    'products', v_products,
    'categories', v_categories,
    'bestSellerRows', v_bestsellers,
    'trendingRows', v_trending,
    'size_guides', v_size_guides,
    'addons', v_addons
  );
END;
$function$;
