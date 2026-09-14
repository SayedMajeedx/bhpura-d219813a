-- Migration: Size Guide Studio (Multi-tier custom size guides)
-- Phase 2 of Store Vertical & Modules Architecture

CREATE TABLE IF NOT EXISTS public.size_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  template_key text NULL,
  base_unit text NOT NULL DEFAULT 'cm' CHECK (base_unit IN ('cm','in','none')),
  columns jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(columns) = 'array'),
  rows jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rows) = 'array'),
  how_to_measure jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(how_to_measure) = 'array'),
  diagram_url text NULL,
  video_url text NULL,
  notes_ar text NULL,
  notes_en text NULL,
  placement text NOT NULL DEFAULT 'modal' CHECK (placement IN ('modal','inline','both')),
  recommender_enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_size_guides_brand ON public.size_guides(brand_id);
CREATE UNIQUE INDEX IF NOT EXISTS size_guides_one_default_per_brand
  ON public.size_guides(brand_id) WHERE is_default;

DROP TRIGGER IF EXISTS size_guides_set_updated_at ON public.size_guides;
CREATE TRIGGER size_guides_set_updated_at
  BEFORE UPDATE ON public.size_guides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Product and category relations
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS size_guide_id uuid NULL REFERENCES public.size_guides(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS size_guide_hidden boolean NOT NULL DEFAULT false;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS size_guide_id uuid NULL REFERENCES public.size_guides(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_size_guide ON public.products(size_guide_id) WHERE size_guide_id IS NOT NULL;

-- RLS policies
ALTER TABLE public.size_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active size guides" ON public.size_guides;
CREATE POLICY "Public can read active size guides" ON public.size_guides
  FOR SELECT TO anon, authenticated
  USING (is_active = true AND EXISTS (
    SELECT 1 FROM public.brands b WHERE b.id = size_guides.brand_id AND b.is_active = true));

DROP POLICY IF EXISTS "Brand admins manage size guides" ON public.size_guides;
CREATE POLICY "Brand admins manage size guides" ON public.size_guides
  FOR ALL TO authenticated
  USING (is_admin() AND can_access_brand(brand_id))
  WITH CHECK (is_admin() AND can_access_brand(brand_id));

GRANT SELECT ON public.size_guides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.size_guides TO authenticated;

-- Backfill: existing fashion brands receive the default Gulf Abaya guide (50-60 in)
INSERT INTO public.size_guides
  (brand_id, name_ar, name_en, template_key, base_unit, columns, rows, how_to_measure, is_default)
SELECT bs.brand_id, 'دليل مقاسات العبايات', 'Abaya Size Guide', 'abaya_gulf', 'in',
  '[{"key":"length","label_ar":"الطول","label_en":"Length","kind":"measurement","measurement_key":"length"},
    {"key":"bust","label_ar":"محيط الصدر","label_en":"Bust","kind":"measurement","measurement_key":"bust"},
    {"key":"sleeve","label_ar":"طول الكم","label_en":"Sleeve","kind":"measurement","measurement_key":"sleeve"},
    {"key":"shoulder","label_ar":"عرض الكتف","label_en":"Shoulder","kind":"measurement","measurement_key":"shoulder"}]'::jsonb,
  '[{"label":"50","values":{"length":50,"bust":20,"sleeve":25,"shoulder":14.5}},
    {"label":"52","values":{"length":52,"bust":21,"sleeve":26,"shoulder":15}},
    {"label":"54","values":{"length":54,"bust":22,"sleeve":27,"shoulder":15.5}},
    {"label":"56","values":{"length":56,"bust":23,"sleeve":28,"shoulder":16}},
    {"label":"58","values":{"length":58,"bust":24,"sleeve":29,"shoulder":16.5}},
    {"label":"60","values":{"length":60,"bust":25,"sleeve":30,"shoulder":17}}]'::jsonb,
  '[{"title_ar":"الطول","title_en":"Length","body_ar":"يُقاس من أعلى الكتف عند الرقبة نزولاً حتى الطول المطلوب.","body_en":"Measure from the top of the shoulder down to your desired length."},
    {"title_ar":"محيط الصدر","title_en":"Bust","body_ar":"يُقاس من أوسع نقطة مع إبقاء الشريط مريحاً.","body_en":"Measure around the fullest part keeping the tape comfortably loose."},
    {"title_ar":"طول الكم","title_en":"Sleeve","body_ar":"يُقاس من عظمة الكتف حتى المعصم.","body_en":"Measure from the shoulder bone down to the wrist."}]'::jsonb,
  true
FROM public.business_settings bs
WHERE bs.store_vertical = 'fashion'
  AND NOT EXISTS (SELECT 1 FROM public.size_guides g WHERE g.brand_id = bs.brand_id);

-- Update get_storefront_page_data to include size_guides and product/category size guide fields
CREATE OR REPLACE FUNCTION public.get_storefront_page_data(p_brand_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

  -- 5. Fetch active products with variants (including size_guide_id, size_guide_hidden, custom_fields, stock_incubator)
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
    'size_guides', v_size_guides
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_storefront_page_data(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
