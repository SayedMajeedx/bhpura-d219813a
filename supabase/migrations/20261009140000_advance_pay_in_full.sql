-- Advance payment: the customer may pay the whole amount now.
--
-- A store that asks an advance lets a customer pay the full total online instead, in one
-- go (no balance to collect later). The choice is the customer's, made at checkout and sent
-- as `pay_in_full` in the customer object of place_storefront_order; the store can turn the
-- option off (business_settings.advance_allow_full_payment, on by default).
--
-- When it is chosen (and the store allows it) the order's snapshot of rules is replaced by one
-- rule that asks the whole order, delivery fee included. Everything that reads the snapshot
-- then agrees: the card charge asks the total, approve_benefit_payment records the order paid
-- in full (advance equal to the total is not "partially paid"), and cash on delivery stays
-- refused. An order that has no advance (no snapshot) is never touched.
--
-- Additive: one column, one small function, the public settings view gains the column at its end
-- (the rest is the live definition unchanged), and place_storefront_order is the live
-- definition with one assignment added (tests/advance-pay-in-full-migration.test.ts).

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS advance_allow_full_payment boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.advance_full_payment_rules()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT jsonb_build_array(
    jsonb_build_object('kind', 'percent', 'value', 100, 'include_fee', true))
$function$;

CREATE OR REPLACE VIEW public.brand_public_settings AS
 SELECT bs.brand_id,
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
    bs.bundle_discount_percent,
    bs.hero_layout,
    bs.hero_height_desktop,
    bs.hero_aspect_mobile,
    bs.hero_show_arrows,
    bs.pdp_gallery_aspect_ratio,
    bs.hero_video_fit,
    bs.advance_payment_enabled,
    bs.advance_payment_percent,
    bs.advance_payment_scope,
    bs.storefront_banner_size,
    bs.delivery_estimate_tailored_ar,
    bs.delivery_estimate_tailored_en,
    bs.advance_allow_full_payment
   FROM business_settings bs
     JOIN brands b ON b.id = bs.brand_id
  WHERE b.is_active = true;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.place_storefront_order(p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text, p_notes text DEFAULT NULL::text, p_fulfillment text DEFAULT 'delivery'::text, p_branch_id uuid DEFAULT NULL::uuid, p_digital_channel text DEFAULT NULL::text, p_digital_contact text DEFAULT NULL::text, p_promo_code text DEFAULT NULL::text, p_benefit_receipt_id uuid DEFAULT NULL::uuid, p_shipping_fee numeric DEFAULT NULL::numeric, p_shipping_zone text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_id uuid;
  v_receipt public.pending_benefit_receipts%ROWTYPE;
  v_result jsonb;
  v_order_id uuid;
  v_order public.orders%ROWTYPE;
  v_tax_rate numeric;
  v_vat_inclusive boolean;
  v_shipping_fee numeric;
  v_tax_amount numeric;
  v_taxable numeric;
  v_total numeric;
  v_invoice_number integer;
  v_email_token uuid;
  v_quantity integer;
  v_computed_fee numeric;
  
  -- Payload Fingerprint Variables
  v_current_hash text;
  v_claim public.idempotency_claims%ROWTYPE;
BEGIN
  -- Strict validation of client-supplied shipping fee
  IF p_shipping_fee IS NOT NULL AND p_shipping_fee < 0 THEN
    RAISE EXCEPTION 'INVALID_SHIPPING_FEE';
  END IF;

  SELECT id INTO v_brand_id
  FROM public.brands
  WHERE slug = p_brand_slug AND is_active = true;
  IF v_brand_id IS NULL THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;

  -- Compute fingerprint of incoming parameters to lock payload integrity
  v_current_hash := md5(
    COALESCE(p_customer::text, '') || 
    COALESCE(p_items::text, '') || 
    COALESCE(p_payment_method, '') || 
    COALESCE(p_notes, '') || 
    COALESCE(p_fulfillment, '')
  );

  -- 1. Claims Serialization Guard: Grab the lock before doing ANY side-effects
  IF p_idempotency_key IS NOT NULL THEN
    BEGIN
      -- Attempt to claim this key instantly
      INSERT INTO public.idempotency_claims (brand_id, idempotency_key, request_hash)
      VALUES (v_brand_id, p_idempotency_key, v_current_hash);
      
    EXCEPTION WHEN unique_violation THEN
      -- Key is already locked or completed! Re-query the row and obtain a FOR UPDATE lock.
      SELECT * INTO v_claim
      FROM public.idempotency_claims
      WHERE brand_id = v_brand_id AND idempotency_key = p_idempotency_key
      FOR UPDATE;
      
      -- Verify Request Integrity: Block hijacking / different cart payload reuse
      IF v_claim.request_hash IS DISTINCT FROM v_current_hash THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD';
      END IF;
      
      -- If the winner transaction committed successfully, cleanly return their completed receipt data
      IF v_claim.order_id IS NOT NULL THEN
        SELECT id, invoice_number, total, shipping, tax_amount, confirmation_email_token
        INTO v_order_id, v_invoice_number, v_total, v_shipping_fee, v_tax_amount, v_email_token
        FROM public.orders
        WHERE id = v_claim.order_id;
        
        RETURN jsonb_build_object(
          'success', true,
          'order_id', v_order_id,
          'invoice_number', v_invoice_number,
          'total', v_total,
          'shipping', v_shipping_fee,
          'tax_amount', v_tax_amount,
          'confirmation_email_token', v_email_token
        );
      ELSE
        -- The winning transaction rolled back. We now own the active claim lock and can proceed to place the order ourselves!
        UPDATE public.idempotency_claims
        SET request_hash = v_current_hash
        WHERE brand_id = v_brand_id AND idempotency_key = p_idempotency_key;
      END IF;
    END;
  END IF;

  -- 2. From here on, execution is completely serialized and locked
  IF p_payment_method = 'benefit' THEN
    IF p_benefit_receipt_id IS NULL THEN RAISE EXCEPTION 'BENEFIT_RECEIPT_REQUIRED'; END IF;
    SELECT * INTO v_receipt
    FROM public.pending_benefit_receipts
    WHERE id = p_benefit_receipt_id
      AND brand_id = v_brand_id
      AND uploaded_at IS NOT NULL
      AND consumed_at IS NULL
      AND expires_at > now()
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BENEFIT_RECEIPT_INVALID'; END IF;
  ELSIF p_benefit_receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'UNEXPECTED_BENEFIT_RECEIPT';
  END IF;

  v_result := public.place_storefront_order_core(
    p_brand_slug, p_customer, p_items, p_payment_method, p_notes,
    p_fulfillment, p_branch_id, p_digital_channel, p_digital_contact, p_promo_code
  );
  v_order_id := (v_result->>'order_id')::uuid;

  IF p_payment_method = 'benefit' THEN
    UPDATE public.orders
    SET status = 'pending_verification',
        payment_status = 'unpaid',
        benefit_receipt_url = v_receipt.public_url,
        benefit_receipt_key = v_receipt.object_key
    WHERE id = v_order_id AND brand_id = v_brand_id;

    UPDATE public.pending_benefit_receipts
    SET consumed_at = now()
    WHERE id = v_receipt.id;
  END IF;

  -- Authoritatively apply VAT inclusive/exclusive configurations and custom shipping zone fees
  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id FOR UPDATE;
  
  SELECT COALESCE(default_tax_rate, 10.0), COALESCE(vat_inclusive, false) INTO v_tax_rate, v_vat_inclusive
  FROM public.business_settings WHERE brand_id = v_brand_id;

  -- The delivery fee is the store's (bug #36): worked out here from its
  -- delivery settings, the destination the shopper chose (a shipping zone id
  -- and country in p_customer) and the order's quantity. A browser's fee is
  -- kept only when it is higher (an older checkout that sends no zone yet).
  IF p_fulfillment = 'delivery' THEN
    SELECT COALESCE(sum(quantity), 0)::integer INTO v_quantity
      FROM public.order_items WHERE order_id = v_order_id;
    v_computed_fee := public.storefront_delivery_fee(
      v_brand_id,
      NULLIF(btrim(p_customer ->> 'shipping_zone_id'), ''),
      NULLIF(upper(btrim(p_customer ->> 'country_code')), ''),
      v_quantity
    );
    v_shipping_fee := GREATEST(v_computed_fee, COALESCE(p_shipping_fee, 0));

    -- A signed-in member whose loyalty tier has free shipping pays none
    -- (bug #37). Only the member's own account counts: a guest who types a
    -- member's phone or email does not get it.
    IF auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1
        FROM public.orders o
        JOIN public.customers c
          ON c.id = o.customer_id AND c.auth_user_id = auth.uid()
        JOIN public.loyalty_accounts la
          ON la.brand_id = v_brand_id AND la.customer_id = c.id
        JOIN public.brand_loyalty_tiers t
          ON t.brand_id = v_brand_id AND t.tier_key = la.current_tier_key AND t.free_shipping
        JOIN public.brand_loyalty_programs lp
          ON lp.brand_id = v_brand_id AND lp.is_enabled
       WHERE o.id = v_order_id
    ) THEN
      v_shipping_fee := 0;
    END IF;
  ELSE
    v_shipping_fee := 0;
  END IF;
  v_taxable := greatest(0, v_order.subtotal - v_order.discount);
  
  IF v_vat_inclusive THEN
    v_tax_amount := v_taxable - (v_taxable / (1 + (v_tax_rate / 100)));
    v_total := v_taxable + v_shipping_fee;
  ELSE
    v_tax_amount := (v_taxable * v_tax_rate) / 100;
    v_total := v_taxable + v_tax_amount + v_shipping_fee;
  END IF;

  -- Apply final calculations
  UPDATE public.orders
  SET shipping = v_shipping_fee,
      tax_rate = v_tax_rate,
      tax_amount = v_tax_amount,
      total = v_total,
      idempotency_key = p_idempotency_key, 
      request_hash = v_current_hash,       
      advance_rules = CASE
        WHEN advance_rules IS NOT NULL
          AND lower(COALESCE(p_customer ->> 'pay_in_full', '')) = 'true'
          AND COALESCE(
            (SELECT s.advance_allow_full_payment FROM public.business_settings s WHERE s.brand_id = v_brand_id),
            true)
        THEN public.advance_full_payment_rules()
        ELSE advance_rules
      END,
      destination_country = CASE
        WHEN p_fulfillment = 'delivery' THEN NULLIF(upper(btrim(p_customer ->> 'country_code')), '')
        ELSE NULL
      END,
      delivery_address_snapshot = CASE 
        WHEN p_shipping_zone IS NOT NULL THEN COALESCE(delivery_address_snapshot, '{}'::jsonb) || jsonb_build_object('shipping_zone', p_shipping_zone)
        ELSE delivery_address_snapshot
      END
  WHERE id = v_order_id;

  -- 3. Link the successfully completed order to our claim record to unblock any waiting parallel queries
  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.idempotency_claims
    SET order_id = v_order_id
    WHERE brand_id = v_brand_id AND idempotency_key = p_idempotency_key;
  END IF;

  -- Reload the capability from the authoritative order row.
  SELECT confirmation_email_token
  INTO v_email_token
  FROM public.orders
  WHERE id = v_order_id AND brand_id = v_brand_id;

  v_result := v_result || jsonb_build_object(
    'total', v_total,
    'shipping', v_shipping_fee,
    'tax_amount', v_tax_amount,
    'confirmation_email_token', v_email_token
  );

  RETURN v_result;
END;
$function$;
