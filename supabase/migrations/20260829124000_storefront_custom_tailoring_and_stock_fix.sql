-- Migration: 20260829124000_storefront_custom_tailoring_and_stock_fix.sql
-- Description:
-- 1. Updates get_storefront_page_data to include custom_fields and stock_incubator.
-- 2. Updates place_storefront_order_internal_20260710 to bypass ready-made stock requirements for custom tailoring items.

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
  v_brand_id uuid;
BEGIN
  -- 1. Fetch brand
  SELECT jsonb_build_object(
    'id', b.id,
    'slug', b.slug,
    'name_en', b.name_en,
    'name_ar', b.name_ar,
    'logo_url', b.logo_url,
    'is_active', b.is_active,
    'hero_media', b.hero_media,
    'primary_color', b.primary_color,
    'about_ar', b.about_ar,
    'about_en', b.about_en,
    'meta_title', b.meta_title,
    'meta_description', b.meta_description
  ), b.id
  INTO v_brand, v_brand_id
  FROM public.brands b
  WHERE b.slug = p_brand_slug AND b.is_active = true
  LIMIT 1;

  IF v_brand IS NULL THEN
    RETURN NULL;
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

  -- 5. Fetch active products with variants (including custom_fields and stock_incubator)
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

  -- 6. Fetch active categories
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name_en', c.name_en,
      'name_ar', c.name_ar,
      'slug', c.slug,
      'image_url', c.image_url,
      'parent_id', c.parent_id,
      'sort_order', c.sort_order,
      'menu_icon_url', c.menu_icon_url
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

  RETURN jsonb_build_object(
    'brand', v_brand,
    'settings', v_settings,
    'benefitSettings', v_benefit,
    'trackingSettings', v_tracking,
    'products', v_products,
    'categories', v_categories,
    'bestSellerRows', v_bestsellers,
    'trendingRows', v_trending
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_storefront_page_data(text) TO anon, authenticated, service_role;

-- Update internal order placement function to support custom tailoring without stock constraints
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
