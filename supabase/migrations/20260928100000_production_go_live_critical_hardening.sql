-- Migration: 20260928100000_production_go_live_critical_hardening.sql
-- Description: Remediate 7 critical go-live blockers and data integrity vulnerabilities:
-- 1. Prevent accidental user deletion from destroying historical orders/items/expenses (FK ON DELETE CASCADE -> SET NULL / RESTRICT)
-- 2. Add non-negative monetary CHECK constraints on orders and store_credits
-- 3. Require authentication and view_financials permission for reporting_brand_id(text) and revoke PUBLIC execution on all rpc_reporting_*
-- 4. Reject negative shipping fee injection in place_storefront_order
-- 5. Raise storefront rate limiter ceiling from 50 to 500 per 10m to prevent flash sale DoS and throttle guest orders by phone
-- 6. Enforce positive refund amounts in rpc_process_return_refund
-- 7. Add amount and currency verification to reconcile_verified_tap_order

-- ============================================================================
-- 1. FOREIGN KEY INTEGRITY: PREVENT WIPEOUT OF ORDERS, ORDER_ITEMS, EXPENSES
-- ============================================================================

-- Ensure user_id can be set to NULL when an auth user is removed
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.order_items ALTER COLUMN user_id DROP NOT NULL;

-- Drop and recreate orders_user_id_fkey with ON DELETE SET NULL
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Drop and recreate order_items_user_id_fkey with ON DELETE SET NULL
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_user_id_fkey;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Drop and recreate activity_logs_user_id_fkey with ON DELETE SET NULL
ALTER TABLE public.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_user_id_fkey;
ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Drop and recreate expenses_user_id_fkey with ON DELETE RESTRICT (financial audit trail cannot be orphaned/wiped)
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_user_id_fkey;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- ============================================================================
-- 2. MONETARY NON-NEGATIVE CHECK CONSTRAINTS
-- ============================================================================

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_monetary_positive;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_monetary_positive
  CHECK (
    total >= 0 AND
    subtotal >= 0 AND
    shipping >= 0 AND
    discount >= 0 AND
    tax_amount >= 0
  );

ALTER TABLE public.store_credits
  DROP CONSTRAINT IF EXISTS store_credits_amount_positive;
ALTER TABLE public.store_credits
  ADD CONSTRAINT store_credits_amount_positive
  CHECK (amount > 0);

