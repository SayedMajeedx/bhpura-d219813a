-- A gift order, by the store's own settings (the owner's request of 2026-11-11, step one).
--
-- "Send this order as a gift" was a free tick in every store's checkout: the recipient and the
-- message were written into the order's notes as text, and nothing was the store's to decide.
-- Now a store says whether it takes gift orders, whether it offers a gift message card and at
-- what price (0 keeps it free, as before), and whether a gift order must be paid before it is
-- sent. A gift order's details are the order's own (`orders.gift`), and a priced card is a line of
-- the order under its own names with no size, like an alteration's charge, so the tax, the
-- advance, the invoice and the reports follow it. The price is the database's, from the store's
-- settings, never the browser's. A promo code and the store's offers do not reach it (the owner's
-- decision): it is added after they are worked out.
--
-- A store with no settings row behaves as before: gift orders on, a free card, any payment.

-- 1. The store's settings ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gift_order_settings (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  card_enabled boolean NOT NULL DEFAULT true,
  card_price numeric(12, 3) NOT NULL DEFAULT 0 CHECK (card_price >= 0 AND card_price <= 1000),
  -- A gift goes to someone who did not order it: the store may ask for it to be paid first.
  prepaid_only boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.gift_order_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gift_order_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gift_order_settings TO authenticated;
GRANT ALL ON TABLE public.gift_order_settings TO service_role;
DROP POLICY IF EXISTS "Staff read their store's gift order settings" ON public.gift_order_settings;
CREATE POLICY "Staff read their store's gift order settings" ON public.gift_order_settings
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

