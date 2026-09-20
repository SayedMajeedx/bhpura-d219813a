-- Migration: 20260925100000_storefront_v2.sql
-- Storefront 2.0 Engine Upgrade: Columns, Tables, and Public View Extensions

-- 1. Extend business_settings table with Storefront 2.0 columns
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS storefront_design_version smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS trust_bar_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS trust_bar_position text NOT NULL DEFAULT 'below_hero',
  ADD COLUMN IF NOT EXISTS hero_overlay_strength smallint NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS hero_title_color_v2 text,
  ADD COLUMN IF NOT EXISTS product_card_hover_image boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS product_card_color_dots boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS product_card_quick_add boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_badge_days smallint NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS footer_layout text NOT NULL DEFAULT 'minimal',
  ADD COLUMN IF NOT EXISTS footer_show_payment_methods boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS newsletter_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS newsletter_title_ar text,
  ADD COLUMN IF NOT EXISTS newsletter_title_en text,
  ADD COLUMN IF NOT EXISTS brand_story_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS brand_story_image_url text,
  ADD COLUMN IF NOT EXISTS category_filters_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pdp_layout text NOT NULL DEFAULT 'accordion',
  ADD COLUMN IF NOT EXISTS pdp_image_zoom boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS social_proof_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recently_viewed_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS motion_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quick_view_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS back_in_stock_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fabric_care_ar text,
  ADD COLUMN IF NOT EXISTS fabric_care_en text,
  ADD COLUMN IF NOT EXISTS shipping_returns_ar text,
  ADD COLUMN IF NOT EXISTS shipping_returns_en text,
  ADD COLUMN IF NOT EXISTS business_hours_ar text,
  ADD COLUMN IF NOT EXISTS business_hours_en text,
  ADD COLUMN IF NOT EXISTS bundle_discount_percent numeric DEFAULT 0;

-- 2. Create newsletter_subscribers table
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  contact text NOT NULL,
  lang text NOT NULL DEFAULT 'ar',
  source text NOT NULL DEFAULT 'footer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, channel, contact)
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Writes come only through the server function (service role) with rate limiting;
-- the browser never inserts directly, so no anon INSERT policy is granted.

CREATE POLICY "brand staff manage newsletter subscribers"
ON public.newsletter_subscribers FOR ALL TO authenticated
USING (public.can_access_brand(brand_id))
WITH CHECK (public.can_access_brand(brand_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.newsletter_subscribers TO authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;

-- 3. Create back_in_stock_requests table
CREATE TABLE IF NOT EXISTS public.back_in_stock_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  variant_id uuid,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  contact text NOT NULL,
  lang text NOT NULL DEFAULT 'ar',
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.back_in_stock_requests ENABLE ROW LEVEL SECURITY;

-- Writes come only through the server function (service role) with rate limiting.

CREATE POLICY "brand staff manage back in stock requests"
ON public.back_in_stock_requests FOR ALL TO authenticated
USING (public.can_access_brand(brand_id))
WITH CHECK (public.can_access_brand(brand_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.back_in_stock_requests TO authenticated;
GRANT ALL ON public.back_in_stock_requests TO service_role;

-- 4. Recreate brand_public_settings view
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
  bs.invoice_inherit_brand_font,
  -- Storefront 2.0 new columns
  bs.storefront_design_version,
  bs.trust_bar_enabled,
  bs.trust_bar_position,
  bs.hero_overlay_strength,
  bs.hero_title_color_v2,
  bs.product_card_hover_image,
  bs.product_card_color_dots,
  bs.product_card_quick_add,
  bs.new_badge_days,
  bs.footer_layout,
  bs.footer_show_payment_methods,
  bs.newsletter_enabled,
  bs.newsletter_title_ar,
  bs.newsletter_title_en,
  bs.brand_story_enabled,
  bs.brand_story_image_url,
  bs.category_filters_enabled,
  bs.pdp_layout,
  bs.pdp_image_zoom,
  bs.social_proof_enabled,
  bs.recently_viewed_enabled,
  bs.motion_enabled,
  bs.quick_view_enabled,
  bs.back_in_stock_enabled,
  bs.fabric_care_ar,
  bs.fabric_care_en,
  bs.shipping_returns_ar,
  bs.shipping_returns_en,
  bs.business_hours_ar,
  bs.business_hours_en,
  bs.bundle_discount_percent
FROM public.business_settings bs
JOIN public.brands b ON b.id = bs.brand_id
WHERE b.is_active = true;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
