-- Migration: 20260919100000_brand_addons_platform.sql
-- Purpose: Add-ons platform foundation (tables, RLS, policies, backfill, storefront RPC)
-- Owner Decision: 'abayas' added as standalone vertical, existing fashion stores backfilled to abayas.

-- 1) Update business_settings store_vertical constraint and backfill
ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_store_vertical_check;

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_store_vertical_check
  CHECK (store_vertical IN (
    'abayas','fashion','beauty','food','gifts','print','jewelry','home','electronics','digital','general'
  ));

UPDATE public.business_settings
SET store_vertical = 'abayas'
WHERE store_vertical = 'fashion';

-- 2) Create brand_addons table
CREATE TABLE IF NOT EXISTS public.brand_addons (
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  addon_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('installed', 'disabled')),
  version integer NOT NULL DEFAULT 1,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  seeded_keys text[] NOT NULL DEFAULT '{}'::text[],
  source text NOT NULL DEFAULT 'onboarding' CHECK (source IN ('onboarding', 'manual', 'super_admin', 'migration')),
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, addon_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_addons_brand_status ON public.brand_addons(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_brand_addons_addon_id ON public.brand_addons(addon_id);

-- 3) Create platform_addon_policies table
CREATE TABLE IF NOT EXISTS public.platform_addon_policies (
  addon_id text PRIMARY KEY,
  availability text NOT NULL DEFAULT 'public' CHECK (availability IN ('public', 'beta', 'internal', 'deprecated')),
  allowed_brand_ids uuid[] DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4) Create brand_addon_events table
CREATE TABLE IF NOT EXISTS public.brand_addon_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  addon_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('install', 'disable', 'enable', 'remove', 'seed', 'upgrade', 'purge')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_addon_events_brand ON public.brand_addon_events(brand_id, created_at DESC);

-- 5) Row Level Security (RLS) & Grants
ALTER TABLE public.brand_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Brand members can view addons" ON public.brand_addons;
CREATE POLICY "Brand members can view addons" ON public.brand_addons
  FOR SELECT TO authenticated
  USING (can_access_brand(brand_id));

DROP POLICY IF EXISTS "Public can view installed public addon settings" ON public.brand_addons;
CREATE POLICY "Public can view installed public addon settings" ON public.brand_addons
  FOR SELECT TO anon, authenticated
  USING (
    status = 'installed' AND EXISTS (
      SELECT 1 FROM public.brands b WHERE b.id = brand_addons.brand_id AND b.is_active = true
    )
  );

DROP POLICY IF EXISTS "Brand admins can manage addons" ON public.brand_addons;
CREATE POLICY "Brand admins can manage addons" ON public.brand_addons
  FOR ALL TO authenticated
  USING (is_admin() AND can_access_brand(brand_id))
  WITH CHECK (is_admin() AND can_access_brand(brand_id));

GRANT SELECT ON public.brand_addons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.brand_addons TO authenticated;

ALTER TABLE public.platform_addon_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view platform addon policies" ON public.platform_addon_policies;
CREATE POLICY "Anyone authenticated can view platform addon policies" ON public.platform_addon_policies
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Super admins manage platform addon policies" ON public.platform_addon_policies;
CREATE POLICY "Super admins manage platform addon policies" ON public.platform_addon_policies
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

GRANT SELECT ON public.platform_addon_policies TO anon, authenticated;
GRANT ALL ON public.platform_addon_policies TO authenticated;

ALTER TABLE public.brand_addon_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Brand members can view addon events" ON public.brand_addon_events;
CREATE POLICY "Brand members can view addon events" ON public.brand_addon_events
  FOR SELECT TO authenticated
  USING (can_access_brand(brand_id));

DROP POLICY IF EXISTS "Brand members can insert addon events" ON public.brand_addon_events;
CREATE POLICY "Brand members can insert addon events" ON public.brand_addon_events
  FOR INSERT TO authenticated
  WITH CHECK (can_access_brand(brand_id));

GRANT SELECT, INSERT ON public.brand_addon_events TO authenticated;