-- Staff who may change the store's settings set them.
CREATE OR REPLACE FUNCTION public.set_gift_order_settings(
  p_brand_id uuid,
  p_enabled boolean,
  p_card_enabled boolean,
  p_card_price numeric,
  p_prepaid_only boolean
)
RETURNS public.gift_order_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.gift_order_settings;
BEGIN
  IF p_brand_id IS NULL OR NOT public.can_access_brand(p_brand_id)
     OR NOT public.has_permission('manage_settings') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_card_price IS NULL OR p_card_price < 0 OR p_card_price > 1000 THEN
    RAISE EXCEPTION 'GIFT_CARD_PRICE_INVALID';
  END IF;
  INSERT INTO public.gift_order_settings AS s
    (brand_id, enabled, card_enabled, card_price, prepaid_only, updated_at, updated_by)
  VALUES (p_brand_id, COALESCE(p_enabled, true), COALESCE(p_card_enabled, true),
          round(p_card_price, 3), COALESCE(p_prepaid_only, false), now(), auth.uid())
  ON CONFLICT (brand_id) DO UPDATE
    SET enabled = EXCLUDED.enabled, card_enabled = EXCLUDED.card_enabled,
        card_price = EXCLUDED.card_price, prepaid_only = EXCLUDED.prepaid_only,
        updated_at = now(), updated_by = auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_gift_order_settings(uuid, boolean, boolean, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_gift_order_settings(uuid, boolean, boolean, numeric, boolean)
  TO authenticated, service_role;

-- What a store offers a gift order, with the defaults of a store that set nothing.
CREATE OR REPLACE FUNCTION public.gift_order_options(p_brand_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'enabled', COALESCE(s.enabled, true),
    'card', COALESCE(s.enabled, true) AND COALESCE(s.card_enabled, true),
    'card_price', COALESCE(s.card_price, 0),
    'prepaid', COALESCE(s.prepaid_only, false)
  )
  FROM (SELECT 1) one
  LEFT JOIN public.gift_order_settings s ON s.brand_id = p_brand_id;
$function$;

REVOKE ALL ON FUNCTION public.gift_order_options(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_order_options(uuid) TO service_role;

-- The same, for a visitor at the store's checkout: the store's own offer and no one's data.
CREATE OR REPLACE FUNCTION public.storefront_gift_order_options(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.gift_order_options(b.id)
    FROM public.brands b
   WHERE b.slug = p_slug AND b.is_active = true;
$function$;

REVOKE ALL ON FUNCTION public.storefront_gift_order_options(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_gift_order_options(text) TO anon, authenticated, service_role;

-- 2. A gift order's details, and its card's line -----------------------------------------------------

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gift jsonb;

-- Called by the order builder with what checkout sent (`p_customer -> 'gift'`), after the code and
-- the offers and before the tax. Writes the order's gift details, adds the card's line at the
-- store's price and its amount to the subtotal. Refuses what the store does not offer.
CREATE OR REPLACE FUNCTION public.apply_order_gift(p_order_id uuid, p_gift jsonb)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_options jsonb;
  v_card boolean;
  v_price numeric(12, 3) := 0;
  v_design text;
  v_item uuid;
BEGIN
  IF p_gift IS NULL OR jsonb_typeof(p_gift) <> 'object' THEN
    RETURN 0;
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_options := public.gift_order_options(v_order.brand_id);
  IF NOT (v_options ->> 'enabled')::boolean THEN
    RAISE EXCEPTION 'GIFT_ORDER_NOT_OFFERED';
  END IF;
  IF (v_options ->> 'prepaid')::boolean AND lower(COALESCE(v_order.payment_method, '')) = 'cod' THEN
    RAISE EXCEPTION 'GIFT_ORDER_PREPAID';
  END IF;

  v_card := lower(COALESCE(p_gift ->> 'card', '')) = 'true';
  IF v_card AND NOT (v_options ->> 'card')::boolean THEN
    RAISE EXCEPTION 'GIFT_MESSAGE_CARD_NOT_OFFERED';
  END IF;
  -- One of the card designs, or none (the store prints its own default).
  v_design := NULLIF(btrim(COALESCE(p_gift ->> 'design', '')), '');
  IF v_design IS NOT NULL
     AND v_design !~ '^(signature|type|photo|pattern|block):(brand|black|cream|white)$' THEN
    v_design := NULL;
  END IF;

  IF v_card THEN
    v_price := (v_options ->> 'card_price')::numeric;
    IF v_price > 0 THEN
      INSERT INTO public.order_items (
        order_id, brand_id, user_id, description, name_en, name_ar, quantity, unit_price,
        line_total, location
      ) VALUES (
        v_order.id, v_order.brand_id, v_order.user_id, 'Gift message card', 'Gift message card',
        'بطاقة إهداء', 1, v_price, v_price, 'main'
      )
      RETURNING id INTO v_item;
      UPDATE public.orders SET subtotal = COALESCE(subtotal, 0) + v_price WHERE id = v_order.id;
    END IF;
  END IF;

  UPDATE public.orders
     SET gift = jsonb_strip_nulls(jsonb_build_object(
           'recipient', NULLIF(left(btrim(COALESCE(p_gift ->> 'recipient', '')), 120), ''),
           'message', CASE WHEN v_card
             THEN NULLIF(left(btrim(COALESCE(p_gift ->> 'message', '')), 500), '') END,
           'from', NULLIF(left(btrim(COALESCE(p_gift ->> 'from', '')), 80), ''),
           'card', v_card,
           'card_price', v_price,
           'card_item_id', v_item,
           'design', CASE WHEN v_card THEN v_design END))
   WHERE id = v_order.id;
  RETURN v_price;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_order_gift(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_gift(uuid, jsonb) TO service_role;

-- 3. The order builder: the live one, with one statement added ----------------------------------------

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
  -- ADDED (20261027100000)
  v_offers jsonb;
  
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

  -- ADDED (20261027100000): the store's automatic offers, worked out from the order's own lines
  -- against its promo code; a free-delivery offer waives the fee. The order's discount is read
  -- again for the tax below.
  v_offers := public.apply_store_offers(
    v_order_id, p_fulfillment, NULLIF(upper(btrim(COALESCE(p_customer ->> 'country_code', ''))), '')
  );
  IF COALESCE((v_offers ->> 'free_delivery')::boolean, false) THEN
    v_shipping_fee := 0;
  END IF;
  -- ADDED (20261202100000): a gift order's details and its message card, at the store's own
  -- price, written after the code and the offers (neither reaches it) and before the tax, which
  -- the order's subtotal is read again for.
  PERFORM public.apply_order_gift(v_order_id, p_customer -> 'gift');
  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id;

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

  -- ADDED (20261109100000): the language the shopper ordered in, so the order's emails (placed,
  -- payment approved, delivered) speak it; every one went out in English.
  PERFORM public.set_order_language(v_order_id, p_customer ->> 'lang');

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
    'confirmation_email_token', v_email_token,
    -- ADDED (20261027100000)
    'discount', v_order.discount,
    'promo_code', v_order.promo_code,
    'offers', COALESCE(v_offers -> 'applied', '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;
