-- Order emails in the shopper's language.
--
-- The order email queue (order_email_events) has a language column that nothing ever filled: it
-- took its default, English, so every order email (placed, payment approved, delivered) reached
-- an Arabic shopper in English. The email function already writes Arabic or English by that
-- column, so filling it is the whole fix; no edge function changes.
--
-- 1. orders.language: the language the shopper ordered in ('ar' or 'en'), null when unknown
--    (orders staff type in, orders placed before this).
-- 2. order_email_language(order): the order's language, else the language of that customer's
--    latest order that has one, else English as before.
-- 3. enqueue_order_email_event: the definition of 20260724220000 with the language read from 2.
-- 4. set_order_language(order, lang): records the language on the order and on its emails still
--    waiting to go (the "order placed" email is queued while the order is written, before it).
-- 5. place_storefront_order: the live one (equal to 20261027100000's) with one statement added,
--    calling 4 with the language checkout sends in p_customer ('lang').
--
-- Tested in a real Postgres by tests/order-email-language-migration.test.ts.

-- 1 ───────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS language text
  CHECK (language IS NULL OR language IN ('ar', 'en'));

COMMENT ON COLUMN public.orders.language IS
  'The language the shopper ordered in (ar or en), null when unknown. The order''s emails speak it.';

-- 2 ───────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.order_email_language(p_order_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    o.language,
    (
      SELECT earlier.language
      FROM public.orders earlier
      WHERE o.customer_id IS NOT NULL
        AND earlier.customer_id = o.customer_id
        AND earlier.brand_id = o.brand_id
        AND earlier.language IS NOT NULL
      ORDER BY earlier.created_at DESC
      LIMIT 1
    ),
    'en'
  )
  FROM public.orders o
  WHERE o.id = p_order_id;
$$;

REVOKE ALL ON FUNCTION public.order_email_language(uuid) FROM PUBLIC, anon, authenticated;

-- 3 ───────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_order_email_event(
  p_order_id uuid,
  p_brand_id uuid,
  p_event_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_email_events (order_id, brand_id, event_type, language)
  VALUES (
    p_order_id,
    p_brand_id,
    p_event_type,
    COALESCE(public.order_email_language(p_order_id), 'en')
  )
  ON CONFLICT (order_id, event_type) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_order_email_event(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- 4 ───────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_order_language(p_order_id uuid, p_lang text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lang text := lower(btrim(COALESCE(p_lang, '')));
BEGIN
  -- Anything else (nothing sent, an older checkout) leaves the order as it is.
  IF v_lang NOT IN ('ar', 'en') THEN
    RETURN;
  END IF;

  UPDATE public.orders
  SET language = v_lang
  WHERE id = p_order_id AND language IS DISTINCT FROM v_lang;

  UPDATE public.order_email_events
  SET language = v_lang
  WHERE order_id = p_order_id
    AND status IN ('pending', 'failed')
    AND language IS DISTINCT FROM v_lang;
END;
$$;

REVOKE ALL ON FUNCTION public.set_order_language(uuid, text) FROM PUBLIC, anon, authenticated;

-- 5 ───────────────────────────────────────────────────────────────────────────────────────────
-- The live place_storefront_order (equal to 20261027100000's) with one statement added, after the
-- requested day and time: set_order_language with the shopper's language.
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
