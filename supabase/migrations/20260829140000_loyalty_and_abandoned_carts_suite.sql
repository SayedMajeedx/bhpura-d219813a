-- ============================================================================
-- Migration: 20260829140000_loyalty_and_abandoned_carts_suite.sql
-- Description: Multi-tenant Loyalty & Rewards Program and Abandoned Carts Recovery Suite
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LOYALTY & REWARDS PROGRAM SCHEMAS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.brand_loyalty_programs (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  points_per_currency_unit numeric NOT NULL DEFAULT 10.0 CHECK (points_per_currency_unit > 0),
  redemption_rate numeric NOT NULL DEFAULT 0.010 CHECK (redemption_rate > 0), -- e.g. 1 point = 0.010 BHD -> 100 points = 1.000 BHD
  min_points_to_redeem integer NOT NULL DEFAULT 100 CHECK (min_points_to_redeem >= 0),
  max_redemption_percentage numeric NOT NULL DEFAULT 50.0 CHECK (max_redemption_percentage > 0 AND max_redemption_percentage <= 100),
  points_expiry_days integer NOT NULL DEFAULT 365 CHECK (points_expiry_days >= 0), -- 0 = never
  holding_period_days integer NOT NULL DEFAULT 14 CHECK (holding_period_days >= 0), -- maturation period before order points become active
  include_shipping boolean NOT NULL DEFAULT false,
  include_tax boolean NOT NULL DEFAULT false,
  include_discounted_items boolean NOT NULL DEFAULT false,
  first_order_bonus_points integer NOT NULL DEFAULT 50 CHECK (first_order_bonus_points >= 0),
  review_bonus_points integer NOT NULL DEFAULT 25 CHECK (review_bonus_points >= 0),
  referral_bonus_points integer NOT NULL DEFAULT 100 CHECK (referral_bonus_points >= 0),
  welcome_bonus_points integer NOT NULL DEFAULT 20 CHECK (welcome_bonus_points >= 0),
  tier_multipliers_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.brand_loyalty_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  tier_key text NOT NULL CHECK (tier_key IN ('bronze', 'silver', 'gold', 'vip')),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  min_spend numeric NOT NULL DEFAULT 0.000 CHECK (min_spend >= 0),
  min_points integer NOT NULL DEFAULT 0 CHECK (min_points >= 0),
  points_multiplier numeric NOT NULL DEFAULT 1.0 CHECK (points_multiplier >= 1.0),
  free_shipping boolean NOT NULL DEFAULT false,
  discount_percent numeric NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  badge_color text NOT NULL DEFAULT '#64748b',
  perks_ar text[] NOT NULL DEFAULT '{}',
  perks_en text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_loyalty_tiers_brand_tier_unique UNIQUE (brand_id, tier_key)
);

CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  active_points integer NOT NULL DEFAULT 0 CHECK (active_points >= 0),
  pending_points integer NOT NULL DEFAULT 0 CHECK (pending_points >= 0),
  lifetime_points integer NOT NULL DEFAULT 0 CHECK (lifetime_points >= 0),
  lifetime_spent_points integer NOT NULL DEFAULT 0 CHECK (lifetime_spent_points >= 0),
  current_tier_key text NOT NULL DEFAULT 'bronze' CHECK (current_tier_key IN ('bronze', 'silver', 'gold', 'vip')),
  tier_achieved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_accounts_brand_customer_unique UNIQUE (brand_id, customer_id)
);

