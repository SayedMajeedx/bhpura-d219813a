-- Migration: 20260913100000_storefront_mode_catalog.sql
-- Description: Adds storefront_mode ('shop' | 'catalog') and catalog inquiry settings to business_settings,
-- updates brand_public_settings view, and guards place_storefront_order_internal_20260710 against catalog mode.

-- 1. Add columns to business_settings
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS storefront_mode text NOT NULL DEFAULT 'shop',
  ADD COLUMN IF NOT EXISTS catalog_show_prices boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS catalog_inquiry_message_en text,
  ADD COLUMN IF NOT EXISTS catalog_inquiry_message_ar text;

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_storefront_mode_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_storefront_mode_check
  CHECK (storefront_mode IN ('shop', 'catalog'));

-- 2. Update brand_public_settings view
CREATE OR REPLACE VIEW public.brand_public_settings AS
SELECT bs.brand_id, bs.business_name, bs.logo_url, bs.currency, bs.primary_color, bs.text_color, bs.background_color, bs.font_family, bs.font_url,
  bs.cod_enabled, bs.card_enabled, bs.benefit_enabled, bs.benefit_qr_url, bs.footer_note, bs.delivery_fee, bs.pickup_enabled, bs.delivery_enabled,
  bs.logo_size, bs.logo_align, bs.header_bg, bs.header_fg, bs.footer_bg, bs.footer_fg, bs.heading_color, bs.link_color, bs.btn_primary_bg, bs.btn_primary_fg,
  bs.btn_secondary_bg, bs.btn_secondary_fg, bs.btn_checkout_bg, bs.btn_checkout_fg, bs.pages, bs.whatsapp_enabled, bs.whatsapp_number, bs.socials, bs.favicon_url,
  bs.show_header_name, bs.show_hero_title, bs.show_hero_about, bs.show_footer_name, bs.storefront_font_en, bs.storefront_font_ar, bs.hero_title_size, bs.hero_title_color,
  bs.hero_title_align, bs.storefront_font_en_url, bs.storefront_font_ar_url, bs.hero_title_en, bs.hero_title_ar, bs.storefront_accent_color,
  bs.storefront_background_color, bs.storefront_text_color, bs.digital_delivery_enabled, bs.menu_bg, bs.menu_fg, bs.menu_title_en, bs.menu_title_ar,
  bs.menu_show_home, bs.menu_show_account, bs.menu_show_orders, bs.menu_show_pages, bs.home_promo_cards, bs.show_new_arrivals, bs.show_best_sellers,
  bs.new_arrivals_title_en, bs.new_arrivals_title_ar, bs.best_sellers_title_en, bs.best_sellers_title_ar,
  bs.announcement_enabled, bs.announcement_text_en, bs.announcement_text_ar, bs.announcement_bg, bs.announcement_fg,
  bs.announcement_bold, bs.announcement_italic, bs.announcement_dismissible, bs.announcement_scope, bs.announcement_audience,
  bs.global_sale_badges_enabled, bs.cart_drawer_checkout_bg, bs.cart_drawer_checkout_fg,
  bs.vat_inclusive, bs.shipping_zones,
  bs.storefront_loader_text_en, bs.storefront_loader_text_ar,
  bs.storefront_radius, bs.header_glass, bs.badge_accent,
  bs.secondary_banner_parallax_enabled, bs.secondary_banner_parallax_mobile_enabled, bs.secondary_banner_parallax_breakpoint,
  bs.trending_banner_background_url, bs.category_banner_background_url, bs.homepage_editorial_sections,
  bs.storefront_typography,
  bs.product_title_color,
  bs.price_color,
  bs.footer_logo_size,
  bs.trust_badges,
  bs.storefront_mode,
  bs.catalog_show_prices,
  bs.catalog_inquiry_message_en,
  bs.catalog_inquiry_message_ar
FROM public.business_settings bs
JOIN public.brands b ON b.id = bs.brand_id
WHERE b.is_active = true;

ALTER VIEW public.brand_public_settings SET (security_invoker = false);
GRANT SELECT ON public.brand_public_settings TO anon, authenticated;

