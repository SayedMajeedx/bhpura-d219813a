-- Migration: 20261014130000_partner_pickup_points.sql
--
-- A shopper can collect an order at a partner's shop (an incubator) that holds its pieces.
--
-- Pieces a store places with a partner are sold on its storefront, and when the store's own stock
-- runs out an order takes them from the partner (order_incubator_sync, migration 20261012160000).
-- The checkout only offered the store's own branches for pickup, so a shopper chose the store's
-- branch for a piece that was at the partner's shop (Pura, 2026-10-14: all 15 pieces at its
-- partner, none at the store). Partners do not use the system: the store arranges a pickup with
-- them by hand.
--
-- 1. A partner can take pickups: incubators.pickup_enabled (the store's choice, off by default),
--    with the address, a map link and notes a shopper reads, and transfer_days: how long it takes
--    to bring a piece from that partner to the store's branch.
-- 2. storefront_pickup_partners(brand, items): what a checkout can offer, without telling a visitor
--    any quantity: the partners that take pickups and hold every ready piece of the cart (none when
--    the cart has a piece made to order), and whether a pickup at the store's branch needs pieces
--    brought from a partner first (with the longest transfer time of those partners).
-- 3. orders.pickup_incubator_id: the partner a shopper collects from. place_storefront_order
--    passes `pickup_partner_id` (in p_customer) to assign_order_pickup_partner, which checks the
--    partner still takes pickups and holds every piece, names it on the order, and takes the
--    order's ready pieces from that partner (lines to 'incubator'; a piece already held at another
--    partner is moved to this one). Refused with PICKUP_PARTNER_UNAVAILABLE otherwise, so the
--    order is not placed.
-- 4. order_incubator_sync prefers the order's pickup partner, then the partner holding most.
--
-- place_storefront_order is the live one (read from production on 2026-10-14, equal to
-- 20261009140000_advance_pay_in_full.sql) with one statement added after the order's totals.
-- Tested in a real Postgres by tests/partner-pickup-migration.test.ts; the builder's one added
-- statement by tests/partner-pickup-builder-migration.test.ts.

-- ---------------------------------------------------------------------------------------------
-- 1. A partner that takes pickups, and an order collected there.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE public.incubators
  ADD COLUMN IF NOT EXISTS pickup_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pickup_address_ar text,
  ADD COLUMN IF NOT EXISTS pickup_address_en text,
  ADD COLUMN IF NOT EXISTS pickup_location_url text,
  ADD COLUMN IF NOT EXISTS pickup_notes_ar text,
  ADD COLUMN IF NOT EXISTS pickup_notes_en text,
  ADD COLUMN IF NOT EXISTS transfer_days integer CHECK (transfer_days IS NULL OR transfer_days BETWEEN 0 AND 60);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_incubator_id uuid REFERENCES public.incubators(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pickup_incubator
  ON public.orders (pickup_incubator_id) WHERE pickup_incubator_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- 2. What a checkout can offer for a cart.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.storefront_pickup_partners(p_brand_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cart jsonb;
  v_partners jsonb;
  v_from_partner boolean;
  v_transfer_days integer;
  v_made_to_order boolean;
  v_none constant jsonb := jsonb_build_object('partners', '[]'::jsonb, 'from_partner', false, 'transfer_days', NULL);
BEGIN
  IF p_brand_id IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 100
     OR NOT EXISTS (SELECT 1 FROM public.brands b WHERE b.id = p_brand_id AND b.is_active) THEN
    RETURN v_none;
  END IF;

  -- A made-to-order piece is made at the store: a cart with one is never collected at a partner.
  SELECT COALESCE(bool_or(lower(COALESCE(i ->> 'made_to_order', '')) = 'true'), false)
    INTO v_made_to_order
    FROM jsonb_array_elements(p_items) i;

  -- The cart's ready pieces, by variant of this store.
  SELECT jsonb_agg(jsonb_build_object('variant_id', variant_id, 'quantity', quantity))
    INTO v_cart
    FROM (
      SELECT v.id AS variant_id,
             SUM(GREATEST(1, COALESCE(NULLIF(i ->> 'quantity', '')::integer, 1)))::integer AS quantity
      FROM jsonb_array_elements(p_items) i
      JOIN public.product_variants v ON v.id = NULLIF(i ->> 'variant_id', '')::uuid
      JOIN public.products p ON p.id = v.product_id AND p.brand_id = p_brand_id
      WHERE lower(COALESCE(i ->> 'made_to_order', '')) <> 'true'
      GROUP BY v.id
    ) ready;

  IF v_cart IS NULL THEN
    RETURN v_none;
  END IF;

  -- Partners that take pickups and hold every ready piece.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', inc.id,
           'name', inc.name,
           'address_ar', inc.pickup_address_ar,
           'address_en', inc.pickup_address_en,
           'location_url', inc.pickup_location_url,
           'notes_ar', inc.pickup_notes_ar,
           'notes_en', inc.pickup_notes_en
         ) ORDER BY inc.name), '[]'::jsonb)
    INTO v_partners
    FROM public.incubators inc
   WHERE NOT v_made_to_order
     AND inc.brand_id = p_brand_id AND inc.is_active AND inc.pickup_enabled
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_to_recordset(v_cart) AS c(variant_id uuid, quantity integer)
       WHERE COALESCE((SELECT ii.quantity FROM public.incubator_inventory ii
                       WHERE ii.incubator_id = inc.id AND ii.variant_id = c.variant_id), 0) < c.quantity
     );

  -- Whether the store's own stock covers the cart; if not, a pickup at its branch waits for the
  -- pieces to be brought from a partner (the longest of those partners' transfer times).
  SELECT EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_cart) AS c(variant_id uuid, quantity integer)
    JOIN public.product_variants v ON v.id = c.variant_id
    WHERE COALESCE(v.stock_main, 0) < c.quantity
  ) INTO v_from_partner;

  IF v_from_partner THEN
    SELECT MAX(inc.transfer_days) INTO v_transfer_days
    FROM jsonb_to_recordset(v_cart) AS c(variant_id uuid, quantity integer)
    JOIN public.product_variants v ON v.id = c.variant_id AND COALESCE(v.stock_main, 0) < c.quantity
    JOIN public.incubator_inventory ii ON ii.variant_id = c.variant_id AND ii.quantity > 0
    JOIN public.incubators inc ON inc.id = ii.incubator_id AND inc.brand_id = p_brand_id AND inc.is_active;
  END IF;

  RETURN jsonb_build_object(
    'partners', v_partners,
    'from_partner', v_from_partner,
    'transfer_days', v_transfer_days
  );
