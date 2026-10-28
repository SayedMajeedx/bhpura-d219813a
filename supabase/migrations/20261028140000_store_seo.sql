-- A store's search listing, in each language, and the words of a product's and a category's own.
--
-- Until now a store had one title and one description for its home page (brands.meta_title,
-- meta_description), shown in both languages: Pura's English title was on its Arabic home page.
-- Now the English page has its own (the existing columns stay the Arabic page's, and the English
-- page falls back to them while it has none), a product and a category may write the title and
-- the description Google shows for their page, in each language, and the store may keep the code
-- Google Search Console gives to verify it.
--
--   brands.meta_title_en / meta_description_en  the English home page's (70 / 160 characters)
--   brands.google_site_verification              Search Console's token (the content of its tag)
--   products.seo_*  and  categories.seo_*        title and description, Arabic and English
--
-- All are plain text: tags and control characters are stripped on every write, like the existing
-- fields. The page-data function is the live one (migration 20261027120000) with the brand's three
-- keys and the category's four added, and nothing else changed (tests/store-seo-migration.test.ts).

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS meta_title_en varchar(70),
  ADD COLUMN IF NOT EXISTS meta_description_en varchar(160),
  ADD COLUMN IF NOT EXISTS google_site_verification varchar(100);

ALTER TABLE public.brands DROP CONSTRAINT IF EXISTS brands_meta_title_en_plain_text;
ALTER TABLE public.brands ADD CONSTRAINT brands_meta_title_en_plain_text
  CHECK (meta_title_en IS NULL OR (char_length(meta_title_en) <= 70 AND meta_title_en !~ '[<>]'));
ALTER TABLE public.brands DROP CONSTRAINT IF EXISTS brands_meta_description_en_plain_text;
ALTER TABLE public.brands ADD CONSTRAINT brands_meta_description_en_plain_text
  CHECK (meta_description_en IS NULL OR (char_length(meta_description_en) <= 160 AND meta_description_en !~ '[<>]'));
ALTER TABLE public.brands DROP CONSTRAINT IF EXISTS brands_google_site_verification_token;
ALTER TABLE public.brands ADD CONSTRAINT brands_google_site_verification_token
  CHECK (google_site_verification IS NULL OR google_site_verification ~ '^[A-Za-z0-9_-]{10,100}$');

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS seo_title_ar varchar(70),
  ADD COLUMN IF NOT EXISTS seo_title_en varchar(70),
  ADD COLUMN IF NOT EXISTS seo_description_ar varchar(160),
  ADD COLUMN IF NOT EXISTS seo_description_en varchar(160);

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS seo_title_ar varchar(70),
  ADD COLUMN IF NOT EXISTS seo_title_en varchar(70),
  ADD COLUMN IF NOT EXISTS seo_description_ar varchar(160),
  ADD COLUMN IF NOT EXISTS seo_description_en varchar(160);

COMMENT ON COLUMN public.brands.meta_title_en IS 'Plain-text title of the English home page (70 characters).';
COMMENT ON COLUMN public.brands.meta_description_en IS 'Plain-text description of the English home page (160 characters).';
COMMENT ON COLUMN public.brands.google_site_verification IS 'Google Search Console verification token (the content of its meta tag).';
COMMENT ON COLUMN public.products.seo_title_ar IS 'Plain-text title Google shows for the product, Arabic (70 characters).';
COMMENT ON COLUMN public.categories.seo_title_ar IS 'Plain-text title Google shows for the category, Arabic (70 characters).';

-- Plain text, bounded, and empty is none.
CREATE OR REPLACE FUNCTION public.clean_seo_text(p_value text, p_max integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(left(trim(regexp_replace(regexp_replace(regexp_replace(coalesce(p_value, ''), '<[^>]*>', ' ', 'g'), '[[:cntrl:]]', ' ', 'g'), '[[:space:]]+', ' ', 'g')), p_max), '')
$$;

CREATE OR REPLACE FUNCTION public.sanitize_brand_seo_fields_en()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.meta_title_en := public.clean_seo_text(NEW.meta_title_en, 70);
  NEW.meta_description_en := public.clean_seo_text(NEW.meta_description_en, 160);
  NEW.google_site_verification := NULLIF(trim(coalesce(NEW.google_site_verification, '')), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_brand_seo_fields_en_trigger ON public.brands;
CREATE TRIGGER sanitize_brand_seo_fields_en_trigger
BEFORE INSERT OR UPDATE OF meta_title_en, meta_description_en, google_site_verification ON public.brands
FOR EACH ROW EXECUTE FUNCTION public.sanitize_brand_seo_fields_en();

CREATE OR REPLACE FUNCTION public.sanitize_listing_seo_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.seo_title_ar := public.clean_seo_text(NEW.seo_title_ar, 70);
  NEW.seo_title_en := public.clean_seo_text(NEW.seo_title_en, 70);
  NEW.seo_description_ar := public.clean_seo_text(NEW.seo_description_ar, 160);
  NEW.seo_description_en := public.clean_seo_text(NEW.seo_description_en, 160);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_product_seo_fields_trigger ON public.products;
CREATE TRIGGER sanitize_product_seo_fields_trigger
BEFORE INSERT OR UPDATE OF seo_title_ar, seo_title_en, seo_description_ar, seo_description_en ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sanitize_listing_seo_fields();

DROP TRIGGER IF EXISTS sanitize_category_seo_fields_trigger ON public.categories;
CREATE TRIGGER sanitize_category_seo_fields_trigger
BEFORE INSERT OR UPDATE OF seo_title_ar, seo_title_en, seo_description_ar, seo_description_en ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.sanitize_listing_seo_fields();

-- What a visitor reads is what Google reads: public, like the existing meta_title.
GRANT SELECT (meta_title_en, meta_description_en, google_site_verification) ON public.brands TO anon;
GRANT SELECT (meta_title_en, meta_description_en, google_site_verification) ON public.brands TO authenticated;
GRANT SELECT (seo_title_ar, seo_title_en, seo_description_ar, seo_description_en) ON public.products TO anon;
GRANT SELECT (seo_title_ar, seo_title_en, seo_description_ar, seo_description_en) ON public.products TO authenticated;
GRANT INSERT (seo_title_ar, seo_title_en, seo_description_ar, seo_description_en),
      UPDATE (seo_title_ar, seo_title_en, seo_description_ar, seo_description_en) ON public.products TO authenticated;
GRANT SELECT (seo_title_ar, seo_title_en, seo_description_ar, seo_description_en) ON public.categories TO anon;
GRANT SELECT (seo_title_ar, seo_title_en, seo_description_ar, seo_description_en) ON public.categories TO authenticated;

NOTIFY pgrst, 'reload schema';

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