-- ============================================================================
-- 3. REPORTING BRAND ACCESS & RPC PRIVILEGES (ANONYMOUS PII/FINANCIAL LEAK)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reporting_brand_id(p_brand_slug text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_brand_id uuid;
BEGIN
  -- Strict authentication guard: Anonymous calls are strictly forbidden
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  
  IF v_profile.id IS NULL OR lower(COALESCE(v_profile.status, 'active')) NOT IN ('active', 'approved') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF NOT public.has_permission('view_financials') THEN
    RAISE EXCEPTION 'Denied: view_financials permission required';
  END IF;

  -- 1. If p_brand_slug is provided, look up brand by slug
  IF NULLIF(btrim(p_brand_slug), '') IS NOT NULL THEN
    SELECT id INTO v_brand_id
    FROM public.brands
    WHERE lower(slug) = lower(btrim(p_brand_slug))
      AND is_active = true
    LIMIT 1;
  END IF;

  -- 2. If no brand slug provided or not found by slug, fallback to user's assigned brand_id
  IF v_brand_id IS NULL AND v_profile.brand_id IS NOT NULL THEN
    v_brand_id := v_profile.brand_id;
  END IF;

  -- Verify brand access permission for tenant user
  IF v_brand_id IS NOT NULL THEN
    IF v_profile.role <> 'super_admin' AND NOT public.can_access_brand(v_brand_id) THEN
      RAISE EXCEPTION 'BRAND_NOT_FOUND_OR_FORBIDDEN';
    END IF;
  END IF;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'BRAND_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  RETURN v_brand_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reporting_brand_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reporting_brand_id(text) TO authenticated, service_role;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT oid::regprocedure AS func_signature
    FROM pg_proc
    WHERE proname LIKE 'rpc_reporting_%'
      AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.func_signature || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.func_signature || ' TO authenticated, service_role';
  END LOOP;
END $$;

-- ============================================================================
-- 4. REJECT NEGATIVE SHIPPING FEE INJECTION IN PLACE_STOREFRONT_ORDER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.place_storefront_order(
  p_brand_slug text,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text,
  p_notes text DEFAULT NULL::text,
  p_fulfillment text DEFAULT 'delivery'::text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_digital_channel text DEFAULT NULL::text,
  p_digital_contact text DEFAULT NULL::text,
  p_promo_code text DEFAULT NULL::text,
  p_benefit_receipt_id uuid DEFAULT NULL::uuid,
  p_shipping_fee numeric DEFAULT NULL::numeric,
  p_shipping_zone text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text
)
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

  v_shipping_fee := COALESCE(p_shipping_fee, v_order.shipping);
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

-- ============================================================================
-- 5. STOREFRONT ORDER PLACEMENT RATE LIMITER: PREVENT DOS OF LEGITIMATE SALES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_storefront_order_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_count integer;
  v_customer_count integer;
BEGIN
  IF NEW.channel IS DISTINCT FROM 'storefront' THEN RETURN NEW; END IF;

  -- Brand-level flood guard: 500 orders per 10 minutes (sufficient headroom for peak merchant campaigns)
  SELECT count(*) INTO v_brand_count FROM public.orders
    WHERE brand_id = NEW.brand_id AND channel = 'storefront'
      AND created_at >= now() - interval '10 minutes';
  IF v_brand_count >= 500 THEN RAISE EXCEPTION 'STOREFRONT_RATE_LIMITED'; END IF;

  -- Account / phone rate limit: 5 orders per hour
  IF NEW.customer_id IS NOT NULL THEN
    SELECT count(*) INTO v_customer_count FROM public.orders
      WHERE brand_id = NEW.brand_id AND customer_id = NEW.customer_id
        AND channel = 'storefront' AND created_at >= now() - interval '1 hour';
    IF v_customer_count >= 5 THEN RAISE EXCEPTION 'CUSTOMER_ORDER_RATE_LIMITED'; END IF;
  ELSIF NEW.customer_phone IS NOT NULL AND trim(NEW.customer_phone) <> '' THEN
    SELECT count(*) INTO v_customer_count FROM public.orders
      WHERE brand_id = NEW.brand_id AND customer_phone = trim(NEW.customer_phone)
        AND channel = 'storefront' AND created_at >= now() - interval '1 hour';
    IF v_customer_count >= 5 THEN RAISE EXCEPTION 'CUSTOMER_ORDER_RATE_LIMITED'; END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 6. POSITIVE REFUND AMOUNT ENFORCEMENT IN RPC_PROCESS_RETURN_REFUND
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_process_return_refund(
  p_brand_id uuid,
  p_return_id uuid,
  p_refund_method text,
  p_refund_amount numeric,
  p_refund_reference text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_req public.return_requests%ROWTYPE;
    v_order public.orders%ROWTYPE;
    v_total_paid NUMERIC(12,3);
    v_already_refunded NUMERIC(12,3) := 0.000;
    v_user_id UUID := auth.uid();
BEGIN
    IF NOT public.can_access_brand(p_brand_id) OR NOT public.has_permission('manage_orders') THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
    END IF;

    IF p_refund_amount IS NULL OR p_refund_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_REFUND_AMOUNT');
    END IF;

    SELECT * INTO v_req FROM public.return_requests WHERE id = p_return_id AND brand_id = p_brand_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'RETURN_REQUEST_NOT_FOUND'); END IF;

    IF v_req.refund_status = 'processed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'REFUND_ALREADY_PROCESSED');
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = v_req.order_id AND brand_id = p_brand_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND'); END IF;

    v_total_paid := COALESCE(v_order.advance_paid, 0);
    IF v_order.payment_status = 'paid' AND v_total_paid < v_order.total THEN
        v_total_paid := v_order.total;
    END IF;

    SELECT COALESCE(SUM(net_refund_amount), 0) INTO v_already_refunded
    FROM public.return_requests
    WHERE order_id = v_order.id
      AND refund_status = 'processed'
      AND id != v_req.id;

    IF (v_already_refunded + p_refund_amount) > v_total_paid THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'REFUND_EXCEEDS_TOTAL_PAID',
            'details', format('Paid: %s, Already refunded: %s, Attempting: %s', v_total_paid, v_already_refunded, p_refund_amount)
        );
    END IF;

    IF p_refund_method = 'store_credit' THEN
        IF v_order.customer_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_REQUIRED_FOR_STORE_CREDIT');
        END IF;

        INSERT INTO public.store_credits (
            brand_id, customer_id, return_id, order_id, amount, type, notes, created_by
        ) VALUES (
            p_brand_id, v_order.customer_id, v_req.id, v_order.id,
            p_refund_amount, 'return_credit',
            COALESCE(p_notes, format('Store credit for return %s', v_req.return_number)),
            v_user_id
        );
    END IF;

    UPDATE public.return_requests
    SET status = 'refunded',
        refund_status = 'processed',
        refund_method = p_refund_method,
        net_refund_amount = p_refund_amount,
        refund_reference = p_refund_reference,
        refund_processed_at = NOW(),
        completed_at = CASE WHEN type = 'return' THEN NOW() ELSE completed_at END
    WHERE id = v_req.id;

    RETURN jsonb_build_object(
        'success', true,
        'return_id', v_req.id,
        'refund_amount', p_refund_amount,
        'refund_method', p_refund_method
    );
