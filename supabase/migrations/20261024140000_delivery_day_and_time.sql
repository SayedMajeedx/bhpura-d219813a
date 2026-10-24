-- A shopper picks the day, and the time, they want their order.
--
-- A florist, a gift shop or a bakery that bakes for a set day needs to know when the customer wants
-- the order; the checkout asked nothing, so it was settled on WhatsApp after the order. A store now
-- keeps a delivery schedule (business_settings.delivery_schedule: on or off, how many hours it
-- needs, how many days ahead a shopper may pick, the weekdays it works, its time windows, its clock,
-- and whether it applies to delivery, pickup or both; read by src/lib/delivery-schedule.ts), the
-- checkout offers the days and windows it allows, and the order keeps the choice
-- (orders.requested_date, orders.requested_slot) for staff.
--
-- The database holds the rule: delivery_time_problem says whether a day and window are offered (its
-- twin deliveryTimeProblem is run against it by tests/delivery-schedule-parity.test.ts), and
-- set_order_requested_time, called by the order builder, records the choice or refuses the order
-- with DELIVERY_TIME_UNAVAILABLE, whatever the browser sends. place_storefront_order (the
-- 14-argument overload the checkout calls) is the live one, equal to migration 20261014130000's,
-- with one statement added (tests/delivery-time-builder-migration.test.ts). Every store starts with
-- the schedule off; nothing is written for the stores that exist. The public settings view gains
-- the schedule at its end, the rest as it is live.

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS delivery_schedule jsonb NOT NULL DEFAULT '{}'::jsonb
  CONSTRAINT business_settings_delivery_schedule_shape
  CHECK (jsonb_typeof(delivery_schedule) = 'object' AND pg_column_size(delivery_schedule) <= 4096);

COMMENT ON COLUMN public.business_settings.delivery_schedule IS
  'When a shopper may have an order (src/lib/delivery-schedule.ts): enabled, lead_hours, days_ahead, weekdays, slots, timezone, applies_to.';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS requested_date date,
  ADD COLUMN IF NOT EXISTS requested_slot text
  CONSTRAINT orders_requested_slot_shape
  CHECK (requested_slot IS NULL OR requested_slot ~ '^[0-2][0-9]:[0-5][0-9]-[0-2][0-9]:[0-5][0-9]$');

COMMENT ON COLUMN public.orders.requested_date IS 'The day the shopper asked to have the order (the store''s clock).';
COMMENT ON COLUMN public.orders.requested_slot IS 'The time window the shopper asked for on that day ("10:00-14:00"), when the store works in windows.';

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
    bs.advance_allow_full_payment,
    bs.default_tax_rate,
    bs.product_card_aspect_ratio,
    bs.storefront_home_layout,
    bs.delivery_schedule
   FROM business_settings bs
     JOIN brands b ON b.id = bs.brand_id
  WHERE b.is_active = true;

GRANT SELECT ON public.brand_public_settings TO anon, authenticated, service_role;