END;
$$;

-- A visitor's checkout asks it; it returns no quantity, no cost and no partner contact.
REVOKE ALL ON FUNCTION public.storefront_pickup_partners(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_pickup_partners(uuid, jsonb) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. An order collected at a partner takes its pieces from that partner.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_order_pickup_partner(p_order_id uuid, p_partner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_alloc record;
  v_take integer;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PICKUP_PARTNER_UNAVAILABLE';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM public.incubators inc
       WHERE inc.id = p_partner_id AND inc.brand_id = v_order.brand_id
         AND inc.is_active AND inc.pickup_enabled
     )
     -- A piece made to order is made at the store, never collected at a partner.
     OR EXISTS (
       SELECT 1 FROM public.order_items oi
       WHERE oi.order_id = p_order_id AND oi.location = 'custom'
     )
     -- Every ready piece must be at this partner (counting what it already holds for the order).
     OR EXISTS (
       SELECT 1
       FROM (
         SELECT oi.variant_id, SUM(oi.quantity)::integer AS quantity
         FROM public.order_items oi
         WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL
         GROUP BY oi.variant_id
       ) need
       WHERE COALESCE((SELECT ii.quantity FROM public.incubator_inventory ii
                       WHERE ii.incubator_id = p_partner_id AND ii.variant_id = need.variant_id), 0)
             + COALESCE((SELECT a.quantity FROM public.order_incubator_allocations a
                         WHERE a.order_id = p_order_id AND a.variant_id = need.variant_id
                           AND a.incubator_id = p_partner_id), 0)
             < need.quantity
     ) THEN
    RAISE EXCEPTION 'PICKUP_PARTNER_UNAVAILABLE';
  END IF;

  UPDATE public.orders
  SET pickup_incubator_id = p_partner_id, branch_id = NULL
  WHERE id = p_order_id;

  -- The ready pieces come from the partners' stock (the order engine reallocates on this update,
  -- and order_incubator_sync takes them from the pickup partner first).
  UPDATE public.order_items
  SET location = 'incubator'
  WHERE order_id = p_order_id AND variant_id IS NOT NULL AND COALESCE(location, 'main') = 'main';

  -- A piece the engine had already taken from another partner moves to this one: the partners'
  -- total does not change, only which shop holds the piece for the order.
  FOR v_alloc IN
    SELECT a.variant_id, a.incubator_id, a.quantity
    FROM public.order_incubator_allocations a
    WHERE a.order_id = p_order_id AND a.incubator_id <> p_partner_id
    FOR UPDATE
  LOOP
    v_take := v_alloc.quantity;

    UPDATE public.incubator_inventory SET quantity = quantity + v_take
    WHERE incubator_id = v_alloc.incubator_id AND variant_id = v_alloc.variant_id;
    UPDATE public.incubator_inventory SET quantity = quantity - v_take
    WHERE incubator_id = p_partner_id AND variant_id = v_alloc.variant_id;

    DELETE FROM public.order_incubator_allocations
    WHERE order_id = p_order_id AND variant_id = v_alloc.variant_id AND incubator_id = v_alloc.incubator_id;
    INSERT INTO public.order_incubator_allocations (order_id, variant_id, incubator_id, quantity, brand_id)
    VALUES (p_order_id, v_alloc.variant_id, p_partner_id, v_take, v_order.brand_id)
    ON CONFLICT (order_id, variant_id, incubator_id) DO UPDATE
      SET quantity = order_incubator_allocations.quantity + EXCLUDED.quantity, updated_at = now();

    INSERT INTO public.incubator_movements (
      brand_id, incubator_id, variant_id, movement_type, quantity_delta, reference_type, reference_id, notes
    ) VALUES
      (v_order.brand_id, v_alloc.incubator_id, v_alloc.variant_id, 'order_release', v_take,
       'order', p_order_id, 'Released: collected at another partner'),
      (v_order.brand_id, p_partner_id, v_alloc.variant_id, 'order_reserve', -v_take,
       'order', p_order_id, 'Reserved: collected here');
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_order_pickup_partner(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_order_pickup_partner(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. The order's pickup partner gives its pieces first.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.order_incubator_sync(p_order_id uuid, p_variant_id uuid, p_brand_id uuid, p_delta integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_left integer;
  v_take integer;
  v_pickup uuid;
  r record;
BEGIN
  SELECT pickup_incubator_id INTO v_pickup FROM public.orders WHERE id = p_order_id;

  IF p_delta < 0 THEN
    v_left := -p_delta;
    FOR r IN
      SELECT id, incubator_id, quantity
      FROM public.incubator_inventory
      WHERE variant_id = p_variant_id AND brand_id = p_brand_id AND quantity > 0
      ORDER BY (incubator_id IS NOT DISTINCT FROM v_pickup) DESC, quantity DESC, created_at, id
      FOR UPDATE
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := LEAST(v_left, r.quantity);

      UPDATE public.incubator_inventory SET quantity = quantity - v_take WHERE id = r.id;

      INSERT INTO public.order_incubator_allocations (
        order_id, variant_id, incubator_id, quantity, brand_id
      )
      VALUES (p_order_id, p_variant_id, r.incubator_id, v_take, p_brand_id)
      ON CONFLICT (order_id, variant_id, incubator_id) DO UPDATE
        SET quantity = order_incubator_allocations.quantity + EXCLUDED.quantity,
            updated_at = now();

      INSERT INTO public.incubator_movements (
        brand_id, incubator_id, variant_id, movement_type, quantity_delta,
        reference_type, reference_id, notes
      )
      VALUES (
        p_brand_id, r.incubator_id, p_variant_id, 'order_reserve', -v_take,
        'order', p_order_id, 'Reserved by an order'
      );

      v_left := v_left - v_take;
    END LOOP;
  ELSIF p_delta > 0 THEN
    v_left := p_delta;
    FOR r IN
      SELECT incubator_id, quantity
      FROM public.order_incubator_allocations
      WHERE order_id = p_order_id AND variant_id = p_variant_id
      ORDER BY quantity DESC, incubator_id
      FOR UPDATE
    LOOP
      EXIT WHEN v_left <= 0;
      v_take := LEAST(v_left, r.quantity);

      UPDATE public.incubator_inventory
      SET quantity = quantity + v_take
      WHERE incubator_id = r.incubator_id AND variant_id = p_variant_id;

      IF r.quantity = v_take THEN
        DELETE FROM public.order_incubator_allocations
        WHERE order_id = p_order_id AND variant_id = p_variant_id
          AND incubator_id = r.incubator_id;
      ELSE
        UPDATE public.order_incubator_allocations
        SET quantity = quantity - v_take, updated_at = now()
        WHERE order_id = p_order_id AND variant_id = p_variant_id
          AND incubator_id = r.incubator_id;
      END IF;

      INSERT INTO public.incubator_movements (
        brand_id, incubator_id, variant_id, movement_type, quantity_delta,
        reference_type, reference_id, notes
      )
      VALUES (
        p_brand_id, r.incubator_id, p_variant_id, 'order_release', v_take,
        'order', p_order_id, 'Released by an order'
      );

      v_left := v_left - v_take;
    END LOOP;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.order_incubator_sync(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_incubator_sync(uuid, uuid, uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- 5. place_storefront_order: the live function with one statement added (marked below).
-- ---------------------------------------------------------------------------------------------

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