CREATE TABLE IF NOT EXISTS public.loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.loyalty_accounts(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'earn_order', 'earn_review', 'earn_first_order', 'earn_referral',
    'earn_manual', 'earn_welcome', 'redeem_checkout', 'refund_return',
    'revoke_cancelled', 'expire_points', 'adjust_manual'
  )),
  points integer NOT NULL, -- can be positive (credit) or negative (debit)
  points_status text NOT NULL DEFAULT 'active' CHECK (points_status IN ('pending', 'active', 'redeemed', 'cancelled', 'expired')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  review_id uuid REFERENCES public.order_reviews(id) ON DELETE SET NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  idempotency_key text NOT NULL,
  reference_note_ar text,
  reference_note_en text,
  balance_after integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_ledger_brand_idempotency_unique UNIQUE (brand_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_customer ON public.loyalty_ledger (brand_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_order ON public.loyalty_ledger (brand_id, order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_effective ON public.loyalty_ledger (effective_at) WHERE points_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_expires ON public.loyalty_ledger (expires_at) WHERE points_status = 'active' AND expires_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. ABANDONED CARTS RECOVERY SCHEMAS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.brand_abandoned_cart_settings (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  abandonment_threshold_minutes integer NOT NULL DEFAULT 30 CHECK (abandonment_threshold_minutes >= 5),
  max_recovery_messages integer NOT NULL DEFAULT 3 CHECK (max_recovery_messages BETWEEN 1 AND 5),
  cooldown_hours_between_messages integer NOT NULL DEFAULT 12 CHECK (cooldown_hours_between_messages >= 1),
  enable_whatsapp boolean NOT NULL DEFAULT true,
  enable_email boolean NOT NULL DEFAULT true,
  enable_push boolean NOT NULL DEFAULT false,
  default_discount_type text NOT NULL DEFAULT 'percentage' CHECK (default_discount_type IN ('percentage', 'fixed', 'none')),
  default_discount_value numeric NOT NULL DEFAULT 10.0 CHECK (default_discount_value >= 0),
  discount_expiry_hours integer NOT NULL DEFAULT 48 CHECK (discount_expiry_hours >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.abandoned_cart_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  step_number integer NOT NULL CHECK (step_number BETWEEN 1 AND 5),
  delay_hours integer NOT NULL DEFAULT 1 CHECK (delay_hours >= 0),
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'email', 'push')),
  subject_ar text NOT NULL,
  subject_en text NOT NULL,
  message_template_ar text NOT NULL,
  message_template_en text NOT NULL,
  include_discount boolean NOT NULL DEFAULT false,
  discount_percent numeric NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT abandoned_cart_sequences_brand_step_unique UNIQUE (brand_id, step_number)
);

CREATE TABLE IF NOT EXISTS public.abandoned_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  guest_email text,
  guest_phone text,
  guest_name text,
  cart_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0.000 CHECK (subtotal >= 0),
  currency text NOT NULL DEFAULT 'BHD',
  recovery_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'abandoned', 'recovering', 'recovered', 'expired', 'unsubscribed')),
  marketing_consent boolean NOT NULL DEFAULT true,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  abandoned_at timestamptz,
  recovery_attempts_count integer NOT NULL DEFAULT 0 CHECK (recovery_attempts_count >= 0),
  last_recovery_sent_at timestamptz,
  recovered_at timestamptz,
  recovered_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  recovery_discount_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.abandoned_cart_dispatch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  cart_id uuid NOT NULL REFERENCES public.abandoned_carts(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email', 'push')),
  recipient text NOT NULL,
  discount_code text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped_opt_out', 'skipped_recovered')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT abandoned_cart_dispatch_logs_idempotency_unique UNIQUE (brand_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_lookup ON public.abandoned_carts (brand_id, status, last_activity_at);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_session ON public.abandoned_carts (brand_id, session_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_recovery_token ON public.abandoned_carts (recovery_token);

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.brand_loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_loyalty_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_abandoned_cart_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_cart_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abandoned_cart_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Staff brand access
CREATE POLICY "staff_read_loyalty_programs" ON public.brand_loyalty_programs
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "staff_write_loyalty_programs" ON public.brand_loyalty_programs
  FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "public_read_loyalty_programs" ON public.brand_loyalty_programs
  FOR SELECT TO anon USING (is_enabled = true);

CREATE POLICY "staff_read_loyalty_tiers" ON public.brand_loyalty_tiers
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "staff_write_loyalty_tiers" ON public.brand_loyalty_tiers
  FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "public_read_loyalty_tiers" ON public.brand_loyalty_tiers
  FOR SELECT TO anon USING (true);

CREATE POLICY "staff_read_loyalty_accounts" ON public.loyalty_accounts
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "staff_write_loyalty_accounts" ON public.loyalty_accounts
  FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "customers_read_own_loyalty_account" ON public.loyalty_accounts
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT c.id FROM public.customers c WHERE c.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "staff_read_loyalty_ledger" ON public.loyalty_ledger
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "staff_write_loyalty_ledger" ON public.loyalty_ledger
  FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "customers_read_own_loyalty_ledger" ON public.loyalty_ledger
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT c.id FROM public.customers c WHERE c.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "staff_read_abandoned_settings" ON public.brand_abandoned_cart_settings
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "staff_write_abandoned_settings" ON public.brand_abandoned_cart_settings
  FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "staff_read_abandoned_sequences" ON public.abandoned_cart_sequences
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "staff_write_abandoned_sequences" ON public.abandoned_cart_sequences
  FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "staff_read_abandoned_carts" ON public.abandoned_carts
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "staff_write_abandoned_carts" ON public.abandoned_carts
  FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

CREATE POLICY "staff_read_abandoned_dispatch_logs" ON public.abandoned_cart_dispatch_logs
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
CREATE POLICY "staff_write_abandoned_dispatch_logs" ON public.abandoned_cart_dispatch_logs
  FOR ALL TO authenticated USING (public.can_access_brand(brand_id)) WITH CHECK (public.can_access_brand(brand_id));

-- ----------------------------------------------------------------------------
-- 4. ATOMIC STORED PROCEDURES & BUSINESS ENGINES
-- ----------------------------------------------------------------------------

-- A. Recalculate & Update Customer Tier Function
CREATE OR REPLACE FUNCTION public.rpc_evaluate_customer_loyalty_tier(
  p_brand_id uuid,
  p_customer_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account loyalty_accounts%ROWTYPE;
  v_total_spend numeric := 0;
  v_tier_row brand_loyalty_tiers%ROWTYPE;
  v_assigned_tier text := 'bronze';
BEGIN
  -- Fetch or create account
  INSERT INTO public.loyalty_accounts (brand_id, customer_id, current_tier_key)
  VALUES (p_brand_id, p_customer_id, 'bronze')
  ON CONFLICT (brand_id, customer_id) DO NOTHING;

  SELECT * INTO v_account FROM public.loyalty_accounts
  WHERE brand_id = p_brand_id AND customer_id = p_customer_id;

  -- Calculate total customer spend from completed/paid orders
  SELECT COALESCE(SUM(total), 0) INTO v_total_spend
  FROM public.orders
  WHERE brand_id = p_brand_id
    AND customer_id = p_customer_id
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'refunded');

  -- Find highest matching tier
  FOR v_tier_row IN
    SELECT * FROM public.brand_loyalty_tiers
    WHERE brand_id = p_brand_id
    ORDER BY min_spend DESC, min_points DESC
  LOOP
    IF v_total_spend >= v_tier_row.min_spend AND v_account.lifetime_points >= v_tier_row.min_points THEN
      v_assigned_tier := v_tier_row.tier_key;
      EXIT;
    END IF;
  END LOOP;

  -- Update account if tier changed
  IF v_account.current_tier_key IS DISTINCT FROM v_assigned_tier THEN
    UPDATE public.loyalty_accounts
    SET current_tier_key = v_assigned_tier,
        tier_achieved_at = now(),
        updated_at = now()
    WHERE id = v_account.id;
  END IF;

  RETURN v_assigned_tier;
END;
$$;

-- B. Calculate Order Earning Points Function
CREATE OR REPLACE FUNCTION public.rpc_calculate_order_loyalty_points(
  p_brand_id uuid,
  p_customer_id uuid,
  p_subtotal numeric,
  p_discount numeric,
  p_tax numeric,
  p_shipping numeric,
  p_has_discounted_items boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program brand_loyalty_programs%ROWTYPE;
  v_account loyalty_accounts%ROWTYPE;
  v_tier brand_loyalty_tiers%ROWTYPE;
  v_eligible_amount numeric := 0;
  v_base_points integer := 0;
  v_multiplier numeric := 1.0;
  v_final_points integer := 0;
BEGIN
  SELECT * INTO v_program FROM public.brand_loyalty_programs WHERE brand_id = p_brand_id;
  IF NOT FOUND OR v_program.is_enabled = false THEN
    RETURN jsonb_build_object(
      'is_enabled', false,
      'eligible_amount', 0,
      'points_to_earn', 0,
      'multiplier', 1.0
    );
  END IF;

  -- Base eligible spend calculation
  v_eligible_amount := GREATEST(0, COALESCE(p_subtotal, 0) - COALESCE(p_discount, 0));

  IF v_program.include_tax THEN
    v_eligible_amount := v_eligible_amount + COALESCE(p_tax, 0);
  END IF;

  IF v_program.include_shipping THEN
    v_eligible_amount := v_eligible_amount + COALESCE(p_shipping, 0);
  END IF;

  IF p_has_discounted_items AND NOT v_program.include_discounted_items THEN
    -- If discounted items are excluded and order had discounts, discount is deducted
    v_eligible_amount := GREATEST(0, v_eligible_amount);
  END IF;

  -- Multiplier determination
  IF v_program.tier_multipliers_enabled AND p_customer_id IS NOT NULL THEN
    SELECT * INTO v_account FROM public.loyalty_accounts
    WHERE brand_id = p_brand_id AND customer_id = p_customer_id;

    IF FOUND THEN
      SELECT * INTO v_tier FROM public.brand_loyalty_tiers
      WHERE brand_id = p_brand_id AND tier_key = v_account.current_tier_key;
      IF FOUND THEN
        v_multiplier := COALESCE(v_tier.points_multiplier, 1.0);
      END IF;
    END IF;
  END IF;

  v_base_points := FLOOR(v_eligible_amount * v_program.points_per_currency_unit);
  v_final_points := FLOOR(v_base_points * v_multiplier);

  RETURN jsonb_build_object(
    'is_enabled', true,
    'eligible_amount', v_eligible_amount,
    'points_to_earn', v_final_points,
    'multiplier', v_multiplier,
    'holding_period_days', v_program.holding_period_days
  );
END;
$$;

-- C. Award Order Points (With Idempotency)
CREATE OR REPLACE FUNCTION public.rpc_award_order_loyalty_points(
  p_brand_id uuid,
  p_order_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_program brand_loyalty_programs%ROWTYPE;
  v_account loyalty_accounts%ROWTYPE;
  v_calc jsonb;
  v_points_to_earn integer;
  v_holding_days integer;
  v_effective_at timestamptz;
  v_expires_at timestamptz;
  v_is_first_order boolean := false;
  v_first_order_bonus integer := 0;
  v_total_awarded integer := 0;
  v_existing_ledger loyalty_ledger%ROWTYPE;
  v_balance_after integer := 0;
BEGIN
  -- Idempotency check
  SELECT * INTO v_existing_ledger FROM public.loyalty_ledger
  WHERE brand_id = p_brand_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_awarded', true, 'points', v_existing_ledger.points);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND brand_id = p_brand_id;
  IF NOT FOUND OR v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valid order with customer required');
  END IF;

  SELECT * INTO v_program FROM public.brand_loyalty_programs WHERE brand_id = p_brand_id;
  IF NOT FOUND OR v_program.is_enabled = false THEN
    RETURN jsonb_build_object('success', true, 'awarded', 0, 'message', 'Loyalty disabled');
  END IF;

  -- Ensure account exists
  INSERT INTO public.loyalty_accounts (brand_id, customer_id, current_tier_key)
  VALUES (p_brand_id, v_order.customer_id, 'bronze')
  ON CONFLICT (brand_id, customer_id) DO NOTHING;

  SELECT * INTO v_account FROM public.loyalty_accounts
  WHERE brand_id = p_brand_id AND customer_id = v_order.customer_id;

  -- Calculate points
  v_calc := public.rpc_calculate_order_loyalty_points(
    p_brand_id,
    v_order.customer_id,
    v_order.subtotal,
    v_order.discount,
    v_order.tax_amount,
    v_order.shipping,
    COALESCE(v_order.discount, 0) > 0
  );

  v_points_to_earn := COALESCE((v_calc->>'points_to_earn')::integer, 0);
  v_holding_days := COALESCE(v_program.holding_period_days, 14);

  IF v_holding_days > 0 THEN
    v_effective_at := now() + (v_holding_days || ' days')::interval;
  ELSE
    v_effective_at := now();
  END IF;

  IF v_program.points_expiry_days > 0 THEN
    v_expires_at := v_effective_at + (v_program.points_expiry_days || ' days')::interval;
  ELSE
    v_expires_at := NULL;
  END IF;

  -- Check if first order bonus applies
  SELECT NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE brand_id = p_brand_id AND customer_id = v_order.customer_id AND id <> p_order_id
      AND lower(COALESCE(status, '')) NOT IN ('cancelled')
  ) INTO v_is_first_order;

  IF v_is_first_order AND v_program.first_order_bonus_points > 0 THEN
    v_first_order_bonus := v_program.first_order_bonus_points;
  END IF;

  v_total_awarded := v_points_to_earn + v_first_order_bonus;
  IF v_total_awarded <= 0 THEN
    RETURN jsonb_build_object('success', true, 'points', 0);
  END IF;

  -- Update account balances
  IF v_holding_days > 0 THEN
    UPDATE public.loyalty_accounts
    SET pending_points = pending_points + v_total_awarded,
        lifetime_points = lifetime_points + v_total_awarded,
        updated_at = now()
    WHERE id = v_account.id
    RETURNING active_points INTO v_balance_after;
  ELSE
    UPDATE public.loyalty_accounts
    SET active_points = active_points + v_total_awarded,
        lifetime_points = lifetime_points + v_total_awarded,
        updated_at = now()
    WHERE id = v_account.id
    RETURNING active_points INTO v_balance_after;
  END IF;

  -- Log into Ledger
  INSERT INTO public.loyalty_ledger (
    brand_id, customer_id, account_id, event_type, points,
    points_status, order_id, effective_at, expires_at,
    idempotency_key, reference_note_ar, reference_note_en,
    balance_after
  ) VALUES (
    p_brand_id, v_order.customer_id, v_account.id,
    CASE WHEN v_first_order_bonus > 0 THEN 'earn_first_order' ELSE 'earn_order' END,
    v_total_awarded,
    CASE WHEN v_holding_days > 0 THEN 'pending' ELSE 'active' END,
    p_order_id, v_effective_at, v_expires_at,
    p_idempotency_key,
    'نقاط مكتسبة عن الطلب #' || COALESCE(v_order.invoice_number, ''),
    'Points earned for Order #' || COALESCE(v_order.invoice_number, ''),
    v_balance_after
  );

  -- Re-evaluate Tier
  PERFORM public.rpc_evaluate_customer_loyalty_tier(p_brand_id, v_order.customer_id);

  RETURN jsonb_build_object(
    'success', true,
    'points_awarded', v_total_awarded,
    'effective_at', v_effective_at,
    'status', CASE WHEN v_holding_days > 0 THEN 'pending' ELSE 'active' END
  );
END;
$$;

-- D. Validate and Redeem Points during Checkout
CREATE OR REPLACE FUNCTION public.rpc_validate_and_redeem_loyalty_points(
  p_brand_id uuid,
  p_customer_id uuid,
  p_points_to_redeem integer,
  p_order_subtotal numeric,
  p_idempotency_key text,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program brand_loyalty_programs%ROWTYPE;
  v_account loyalty_accounts%ROWTYPE;
  v_existing_ledger loyalty_ledger%ROWTYPE;
  v_max_redemption_amount numeric := 0;
  v_max_redeemable_points integer := 0;
  v_discount_amount numeric := 0;
  v_balance_after integer := 0;
BEGIN
  -- Check idempotency
  SELECT * INTO v_existing_ledger FROM public.loyalty_ledger
  WHERE brand_id = p_brand_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_redeemed', true,
      'points_redeemed', ABS(v_existing_ledger.points),
      'discount_amount', ABS(v_existing_ledger.points) * 0.010
    );
  END IF;

  SELECT * INTO v_program FROM public.brand_loyalty_programs WHERE brand_id = p_brand_id;
  IF NOT FOUND OR v_program.is_enabled = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Loyalty program is disabled');
  END IF;

  IF p_points_to_redeem < v_program.min_points_to_redeem THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Minimum points required to redeem is ' || v_program.min_points_to_redeem
    );
  END IF;

  SELECT * INTO v_account FROM public.loyalty_accounts
  WHERE brand_id = p_brand_id AND customer_id = p_customer_id
  FOR UPDATE; -- Lock row to prevent concurrency race conditions

  IF NOT FOUND OR v_account.active_points < p_points_to_redeem THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient active points balance',
      'available_points', COALESCE(v_account.active_points, 0)
    );
  END IF;

  -- Max allowed redemption value based on percentage
  v_max_redemption_amount := p_order_subtotal * (v_program.max_redemption_percentage / 100.0);
  v_max_redeemable_points := FLOOR(v_max_redemption_amount / v_program.redemption_rate);

  IF p_points_to_redeem > v_max_redeemable_points THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Points exceed max redemption threshold for this order',
      'max_allowed_points', v_max_redeemable_points
    );
  END IF;

  v_discount_amount := ROUND((p_points_to_redeem * v_program.redemption_rate)::numeric, 3);

  -- Deduct points
  UPDATE public.loyalty_accounts
  SET active_points = active_points - p_points_to_redeem,
      lifetime_spent_points = lifetime_spent_points + p_points_to_redeem,
      updated_at = now()
  WHERE id = v_account.id
  RETURNING active_points INTO v_balance_after;

  -- Record redemption in ledger
  INSERT INTO public.loyalty_ledger (
    brand_id, customer_id, account_id, event_type, points,
    points_status, order_id, effective_at, idempotency_key,
    reference_note_ar, reference_note_en, balance_after
  ) VALUES (
    p_brand_id, p_customer_id, v_account.id, 'redeem_checkout',
    -p_points_to_redeem, 'redeemed', p_order_id, now(),
    p_idempotency_key,
    'استخدام نقاط مكافآت عند الدفع',
    'Loyalty points redemption at checkout',
    v_balance_after
  );

  RETURN jsonb_build_object(
    'success', true,
    'points_redeemed', p_points_to_redeem,
    'discount_amount', v_discount_amount,
    'new_balance', v_balance_after
  );
