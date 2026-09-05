-- ============================================================================
-- Migration: 20260905090000_remediate_phase3_security_and_integrity.sql
-- Description:
--   1. Secure list_integration_credentials masking (mask prefix, show last 4 only)
--   2. Fix abandoned_carts duplication bug in rpc_record_or_update_cart_activity
--   3. Change abandoned_carts.marketing_consent default to false
--   4. Introduce atomic rpc_manual_adjust_loyalty_points with created_by audit trail
-- ============================================================================

-- 1. SECURE INTEGRATION CREDENTIALS MASKING
CREATE OR REPLACE FUNCTION public.list_integration_credentials(p_brand_id uuid)
RETURNS TABLE(
  id uuid,
  brand_id uuid,
  provider text,
  base_url text,
  api_key_masked text,
  webhook_secret_masked text,
  has_api_key boolean,
  has_webhook_secret boolean,
  is_active boolean,
  notes text,
  updated_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
  SELECT
    i.id,
    i.brand_id,
    i.provider,
    i.base_url,
    CASE
      WHEN api.decrypted_secret IS NULL THEN NULL
      ELSE '••••••••••••' || right(api.decrypted_secret, 4)
    END,
    CASE
      WHEN webhook.decrypted_secret IS NULL THEN NULL
      ELSE '••••••••••••' || right(webhook.decrypted_secret, 4)
    END,
    api.decrypted_secret IS NOT NULL,
    webhook.decrypted_secret IS NOT NULL,
    i.is_active,
    i.notes,
    i.updated_at
  FROM public.integration_credentials i
  LEFT JOIN vault.decrypted_secrets api ON api.id = i.api_key_secret_id
  LEFT JOIN vault.decrypted_secrets webhook ON webhook.id = i.webhook_secret_secret_id
  WHERE i.brand_id = p_brand_id
    AND public.is_admin() AND public.can_access_brand(p_brand_id)
  ORDER BY i.provider;
$$;

-- 2. ABANDONED CARTS: SET DEFAULT CONSENT TO FALSE & FIX GHOST CONSENTS
ALTER TABLE public.abandoned_carts ALTER COLUMN marketing_consent SET DEFAULT false;

-- Clean up ghost marketing consents where no contact info exists
UPDATE public.abandoned_carts
SET marketing_consent = false
WHERE marketing_consent = true
  AND guest_phone IS NULL
  AND guest_email IS NULL
  AND customer_id IS NULL;

-- 3. FIX ABANDONED CARTS DEDUPLICATION IN rpc_record_or_update_cart_activity
CREATE OR REPLACE FUNCTION public.rpc_record_or_update_cart_activity(
  p_brand_id uuid,
  p_session_id text,
  p_customer_id uuid DEFAULT NULL,
  p_guest_email text DEFAULT NULL,
  p_guest_phone text DEFAULT NULL,
  p_guest_name text DEFAULT NULL,
  p_cart_items jsonb DEFAULT '[]'::jsonb,
  p_subtotal numeric DEFAULT 0.000,
  p_currency text DEFAULT 'BHD',
  p_marketing_consent boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart_id uuid;
  v_recovery_token text;
  v_effective_consent boolean;
BEGIN
  IF jsonb_array_length(p_cart_items) = 0 THEN
    -- If cart became empty, mark as expired/cleared
    UPDATE public.abandoned_carts
    SET status = 'expired',
        cart_items = '[]'::jsonb,
        subtotal = 0,
        updated_at = now()
    WHERE brand_id = p_brand_id
      AND session_id = p_session_id
      AND status IN ('active', 'abandoned', 'recovering');

    RETURN jsonb_build_object('success', true, 'status', 'cleared');
  END IF;

  -- Explicit consent requires at least one valid contact channel
  v_effective_consent := COALESCE(p_marketing_consent, false) AND (
    NULLIF(trim(p_guest_email), '') IS NOT NULL OR
    NULLIF(trim(p_guest_phone), '') IS NOT NULL OR
    p_customer_id IS NOT NULL
  );

  -- 1. Check if an existing open cart already exists for this session
  SELECT id, recovery_token INTO v_cart_id, v_recovery_token
  FROM public.abandoned_carts
  WHERE brand_id = p_brand_id
    AND session_id = p_session_id
    AND status IN ('active', 'abandoned', 'recovering')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_cart_id IS NOT NULL THEN
    -- Update existing cart without creating duplicate rows
    UPDATE public.abandoned_carts
    SET customer_id = COALESCE(p_customer_id, customer_id),
        guest_email = COALESCE(NULLIF(trim(p_guest_email), ''), guest_email),
        guest_phone = COALESCE(NULLIF(trim(p_guest_phone), ''), guest_phone),
        guest_name = COALESCE(NULLIF(trim(p_guest_name), ''), guest_name),
        cart_items = p_cart_items,
        subtotal = p_subtotal,
        currency = p_currency,
        marketing_consent = CASE WHEN v_effective_consent THEN true ELSE marketing_consent END,
        status = 'active',
        last_activity_at = now(),
        updated_at = now()
    WHERE id = v_cart_id;
  ELSE
    -- Insert new cart row for new session
    v_recovery_token := encode(gen_random_bytes(16), 'hex');
    INSERT INTO public.abandoned_carts (
      brand_id, session_id, customer_id, guest_email, guest_phone,
      guest_name, cart_items, subtotal, currency, marketing_consent,
      status, recovery_token, last_activity_at, created_at, updated_at
    ) VALUES (
      p_brand_id, p_session_id, p_customer_id, NULLIF(trim(p_guest_email), ''),
      NULLIF(trim(p_guest_phone), ''), NULLIF(trim(p_guest_name), ''),
      p_cart_items, p_subtotal, p_currency, v_effective_consent,
      'active', v_recovery_token, now(), now(), now()
    )
    RETURNING id INTO v_cart_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cart_id', v_cart_id,
    'recovery_token', v_recovery_token
  );
END;
$$;

-- 4. ATOMIC MANUAL ADJUSTMENT WITH AUDIT TRAIL
CREATE OR REPLACE FUNCTION public.rpc_manual_adjust_loyalty_points(
  p_brand_id uuid,
  p_customer_id uuid,
  p_points_delta integer,
  p_reason_ar text,
  p_reason_en text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account loyalty_accounts%ROWTYPE;
  v_new_balance integer;
  v_caller_id uuid;
  v_event_type text;
  v_idempotency_key text;
BEGIN
  -- Verify caller has access to this brand
  IF NOT (public.is_admin() AND public.can_access_brand(p_brand_id)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_points_delta = 0 THEN
    RAISE EXCEPTION 'Points delta cannot be zero';
  END IF;

  IF trim(COALESCE(p_reason_ar, '')) = '' AND trim(COALESCE(p_reason_en, '')) = '' THEN
    RAISE EXCEPTION 'A reason for adjustment is required for audit trail';
  END IF;

  -- Ensure account exists
  INSERT INTO public.loyalty_accounts (brand_id, customer_id, active_points, pending_points, current_tier_key)
  VALUES (p_brand_id, p_customer_id, 0, 0, 'bronze')
  ON CONFLICT (brand_id, customer_id) DO NOTHING;

  -- Lock row for update
  SELECT * INTO v_account
  FROM public.loyalty_accounts
  WHERE brand_id = p_brand_id AND customer_id = p_customer_id
  FOR UPDATE;

  v_new_balance := GREATEST(0, v_account.active_points + p_points_delta);

  -- Update account balances
  UPDATE public.loyalty_accounts
  SET active_points = v_new_balance,
      lifetime_points = CASE WHEN p_points_delta > 0 THEN v_account.lifetime_points + p_points_delta ELSE v_account.lifetime_points END,
      updated_at = now()
  WHERE id = v_account.id;

  v_event_type := CASE WHEN p_points_delta >= 0 THEN 'earn_manual' ELSE 'adjust_manual' END;
  v_idempotency_key := 'manual_adj_' || p_brand_id || '_' || p_customer_id || '_' || extract(epoch from now())::text || '_' || substr(gen_random_uuid()::text, 1, 8);

  -- Insert into ledger with created_by audit trail
  INSERT INTO public.loyalty_ledger (
    brand_id,
    customer_id,
    account_id,
    event_type,
    points,
    points_status,
    effective_at,
    idempotency_key,
    reference_note_ar,
    reference_note_en,
    balance_after,
    created_by,
    created_at
  ) VALUES (
    p_brand_id,
    p_customer_id,
    v_account.id,
    v_event_type,
    p_points_delta,
    'active',
    now(),
    v_idempotency_key,
    trim(COALESCE(p_reason_ar, p_reason_en)),
    trim(COALESCE(p_reason_en, p_reason_ar)),
    v_new_balance,
    v_caller_id,
    now()
  );

  -- Re-evaluate customer tier after adjustment
  PERFORM public.rpc_evaluate_customer_loyalty_tier(p_brand_id, p_customer_id);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'points_delta', p_points_delta,
    'account_id', v_account.id
  );
END;
$$;
