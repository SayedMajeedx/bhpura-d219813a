-- Migration: 20260924100000_brand_wizard_provisioning.sql
-- Description: Add brand provisioning v2, brand_palette, invoice inheritance flags, and primary color trigger

-- 1. Add columns to business_settings
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS invoice_inherit_brand_color boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_inherit_brand_font boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS brand_palette jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.business_settings.invoice_inherit_brand_color IS
  'When true, invoice primary color inherits from storefront_accent_color automatically.';

COMMENT ON COLUMN public.business_settings.invoice_inherit_brand_font IS
  'When true, invoice fonts inherit from brand typography settings automatically.';

COMMENT ON COLUMN public.business_settings.brand_palette IS
  'JSON storing extracted logo color palette including primary, secondary, background, text, and mood.';

-- 2. Ensure store_vertical check constraint supports all GCC boutique verticals
ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_store_vertical_check;

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_store_vertical_check
  CHECK (store_vertical IN (
    'abayas',
    'fashion',
    'beauty',
    'coffee',
    'food',
    'gifts',
    'print',
    'jewelry',
    'home',
    'electronics',
    'digital',
    'general'
  ));

-- 3. Trigger to keep brands.primary_color and invoice primary_color synchronized with storefront_accent_color
CREATE OR REPLACE FUNCTION public.sync_business_settings_brand_primary_color()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When storefront_accent_color is set or updated, update the brand record
  IF NEW.storefront_accent_color IS NOT NULL THEN
    UPDATE public.brands
    SET primary_color = NEW.storefront_accent_color
    WHERE id = NEW.brand_id
      AND (primary_color IS DISTINCT FROM NEW.storefront_accent_color);
  END IF;

  -- If invoice inherits brand color, sync business_settings.primary_color
  IF NEW.invoice_inherit_brand_color = true AND NEW.storefront_accent_color IS NOT NULL THEN
    NEW.primary_color = NEW.storefront_accent_color;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_settings_sync_brand_primary_color ON public.business_settings;
CREATE TRIGGER trg_business_settings_sync_brand_primary_color
  BEFORE INSERT OR UPDATE OF storefront_accent_color, invoice_inherit_brand_color
  ON public.business_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_business_settings_brand_primary_color();