END;
$function$;

-- ============================================================================
-- 7. TAP RECONCILIATION AMOUNT & CURRENCY ASSERTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_verified_tap_order(
  p_order_id uuid,
  p_brand_id uuid,
  p_charge_id text,
  p_verified_status text,
  p_verified_amount numeric DEFAULT NULL,
  p_verified_currency text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_status text := upper(trim(COALESCE(p_verified_status, '')));
BEGIN
  IF v_status NOT IN (
    'CAPTURED', 'SUCCESS', 'ABANDONED', 'CANCELLED', 'DECLINED',
    'FAILED', 'RESTRICTED', 'TIMEDOUT', 'VOID'
  ) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND brand_id = p_brand_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_order.payment_gateway_reference IS DISTINCT FROM p_charge_id
     OR lower(trim(COALESCE(v_order.payment_status, ''))) <> 'unpaid'
     OR lower(trim(COALESCE(v_order.payment_method, ''))) NOT IN (
       'card', 'tap', 'creimax', 'credit', 'credit_card', 'debit_card',
       'apple_pay', 'google_pay'
     ) THEN
    RETURN false;
  END IF;

  IF v_status IN ('CAPTURED', 'SUCCESS') THEN
    -- Validate amount if supplied
    IF p_verified_amount IS NOT NULL AND abs(v_order.total - p_verified_amount) > 0.001 THEN
      RETURN false;
    END IF;

    -- Validate currency if supplied
    IF p_verified_currency IS NOT NULL AND upper(COALESCE(v_order.currency, 'BHD')) <> upper(trim(p_verified_currency)) THEN
      RETURN false;
    END IF;

    UPDATE public.orders
    SET payment_status = 'paid', status = 'confirmed'
    WHERE id = v_order.id;
  ELSE
    UPDATE public.orders
    SET payment_status = CASE WHEN v_status = 'DECLINED' THEN 'declined' ELSE 'failed' END,
        notes = COALESCE(notes || e'\n', '') ||
          'Tap status verified by scheduled reconciliation: ' || v_status
    WHERE id = v_order.id;
  END IF;

  RETURN true;
END;
$function$;