-- Why a day and window cannot be had, or NULL when they can. The schedule's fields are read as the
-- app reads them (missing or out of range: the default).
CREATE OR REPLACE FUNCTION public.delivery_time_problem(
  p_schedule jsonb, p_fulfillment text, p_date date, p_slot text, p_now timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text := COALESCE(NULLIF(p_schedule ->> 'timezone', ''), 'Asia/Bahrain');
  v_lead integer;
  v_ahead integer;
  v_earliest timestamp;
  v_today date;
  v_weekdays integer[];
  v_slots jsonb := COALESCE(p_schedule -> 'slots', '[]'::jsonb);
  v_applies jsonb := COALESCE(p_schedule -> 'applies_to', '["delivery","pickup"]'::jsonb);
  v_offered boolean;
BEGIN
  -- As readSchedule reads them: on only for a true boolean; applies_to a list, else both.
  IF jsonb_typeof(v_applies) <> 'array' THEN
    v_applies := '["delivery","pickup"]'::jsonb;
  END IF;
  IF (p_schedule -> 'enabled') IS DISTINCT FROM 'true'::jsonb OR p_date IS NULL
     OR p_fulfillment IS NULL OR p_fulfillment NOT IN ('delivery', 'pickup')
     OR NOT (v_applies ? p_fulfillment) THEN
    RETURN 'DELIVERY_TIME_UNAVAILABLE';
  END IF;
  IF v_tz NOT IN ('Asia/Bahrain', 'Asia/Riyadh', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Dubai', 'Asia/Muscat') THEN
    v_tz := 'Asia/Bahrain';
  END IF;
  v_lead := 24;
  IF p_schedule ->> 'lead_hours' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    v_lead := LEAST(720, GREATEST(0, round((p_schedule ->> 'lead_hours')::numeric)::integer));
  END IF;
  v_ahead := 7;
  IF p_schedule ->> 'days_ahead' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    v_ahead := LEAST(60, GREATEST(1, round((p_schedule ->> 'days_ahead')::numeric)::integer));
  END IF;
  v_earliest := (p_now + make_interval(hours => v_lead)) AT TIME ZONE v_tz;
  v_today := (p_now AT TIME ZONE v_tz)::date;
  IF p_date < v_earliest::date OR p_date > v_today + v_ahead THEN
    RETURN 'DELIVERY_TIME_UNAVAILABLE';
  END IF;
  IF jsonb_typeof(p_schedule -> 'weekdays') = 'array' THEN
    SELECT array_agg(value::integer) INTO v_weekdays
      FROM jsonb_array_elements_text(p_schedule -> 'weekdays')
     WHERE value ~ '^[0-6]$';
  END IF;
  IF COALESCE(cardinality(v_weekdays), 0) > 0
     AND NOT (extract(dow FROM p_date)::integer = ANY (v_weekdays)) THEN
    RETURN 'DELIVERY_TIME_UNAVAILABLE';
  END IF;
  IF jsonb_typeof(v_slots) <> 'array' THEN
    v_slots := '[]'::jsonb;
  END IF;
  -- The windows the store keeps (well formed, start before end).
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_slots) AS s
     WHERE s ->> 'from' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       AND s ->> 'to' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       AND s ->> 'from' < s ->> 'to'
  ) INTO v_offered;
  IF NOT v_offered THEN
    -- A day only: a window sent is not one the store works in.
    RETURN CASE WHEN NULLIF(btrim(COALESCE(p_slot, '')), '') IS NULL THEN NULL ELSE 'DELIVERY_TIME_UNAVAILABLE' END;
  END IF;
  -- On the earliest day, only a window that starts after the store can be ready.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_slots) AS s
     WHERE s ->> 'from' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       AND s ->> 'to' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       AND s ->> 'from' < s ->> 'to'
       AND (s ->> 'from') || '-' || (s ->> 'to') = p_slot
       AND (p_date > v_earliest::date OR s ->> 'from' >= to_char(v_earliest, 'HH24:MI'))
  ) THEN
    RETURN NULL;
  END IF;
  RETURN 'DELIVERY_TIME_UNAVAILABLE';
END;
$function$;

-- Records the day and window an order asked for, or refuses it. The order builder calls it.
CREATE OR REPLACE FUNCTION public.set_order_requested_time(p_order_id uuid, p_date text, p_slot text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_schedule jsonb;
  v_date date;
  v_slot text := NULLIF(btrim(COALESCE(p_slot, '')), '');
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_TIME_UNAVAILABLE' USING ERRCODE = 'P0002';
  END IF;
  BEGIN
    v_date := NULLIF(btrim(COALESCE(p_date, '')), '')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'DELIVERY_TIME_UNAVAILABLE' USING ERRCODE = '22023';
  END;
  SELECT delivery_schedule INTO v_schedule
    FROM public.business_settings WHERE brand_id = v_order.brand_id;
  IF public.delivery_time_problem(
       COALESCE(v_schedule, '{}'::jsonb), v_order.fulfillment_method, v_date, v_slot
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'DELIVERY_TIME_UNAVAILABLE' USING ERRCODE = '22023';
  END IF;
  UPDATE public.orders SET requested_date = v_date, requested_slot = v_slot WHERE id = p_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_order_requested_time(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_requested_time(uuid, text, text) TO service_role;

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

  -- ADDED (20261014130000): collected at a partner's shop. The order names the partner and its
  -- ready pieces come from it; refused (PICKUP_PARTNER_UNAVAILABLE) when the partner does not take
  -- pickups or does not hold every piece.
  IF p_fulfillment = 'pickup' AND NULLIF(btrim(COALESCE(p_customer ->> 'pickup_partner_id', '')), '') IS NOT NULL THEN
    PERFORM public.assign_order_pickup_partner(v_order_id, (p_customer ->> 'pickup_partner_id')::uuid);
  END IF;

  -- ADDED (20261024140000): the day, and the time window, the shopper picked for the order,
  -- checked against the store's delivery schedule; refused (DELIVERY_TIME_UNAVAILABLE) when the
  -- store does not offer it.
  IF NULLIF(btrim(COALESCE(p_customer ->> 'requested_date', '')), '') IS NOT NULL THEN
    PERFORM public.set_order_requested_time(
      v_order_id, p_customer ->> 'requested_date', p_customer ->> 'requested_slot'
    );
  END IF;

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