END;
$$;

-- E. Process Return / Cancellation Loyalty Adjustment
CREATE OR REPLACE FUNCTION public.rpc_process_return_loyalty_adjustment(
  p_brand_id uuid,
  p_order_id uuid,
  p_return_id uuid,
  p_pro_rated_points_to_revoke integer,
  p_pro_rated_points_to_refund integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_account loyalty_accounts%ROWTYPE;
  v_existing_ledger loyalty_ledger%ROWTYPE;
  v_balance_after integer := 0;
BEGIN
  -- Idempotency check
  SELECT * INTO v_existing_ledger FROM public.loyalty_ledger
  WHERE brand_id = p_brand_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND brand_id = p_brand_id;
  IF NOT FOUND OR v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  SELECT * INTO v_account FROM public.loyalty_accounts
  WHERE brand_id = p_brand_id AND customer_id = v_order.customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Loyalty account not found');
  END IF;

  -- 1. Revoke unearned points (deduct from pending or active)
  IF p_pro_rated_points_to_revoke > 0 THEN
    IF v_account.pending_points >= p_pro_rated_points_to_revoke THEN
      UPDATE public.loyalty_accounts
      SET pending_points = pending_points - p_pro_rated_points_to_revoke,
          lifetime_points = GREATEST(0, lifetime_points - p_pro_rated_points_to_revoke),
          updated_at = now()
      WHERE id = v_account.id;
    ELSE
      UPDATE public.loyalty_accounts
      SET active_points = GREATEST(0, active_points - (p_pro_rated_points_to_revoke - v_account.pending_points)),
          pending_points = 0,
          lifetime_points = GREATEST(0, lifetime_points - p_pro_rated_points_to_revoke),
          updated_at = now()
      WHERE id = v_account.id;
    END IF;

    INSERT INTO public.loyalty_ledger (
      brand_id, customer_id, account_id, event_type, points,
      points_status, order_id, effective_at, idempotency_key,
      reference_note_ar, reference_note_en, balance_after
    ) VALUES (
      p_brand_id, v_order.customer_id, v_account.id, 'revoke_cancelled',
      -p_pro_rated_points_to_revoke, 'cancelled', p_order_id, now(),
      p_idempotency_key || '_revoke',
      'إلغاء نقاط مكتسبة عن مرتجع/إلغاء الطلب #' || COALESCE(v_order.invoice_number, ''),
      'Revoked earned points on return/cancellation for Order #' || COALESCE(v_order.invoice_number, ''),
      v_account.active_points
    );
  END IF;

  -- 2. Refund redeemed points back to customer active balance
  IF p_pro_rated_points_to_refund > 0 THEN
    UPDATE public.loyalty_accounts
    SET active_points = active_points + p_pro_rated_points_to_refund,
        lifetime_spent_points = GREATEST(0, lifetime_spent_points - p_pro_rated_points_to_refund),
        updated_at = now()
    WHERE id = v_account.id
    RETURNING active_points INTO v_balance_after;

    INSERT INTO public.loyalty_ledger (
      brand_id, customer_id, account_id, event_type, points,
      points_status, order_id, effective_at, idempotency_key,
      reference_note_ar, reference_note_en, balance_after
    ) VALUES (
      p_brand_id, v_order.customer_id, v_account.id, 'refund_return',
      p_pro_rated_points_to_refund, 'active', p_order_id, now(),
      p_idempotency_key || '_refund',
      'إعادة نقاط مستخدمة لمرتجع الطلب #' || COALESCE(v_order.invoice_number, ''),
      'Refunded spent points on return for Order #' || COALESCE(v_order.invoice_number, ''),
      v_balance_after
    );
  END IF;

  -- Re-evaluate Tier
  PERFORM public.rpc_evaluate_customer_loyalty_tier(p_brand_id, v_order.customer_id);

  RETURN jsonb_build_object(
    'success', true,
    'points_revoked', p_pro_rated_points_to_revoke,
    'points_refunded', p_pro_rated_points_to_refund
  );
END;
$$;

-- F. Abandoned Cart: Record / Update Activity
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
  p_marketing_consent boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart abandoned_carts%ROWTYPE;
BEGIN
  IF jsonb_array_length(p_cart_items) = 0 THEN
    -- If cart became empty, mark as expired/cleared
    UPDATE public.abandoned_carts
    SET status = 'expired',
        cart_items = '[]'::jsonb,
        subtotal = 0,
        updated_at = now()
    WHERE brand_id = p_brand_id AND session_id = p_session_id AND status = 'active';

    RETURN jsonb_build_object('success', true, 'status', 'cleared');
  END IF;

  INSERT INTO public.abandoned_carts (
    brand_id, session_id, customer_id, guest_email, guest_phone,
    guest_name, cart_items, subtotal, currency, marketing_consent,
    status, last_activity_at
  ) VALUES (
    p_brand_id, p_session_id, p_customer_id, NULLIF(trim(p_guest_email), ''),
    NULLIF(trim(p_guest_phone), ''), NULLIF(trim(p_guest_name), ''),
    p_cart_items, p_subtotal, p_currency, p_marketing_consent,
    'active', now()
  )
  ON CONFLICT (recovery_token) DO NOTHING;

  -- Update existing active cart for this session
  UPDATE public.abandoned_carts
  SET customer_id = COALESCE(p_customer_id, customer_id),
      guest_email = COALESCE(NULLIF(trim(p_guest_email), ''), guest_email),
      guest_phone = COALESCE(NULLIF(trim(p_guest_phone), ''), guest_phone),
      guest_name = COALESCE(NULLIF(trim(p_guest_name), ''), guest_name),
      cart_items = p_cart_items,
      subtotal = p_subtotal,
      currency = p_currency,
      marketing_consent = p_marketing_consent,
      status = 'active',
      last_activity_at = now(),
      updated_at = now()
  WHERE brand_id = p_brand_id AND session_id = p_session_id AND status IN ('active', 'abandoned', 'recovering')
  RETURNING * INTO v_cart;

  RETURN jsonb_build_object(
    'success', true,
    'cart_id', v_cart.id,
    'recovery_token', v_cart.recovery_token
  );
END;
$$;

-- G. Mark Cart Recovered on Successful Order
CREATE OR REPLACE FUNCTION public.rpc_mark_cart_recovered_on_order(
  p_brand_id uuid,
  p_order_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_guest_email text DEFAULT NULL,
  p_guest_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count integer := 0;
BEGIN
  UPDATE public.abandoned_carts
  SET status = 'recovered',
      recovered_at = now(),
      recovered_order_id = p_order_id,
      updated_at = now()
  WHERE brand_id = p_brand_id
    AND status IN ('active', 'abandoned', 'recovering')
    AND (
      (p_session_id IS NOT NULL AND session_id = p_session_id)
      OR (p_customer_id IS NOT NULL AND customer_id = p_customer_id)
      OR (p_guest_phone IS NOT NULL AND guest_phone = p_guest_phone)
      OR (p_guest_email IS NOT NULL AND guest_email = p_guest_email)
    );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'recovered_carts_count', v_updated_count,
    'order_id', p_order_id
  );
END;
$$;

-- H. Validate and Restore Cart via Recovery Token
CREATE OR REPLACE FUNCTION public.rpc_validate_and_restore_abandoned_cart(
  p_brand_slug text,
  p_recovery_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand brands%ROWTYPE;
  v_cart abandoned_carts%ROWTYPE;
  v_raw_items jsonb;
  v_item jsonb;
  v_variant product_variants%ROWTYPE;
  v_product products%ROWTYPE;
  v_adjusted_items jsonb := '[]'::jsonb;
  v_has_out_of_stock boolean := false;
  v_has_price_change boolean := false;
  v_available_qty integer := 0;
  v_current_price numeric := 0;
  v_new_subtotal numeric := 0;
BEGIN
  SELECT * INTO v_brand FROM public.brands WHERE slug = p_brand_slug;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Brand not found');
  END IF;

  SELECT * INTO v_cart FROM public.abandoned_carts
  WHERE brand_id = v_brand.id AND recovery_token = p_recovery_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired recovery link');
  END IF;

  IF v_cart.status = 'recovered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This cart has already been completed into an order');
  END IF;

  v_raw_items := v_cart.cart_items;

  -- Validate each item against live inventory and pricing
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_raw_items)
  LOOP
    SELECT * INTO v_variant FROM public.product_variants
    WHERE id = (v_item->>'variant_id')::uuid AND brand_id = v_brand.id;

    IF FOUND THEN
      SELECT * INTO v_product FROM public.products WHERE id = v_variant.product_id;

      v_available_qty := COALESCE(v_variant.stock_quantity, 0);
      v_current_price := COALESCE(v_variant.selling_price, v_product.base_price, (v_item->>'price')::numeric);

      IF (v_item->>'price')::numeric <> v_current_price THEN
        v_has_price_change := true;
      END IF;

      IF v_available_qty <= 0 THEN
        v_has_out_of_stock := true;
      ELSE
        -- Adjust quantity to max available if needed
        v_adjusted_items := v_adjusted_items || jsonb_build_object(
          'cart_line_id', v_item->>'cart_line_id',
          'variant_id', v_variant.id,
          'product_id', v_variant.product_id,
          'title', COALESCE(v_product.name_ar, v_product.name_en, v_item->>'title'),
          'price', v_current_price,
          'qty', LEAST((v_item->>'qty')::integer, v_available_qty),
          'image_url', COALESCE(v_variant.image_url, v_item->>'image_url'),
          'stock_available', v_available_qty
        );
        v_new_subtotal := v_new_subtotal + (v_current_price * LEAST((v_item->>'qty')::integer, v_available_qty));
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'cart_id', v_cart.id,
    'customer_id', v_cart.customer_id,
    'guest_name', v_cart.guest_name,
    'guest_email', v_cart.guest_email,
    'guest_phone', v_cart.guest_phone,
    'items', v_adjusted_items,
    'subtotal', v_new_subtotal,
    'currency', v_cart.currency,
    'recovery_discount_code', v_cart.recovery_discount_code,
    'has_out_of_stock', v_has_out_of_stock,
    'has_price_change', v_has_price_change
  );