-- 6) Backfill existing brands
-- fashion-core
INSERT INTO public.brand_addons (brand_id, addon_id, status, source)
SELECT bs.brand_id, 'fashion-core', 'installed', 'migration'
FROM public.business_settings bs
WHERE bs.store_vertical IN ('abayas', 'fashion')
ON CONFLICT (brand_id, addon_id) DO NOTHING;

-- abaya-pack
INSERT INTO public.brand_addons (brand_id, addon_id, status, seeded_keys, source)
SELECT bs.brand_id, 'abaya-pack', 'installed', ARRAY['abaya_default_guide', 'abaya_fit_profiles', 'abaya_sizing_order'], 'migration'
FROM public.business_settings bs
WHERE bs.store_vertical = 'abayas'
ON CONFLICT (brand_id, addon_id) DO NOTHING;

-- size-guides
INSERT INTO public.brand_addons (brand_id, addon_id, status, source)
SELECT bs.brand_id, 'size-guides', 'installed', 'migration'
FROM public.business_settings bs
WHERE (bs.store_modules->>'size_guide')::boolean = true
   OR (bs.store_modules->>'size_guide' IS NULL AND bs.store_vertical IN ('abayas', 'fashion', 'jewelry'))
ON CONFLICT (brand_id, addon_id) DO NOTHING;

-- fit-passport
INSERT INTO public.brand_addons (brand_id, addon_id, status, source)
SELECT bs.brand_id, 'fit-passport', 'installed', 'migration'
FROM public.business_settings bs
WHERE (bs.store_modules->>'fit_passport')::boolean = true
   OR (bs.store_modules->>'fit_passport' IS NULL AND bs.store_vertical IN ('abayas', 'fashion'))
ON CONFLICT (brand_id, addon_id) DO NOTHING;

-- made-to-order
INSERT INTO public.brand_addons (brand_id, addon_id, status, source)
SELECT bs.brand_id, 'made-to-order', 'installed', 'migration'
FROM public.business_settings bs
WHERE (bs.store_modules->>'made_to_order')::boolean = true
   OR (bs.store_modules->>'made_to_order' IS NULL AND bs.store_vertical IN ('abayas', 'fashion', 'print', 'jewelry'))
ON CONFLICT (brand_id, addon_id) DO NOTHING;

-- Seed default platform addon policies
INSERT INTO public.platform_addon_policies (addon_id, availability)
VALUES
  ('size-guides', 'public'),
  ('fit-passport', 'public'),
  ('made-to-order', 'public'),
  ('fashion-core', 'public'),
  ('abaya-pack', 'public'),
  ('beauty-perfume', 'public'),
  ('food-beverage', 'public'),
  ('digital-products', 'public'),
  ('gifts', 'public'),
  ('print-stamps', 'public'),
  ('jewelry', 'public')
ON CONFLICT (addon_id) DO NOTHING;

-- 7) Update get_storefront_page_data to include installed addons
CREATE OR REPLACE FUNCTION public.get_storefront_page_data(p_brand_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- 5. Fetch active products with variants (including size_guide_id, size_guide_hidden, custom_fields, stock_incubator, is_made_to_order)
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
      'size_guide_id', p.size_guide_id,
      'size_guide_hidden', p.size_guide_hidden,
      'custom_fields', p.custom_fields,
      'product_variants', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', pv.id,
          'selling_price', pv.selling_price,
          'original_price', pv.original_price,
          'stock_main', pv.stock_main,
          'stock_incubator', pv.stock_incubator,
          'size', pv.size,
          'color', pv.color
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

  -- 10. Fetch installed addons
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'addon_id', ba.addon_id,
      'status', ba.status,
      'public_settings', ba.public_settings
    )
  ), '[]'::jsonb)
  INTO v_addons
  FROM public.brand_addons ba
  WHERE ba.brand_id = v_brand_id AND ba.status = 'installed';

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
$$;

GRANT EXECUTE ON FUNCTION public.get_storefront_page_data(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
