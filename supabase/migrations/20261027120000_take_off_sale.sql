-- Taking a product, or a whole category, off sale until a time (the owner's request of
-- 2026-10-27, the third idea taken from comparing Boutq with another platform): sold out for the
-- day, the oven is full, a piece is being photographed. It stays on the store; a shopper sees when
-- it is back and cannot buy it until then.
--
--   * products.unavailable_until: the product's own ('infinity': until the store puts it back).
--   * categories.unavailable_until: the category's; every product filed under it carries it in
--     products.category_unavailable_until, written by the database alone (on the product's every
--     write, and when the category's changes), so every reader looks at the product only. A
--     product keeps its own setting: it comes back as it was when its category does.
--   * A storefront order line for a product off sale is refused (PRODUCT_UNAVAILABLE:<product>).
--     Staff orders are not touched.
--
-- The storefront reads both columns through the product selects and get_storefront_page_data;
-- the one availability rule (src/lib/product-availability.ts, `offSaleUntil`) decides from them.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unavailable_until timestamptz,
  ADD COLUMN IF NOT EXISTS category_unavailable_until timestamptz;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS unavailable_until timestamptz;

COMMENT ON COLUMN public.products.unavailable_until IS
  'Off sale until this moment (infinity: until put back). The store still shows it.';
COMMENT ON COLUMN public.products.category_unavailable_until IS
  'Its category''s off-sale moment, kept by the database (trg_products_off_sale_from_category).';
COMMENT ON COLUMN public.categories.unavailable_until IS
  'Every product filed here is off sale until this moment (infinity: until put back).';

GRANT SELECT (unavailable_until, category_unavailable_until) ON public.products TO anon;
GRANT SELECT (unavailable_until, category_unavailable_until) ON public.products TO authenticated;
GRANT INSERT (unavailable_until), UPDATE (unavailable_until) ON public.products TO authenticated;

-- A product carries its category's moment: worked out on every write of the product, so a
-- product moved to another category, or written by a form that sends the column, is right.
-- Named to run after the trigger that fills a new product's store (`trg_products_default_brand`).
CREATE OR REPLACE FUNCTION public.products_off_sale_from_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.category_unavailable_until := (
    SELECT c.unavailable_until
      FROM public.categories c
     WHERE c.brand_id = NEW.brand_id
       AND NEW.category IS NOT NULL
       AND c.slug = NEW.category
     ORDER BY c.unavailable_until DESC NULLS LAST
     LIMIT 1
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.products_off_sale_from_category() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_products_off_sale_from_category ON public.products;
CREATE TRIGGER trg_products_off_sale_from_category
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_off_sale_from_category();

-- A category's moment reaches its products when it changes (and when a category is renamed, the
-- products under its old address are read again).
CREATE OR REPLACE FUNCTION public.categories_off_sale_to_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.products p
     SET category_unavailable_until = NULL
   WHERE p.brand_id = NEW.brand_id
     AND p.category IN (NEW.slug, OLD.slug)
     AND p.category IS NOT NULL;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.categories_off_sale_to_products() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_categories_off_sale_to_products ON public.categories;
CREATE TRIGGER trg_categories_off_sale_to_products
  AFTER UPDATE OF unavailable_until, slug ON public.categories
  FOR EACH ROW
  WHEN (OLD.unavailable_until IS DISTINCT FROM NEW.unavailable_until OR OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION public.categories_off_sale_to_products();

-- A storefront order line for a product off sale is refused. Named for the order the lines'
-- triggers run in: a BEFORE trigger, after any that fills the line.
CREATE OR REPLACE FUNCTION public.refuse_storefront_line_off_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = NEW.order_id AND o.channel = 'storefront'
  ) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.products p
     WHERE p.id = NEW.product_id
       AND greatest(p.unavailable_until, p.category_unavailable_until) > now()
  ) THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE:%', NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_storefront_line_off_sale() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_items_off_sale ON public.order_items;
CREATE TRIGGER trg_order_items_off_sale
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.refuse_storefront_line_off_sale();

-- ── The home page's products ───────────────────────────────────────────────────────────────────
-- The live get_storefront_page_data (equal to 20261024130000's, read from production on
-- 2026-10-27) with the two moments added to each product.
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
    'meta_description', b.meta_description
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
        WHERE pv.product_id = p.id
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
      'size_guide_id', c.size_guide_id
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