END;
$$;

-- I. Generate Single-Use Recovery Coupon
CREATE OR REPLACE FUNCTION public.rpc_generate_abandoned_cart_recovery_coupon(
  p_brand_id uuid,
  p_cart_id uuid,
  p_discount_type text DEFAULT 'percentage',
  p_discount_value numeric DEFAULT 10.0,
  p_expiry_hours integer DEFAULT 48
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_cart abandoned_carts%ROWTYPE;
BEGIN
  SELECT * INTO v_cart FROM public.abandoned_carts WHERE id = p_cart_id AND brand_id = p_brand_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Generate unique single-use code
  v_code := 'CART-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

  -- Insert into promo_codes table
  INSERT INTO public.promo_codes (
    brand_id, code, discount_type, discount_value,
    max_redemptions, usage_limit_per_customer,
    end_date, is_active
  ) VALUES (
    p_brand_id, v_code, p_discount_type, p_discount_value,
    1, 1,
    now() + (p_expiry_hours || ' hours')::interval, true
  )
  ON CONFLICT (brand_id, code) DO NOTHING;

  -- Update cart with coupon
  UPDATE public.abandoned_carts
  SET recovery_discount_code = v_code,
      updated_at = now()
  WHERE id = p_cart_id;

  RETURN v_code;
END;
$$;