-- 4. Backfill existing records (order matters — never change an existing brand's invoice colour)
-- 4a. Brands that never set a storefront accent inherit the brand colour they already show.
UPDATE public.business_settings bs
SET storefront_accent_color = b.primary_color
FROM public.brands b
WHERE b.id = bs.brand_id
  AND bs.storefront_accent_color IS NULL
  AND b.primary_color IS NOT NULL;

-- 4b. Preserve intentional differences: an invoice colour that already differs from the
--     storefront accent must NOT be overwritten — mark it as independent first.
UPDATE public.business_settings
SET invoice_inherit_brand_color = false
WHERE storefront_accent_color IS NOT NULL
  AND primary_color IS NOT NULL
  AND lower(primary_color) IS DISTINCT FROM lower(storefront_accent_color);

-- 4c. Same for fonts: a custom invoice font stays independent.
UPDATE public.business_settings
SET invoice_inherit_brand_font = false
WHERE font_family IS NOT NULL
  AND font_family NOT IN ('', 'Inter', 'Cormorant Garamond')
  AND font_family IS DISTINCT FROM storefront_font_en;

-- 4d. Now sync brands.primary_color (display-only mirror) with the storefront accent.
UPDATE public.brands b
SET primary_color = bs.storefront_accent_color
FROM public.business_settings bs
WHERE bs.brand_id = b.id
  AND bs.storefront_accent_color IS NOT NULL
  AND b.primary_color IS DISTINCT FROM bs.storefront_accent_color;

-- 4e. Invoice colour inherits only where it was already identical (inherit flag still true).
UPDATE public.business_settings
SET primary_color = storefront_accent_color
WHERE invoice_inherit_brand_color = true
  AND storefront_accent_color IS NOT NULL
  AND primary_color IS DISTINCT FROM storefront_accent_color;

-- 5. Tenant Provisioning RPC v2
CREATE OR REPLACE FUNCTION public.create_tenant_with_defaults_v2(
  p_slug text,
  p_name_en text,
  p_name_ar text,
  p_owner_id uuid,
  p_business_type text DEFAULT 'Fashion',
  p_store_vertical text DEFAULT 'general',
  p_storefront_accent_color text DEFAULT '#1c1917',
  p_storefront_background_color text DEFAULT '#ffffff',
  p_brand_palette jsonb DEFAULT '{}'::jsonb,
  p_storefront_font_ar text DEFAULT 'Tajawal',
  p_storefront_font_en text DEFAULT 'Inter',
  p_storefront_radius text DEFAULT '0.5rem',
  p_template_defaults jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_mode text;
  v_show_prices boolean;
  v_modules jsonb;
  v_trust_badges jsonb;
  v_categories jsonb;
  v_cat record;
BEGIN
  IF NOT public.is_super_admin()
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_owner_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_owner_id) THEN
    RAISE EXCEPTION 'VALID_OWNER_REQUIRED' USING ERRCODE = '23502';
  END IF;

  p_slug := lower(trim(p_slug));
  p_store_vertical := lower(trim(p_store_vertical));

  -- Template defaults extraction
  v_mode := COALESCE(p_template_defaults->>'storefront_mode', 'shop');
  v_show_prices := COALESCE((p_template_defaults->>'catalog_show_prices')::boolean, true);
  v_modules := COALESCE(p_template_defaults->'store_modules', '{}'::jsonb);
  v_trust_badges := COALESCE(p_template_defaults->'trust_badges', '[]'::jsonb);
  v_categories := p_template_defaults->'categories';

  -- Create brand record
  INSERT INTO public.brands (
    slug, name_en, name_ar, primary_color, created_by, business_type, is_active
  ) VALUES (
    p_slug, p_name_en, p_name_ar, p_storefront_accent_color, p_owner_id, p_business_type, true
  ) RETURNING id INTO v_brand_id;

  -- Upsert business settings with vertical defaults and full palette
  INSERT INTO public.business_settings (
    user_id,
    brand_id,
    business_name,
    primary_color,
    storefront_accent_color,
    storefront_background_color,
    brand_palette,
    storefront_font_ar,
    storefront_font_en,
    storefront_radius,
    store_vertical,
    storefront_mode,
    catalog_show_prices,
    store_modules,
    trust_badges,
    background_color,
    text_color,
    currency,
    delivery_fee,
    cod_enabled,
    card_enabled,
    benefit_enabled,
    delivery_enabled,
    pickup_enabled,
    digital_delivery_enabled,
    vat_inclusive,
    default_tax_rate,
    invoice_inherit_brand_color,
    invoice_inherit_brand_font
  ) VALUES (
    p_owner_id,
    v_brand_id,
    p_name_en,
    p_storefront_accent_color,
    p_storefront_accent_color,
    p_storefront_background_color,
    p_brand_palette,
    p_storefront_font_ar,
    p_storefront_font_en,
    p_storefront_radius,
    p_store_vertical,
    v_mode,
    v_show_prices,
    v_modules,
    v_trust_badges,
    '#ffffff',
    '#1c1917',
    'BHD',
    1.500,
    true,
    false,
    false,
    (p_store_vertical <> 'digital'),
    true,
    (p_store_vertical = 'digital'),
    false,
    10.0,
    true,
    true
  )
  ON CONFLICT (brand_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    business_name = EXCLUDED.business_name,
    primary_color = EXCLUDED.primary_color,
    storefront_accent_color = EXCLUDED.storefront_accent_color,
    storefront_background_color = EXCLUDED.storefront_background_color,
    brand_palette = EXCLUDED.brand_palette,
    storefront_font_ar = EXCLUDED.storefront_font_ar,
    storefront_font_en = EXCLUDED.storefront_font_en,
    storefront_radius = EXCLUDED.storefront_radius,
    store_vertical = EXCLUDED.store_vertical,
    storefront_mode = EXCLUDED.storefront_mode,
    catalog_show_prices = EXCLUDED.catalog_show_prices,
    store_modules = EXCLUDED.store_modules,
    trust_badges = EXCLUDED.trust_badges,
    invoice_inherit_brand_color = EXCLUDED.invoice_inherit_brand_color,
    invoice_inherit_brand_font = EXCLUDED.invoice_inherit_brand_font,
    updated_at = now();

  -- Seed initial categories
  IF v_categories IS NOT NULL AND jsonb_array_length(v_categories) > 0 THEN
    FOR v_cat IN SELECT * FROM jsonb_to_recordset(v_categories) AS x(name_en text, name_ar text, slug text)
    LOOP
      INSERT INTO public.categories (brand_id, name_en, name_ar, slug)
      VALUES (v_brand_id, v_cat.name_en, v_cat.name_ar, v_cat.slug)
      ON CONFLICT DO NOTHING;
    END LOOP;
  ELSE
    -- Fallback category
    INSERT INTO public.categories (brand_id, name_en, name_ar, slug)
    VALUES (
      v_brand_id,
      CASE
        WHEN p_store_vertical = 'abayas' THEN 'Abayas'
        WHEN p_store_vertical IN ('coffee', 'food') THEN 'Beverages'
        WHEN p_store_vertical = 'digital' THEN 'Digital Assets'
        ELSE 'New Arrivals'
      END,
      CASE
        WHEN p_store_vertical = 'abayas' THEN 'عبايات'
        WHEN p_store_vertical IN ('coffee', 'food') THEN 'المشروبات'
        WHEN p_store_vertical = 'digital' THEN 'المنتجات الرقمية'
        ELSE 'وصلنا حديثاً'
      END,
      CASE
        WHEN p_store_vertical = 'abayas' THEN 'abayas'
        WHEN p_store_vertical IN ('coffee', 'food') THEN 'beverages'
        WHEN p_store_vertical = 'digital' THEN 'digital-assets'
        ELSE 'new-arrivals'
      END
    );
  END IF;

  RETURN v_brand_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_with_defaults_v2(text, text, text, uuid, text, text, text, text, jsonb, text, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_defaults_v2(text, text, text, uuid, text, text, text, text, jsonb, text, text, text, jsonb)
  TO authenticated, service_role;

-- 6. Recreate brand_public_settings view
DROP VIEW IF EXISTS public.brand_public_settings CASCADE;

CREATE VIEW public.brand_public_settings
WITH (security_invoker = false) AS
SELECT
  bs.brand_id,
  bs.business_name,
  bs.logo_url,
  bs.currency,
  bs.primary_color,
  bs.text_color,
  bs.background_color,
  bs.font_family,
  bs.font_url,
  bs.cod_enabled,
  bs.card_enabled,
  bs.benefit_enabled,
  bs.benefit_qr_url,
  bs.footer_note,
  bs.delivery_fee,
  bs.pickup_enabled,
  bs.delivery_enabled,
  bs.logo_size,
  bs.logo_align,
  bs.header_bg,
  bs.header_fg,
  bs.footer_bg,
  bs.footer_fg,
  bs.heading_color,
  bs.link_color,
  bs.btn_primary_bg,
  bs.btn_primary_fg,
  bs.btn_secondary_bg,
  bs.btn_secondary_fg,
  bs.btn_checkout_bg,
  bs.btn_checkout_fg,
  bs.pages,
  bs.whatsapp_enabled,
  bs.whatsapp_number,
  bs.socials,
  bs.favicon_url,
  bs.show_header_name,
  bs.show_hero_title,
  bs.show_hero_about,
  bs.show_footer_name,
  bs.storefront_font_en,
  bs.storefront_font_ar,
  bs.hero_title_size,
  bs.hero_title_color,
  bs.hero_title_align,
  bs.storefront_font_en_url,
  bs.storefront_font_ar_url,
  bs.hero_title_en,
  bs.hero_title_ar,
  bs.storefront_accent_color,
  bs.storefront_background_color,
  bs.storefront_text_color,
  bs.digital_delivery_enabled,
  bs.menu_bg,
  bs.menu_fg,
  bs.menu_title_en,
  bs.menu_title_ar,
  bs.menu_show_home,
  bs.menu_show_account,
  bs.menu_show_orders,
  bs.menu_show_pages,
  bs.home_promo_cards,
  bs.show_new_arrivals,
  bs.show_best_sellers,
  bs.new_arrivals_title_en,
  bs.new_arrivals_title_ar,
  bs.best_sellers_title_en,
  bs.best_sellers_title_ar,
  bs.announcement_enabled,
  bs.announcement_text_en,
  bs.announcement_text_ar,
  bs.announcement_bg,
  bs.announcement_fg,
  bs.announcement_bold,
  bs.announcement_italic,
  bs.announcement_dismissible,
  bs.announcement_scope,
  bs.announcement_audience,
  bs.global_sale_badges_enabled,
  bs.cart_drawer_checkout_bg,
  bs.cart_drawer_checkout_fg,
  bs.vat_inclusive,
  bs.shipping_zones,
  bs.storefront_loader_text_en,
  bs.storefront_loader_text_ar,
  bs.storefront_radius,
  bs.header_glass,
  bs.badge_accent,
  bs.secondary_banner_parallax_enabled,
  bs.secondary_banner_parallax_mobile_enabled,
  bs.secondary_banner_parallax_breakpoint,
  bs.trending_banner_background_url,
  bs.category_banner_background_url,
  bs.homepage_editorial_sections,
  bs.storefront_typography,
  bs.product_title_color,
  bs.price_color,
  bs.footer_logo_size,
  bs.trust_badges,
  bs.storefront_mode,
  bs.catalog_show_prices,
  bs.catalog_inquiry_message_en,
  bs.catalog_inquiry_message_ar,
  bs.store_vertical,
  bs.store_modules,
  bs.fit_profiles,
  bs.delivery_estimate_enabled,
  bs.delivery_estimate_ar,
  bs.delivery_estimate_en,
  bs.brand_palette,
  bs.invoice_inherit_brand_color,
  bs.invoice_inherit_brand_font
FROM public.business_settings bs
JOIN public.brands b ON b.id = bs.brand_id
WHERE b.is_active = true;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