-- 3. Update place_storefront_order_internal_20260710 to guard against catalog mode
CREATE OR REPLACE FUNCTION public.place_storefront_order_internal_20260710(
  p_brand_slug text,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text,
  p_notes text DEFAULT NULL::text,
  p_fulfillment text DEFAULT 'delivery'::text,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand public.brands%ROWTYPE;
  v_settings public.business_settings%ROWTYPE;
  v_owner uuid;
  v_customer_id uuid;
  v_order_id uuid;
  v_invoice int;
  v_item jsonb;
  v_variant public.product_variants%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_subtotal numeric(14,3) := 0;
  v_qty int;
  v_line_total numeric(14,3);
  v_phone text;
  v_email text;
  v_uid uuid := auth.uid();
  v_shipping numeric(14,3) := 0;
  v_address_id uuid;
  v_snapshot jsonb := '{}'::jsonb;
  v_selected_variant jsonb;
  v_custom_fields jsonb;
  v_is_tailoring boolean;
  v_from_main int;
  v_from_incubator int;
BEGIN
  SELECT * INTO v_brand FROM public.brands WHERE slug = p_brand_slug AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;

  SELECT * INTO v_settings FROM public.business_settings WHERE brand_id = v_brand.id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'SETTINGS_NOT_FOUND'; END IF;

  IF v_settings.storefront_mode = 'catalog' THEN
    RAISE EXCEPTION 'STOREFRONT_CATALOG_MODE';
  END IF;

  IF p_payment_method NOT IN ('cod','card','benefit') THEN RAISE EXCEPTION 'INVALID_PAYMENT'; END IF;
  IF (p_payment_method = 'cod' AND NOT v_settings.cod_enabled)
     OR (p_payment_method = 'card' AND NOT v_settings.card_enabled)
     OR (p_payment_method = 'benefit' AND NOT v_settings.benefit_enabled) THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_DISABLED';
  END IF;

  IF p_fulfillment NOT IN ('delivery','pickup') THEN RAISE EXCEPTION 'INVALID_FULFILLMENT'; END IF;
  IF p_fulfillment = 'delivery' AND NOT v_settings.delivery_enabled THEN RAISE EXCEPTION 'DELIVERY_DISABLED'; END IF;
  IF p_fulfillment = 'pickup'   AND NOT v_settings.pickup_enabled   THEN RAISE EXCEPTION 'PICKUP_DISABLED'; END IF;

  IF p_fulfillment = 'pickup' AND p_branch_id IS NOT NULL THEN
    PERFORM 1 FROM public.branches WHERE id = p_branch_id AND brand_id = v_brand.id AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_BRANCH'; END IF;
  END IF;

  IF p_fulfillment = 'delivery' THEN
    v_shipping := COALESCE(v_settings.delivery_fee, 0);
  END IF;

  v_owner := COALESCE(v_brand.created_by, v_settings.user_id);
  IF v_owner IS NULL THEN RAISE EXCEPTION 'NO_BRAND_OWNER'; END IF;

  v_phone := NULLIF(trim(p_customer->>'phone'), '');
  v_email := NULLIF(trim(p_customer->>'email'), '');

  IF v_uid IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM public.customers
      WHERE brand_id = v_brand.id AND auth_user_id = v_uid LIMIT 1;
  END IF;
  IF v_customer_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM public.customers
      WHERE brand_id = v_brand.id AND lower(email) = lower(v_email) LIMIT 1;
  END IF;
  IF v_customer_id IS NULL AND v_phone IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM public.customers
      WHERE brand_id = v_brand.id AND phone = v_phone LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    BEGIN
      INSERT INTO public.customers (
        user_id, brand_id, auth_user_id, name, phone, email,
        region, block, road, house, flat, city, address
      ) VALUES (
        v_owner, v_brand.id, v_uid,
        COALESCE(NULLIF(trim(p_customer->>'name'), ''), 'Guest'),
        v_phone, v_email,
        NULLIF(trim(p_customer->>'region'), ''),
        NULLIF(trim(p_customer->>'block'), ''),
        NULLIF(trim(p_customer->>'road'), ''),
        NULLIF(trim(p_customer->>'house'), ''),
        NULLIF(trim(p_customer->>'flat'), ''),
        NULLIF(trim(p_customer->>'city'), ''),
        NULLIF(trim(p_customer->>'address'), '')
      ) RETURNING id INTO v_customer_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_customer_id FROM public.customers
      WHERE brand_id = v_brand.id AND (
        (v_email IS NOT NULL AND lower(email) = lower(v_email)) OR
        (v_phone IS NOT NULL AND phone = v_phone)
      ) LIMIT 1;
    END;
  ELSE
    BEGIN
      UPDATE public.customers SET
        auth_user_id = COALESCE(auth_user_id, v_uid),
        name    = COALESCE(NULLIF(trim(p_customer->>'name'), ''), name),
        phone   = COALESCE(v_phone, phone),
        email   = COALESCE(v_email, email),
        region  = COALESCE(NULLIF(trim(p_customer->>'region'), ''), region),
        block   = COALESCE(NULLIF(trim(p_customer->>'block'), ''), block),
        road    = COALESCE(NULLIF(trim(p_customer->>'road'), ''), road),
        house   = COALESCE(NULLIF(trim(p_customer->>'house'), ''), house),
        flat    = COALESCE(NULLIF(trim(p_customer->>'flat'), ''), flat),
        city    = COALESCE(NULLIF(trim(p_customer->>'city'), ''), city),
        address = COALESCE(NULLIF(trim(p_customer->>'address'), ''), address)
      WHERE id = v_customer_id;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END IF;

  IF p_fulfillment = 'delivery'
     AND ( NULLIF(trim(p_customer->>'region'), '') IS NOT NULL
        OR NULLIF(trim(p_customer->>'road'), '')   IS NOT NULL
        OR NULLIF(trim(p_customer->>'block'), '')  IS NOT NULL
        OR NULLIF(trim(p_customer->>'house'), '')  IS NOT NULL) THEN
    INSERT INTO public.customer_addresses (
      user_id, brand_id, customer_id, label,
      region, block, road, house, flat, is_default
    ) VALUES (
      v_owner, v_brand.id, v_customer_id,
      COALESCE(NULLIF(trim(p_customer->>'label'), ''), 'Home'),
      NULLIF(trim(p_customer->>'region'), ''),
      NULLIF(trim(p_customer->>'block'), ''),
      NULLIF(trim(p_customer->>'road'), ''),
      NULLIF(trim(p_customer->>'house'), ''),
      NULLIF(trim(p_customer->>'flat'), ''),
      NOT EXISTS (SELECT 1 FROM public.customer_addresses WHERE customer_id = v_customer_id)
    ) RETURNING id INTO v_address_id;
  END IF;

  v_invoice := v_settings.next_invoice_number;
  UPDATE public.business_settings SET next_invoice_number = next_invoice_number + 1
    WHERE brand_id = v_brand.id;

  INSERT INTO public.orders (
    user_id, brand_id, customer_id, invoice_number, status,
    payment_method, payment_status, currency, notes, channel,
    fulfillment_method, shipping_address_id, shipping, branch_id
  ) VALUES (
    v_owner, v_brand.id, v_customer_id, v_invoice, 'pending',
    p_payment_method, 'unpaid', v_settings.currency, p_notes, 'storefront',
    p_fulfillment, v_address_id, v_shipping,
    CASE WHEN p_fulfillment = 'pickup' THEN p_branch_id ELSE NULL END
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));
    SELECT * INTO v_variant FROM public.product_variants WHERE id = (v_item->>'variant_id')::uuid FOR UPDATE;
    IF NOT FOUND OR v_variant.brand_id <> v_brand.id THEN RAISE EXCEPTION 'VARIANT_NOT_FOUND'; END IF;
    SELECT * INTO v_product FROM public.products WHERE id = v_variant.product_id;
    IF NOT v_product.is_active THEN RAISE EXCEPTION 'PRODUCT_INACTIVE'; END IF;

    v_custom_fields := COALESCE(v_item->'custom_fields', '[]'::jsonb);
    v_is_tailoring := (jsonb_typeof(v_custom_fields) = 'array' AND jsonb_array_length(v_custom_fields) > 0);

    v_line_total := (v_variant.selling_price * v_qty)::numeric(14,3);
    v_subtotal := v_subtotal + v_line_total;

    v_selected_variant := jsonb_build_object(
      'size', v_variant.size, 'color', v_variant.color,
      'fabric', v_variant.fabric, 'sku', v_variant.sku
    );

    IF v_is_tailoring THEN
      -- Custom tailoring is made-to-order: no ready inventory check or depletion needed
      INSERT INTO public.order_items (
        user_id, brand_id, order_id, product_id, variant_id,
        description, quantity, unit_price, line_total, location,
        selected_variant, custom_field_values
      ) VALUES (
        v_owner, v_brand.id, v_order_id, v_product.id, v_variant.id,
        COALESCE(v_product.name, 'Product'), v_qty, v_variant.selling_price,
        v_line_total, 'custom', v_selected_variant, v_custom_fields
      );
    ELSE
      -- Ready-to-wear physical stock check (sums stock_main + stock_incubator)
      IF (COALESCE(v_variant.stock_main, 0) + COALESCE(v_variant.stock_incubator, 0)) < v_qty THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_variant.id;
      END IF;

      v_from_main := LEAST(COALESCE(v_variant.stock_main, 0), v_qty);
      v_from_incubator := v_qty - v_from_main;

      IF v_from_main > 0 THEN
        UPDATE public.product_variants SET stock_main = stock_main - v_from_main WHERE id = v_variant.id;
        v_snapshot := v_snapshot || jsonb_build_object(v_variant.id::text || '|main', v_from_main);
      END IF;

      IF v_from_incubator > 0 THEN
        UPDATE public.product_variants SET stock_incubator = stock_incubator - v_from_incubator WHERE id = v_variant.id;
        v_snapshot := v_snapshot || jsonb_build_object(v_variant.id::text || '|incubator', v_from_incubator);
      END IF;

      INSERT INTO public.order_items (
        user_id, brand_id, order_id, product_id, variant_id,
        description, quantity, unit_price, line_total, location,
        selected_variant, custom_field_values
      ) VALUES (
        v_owner, v_brand.id, v_order_id, v_product.id, v_variant.id,
        COALESCE(v_product.name, 'Product'), v_qty, v_variant.selling_price,
        v_line_total, 'main', v_selected_variant, v_custom_fields
      );
    END IF;
  END LOOP;

  UPDATE public.orders SET subtotal = v_subtotal, total = v_subtotal + v_shipping,
    stock_deducted = true, stock_snapshot = v_snapshot
  WHERE id = v_order_id;

  RETURN jsonb_build_object('order_id', v_order_id, 'invoice_number', v_invoice);
END;
$function$;

NOTIFY pgrst, 'reload schema';
