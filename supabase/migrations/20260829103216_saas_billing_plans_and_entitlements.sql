-- ==============================================================================
-- BOUTQ OS: SAAS BILLING, VERSIONED PLANS, ENTITLEMENTS & USAGE METERING
-- Migration: 20260829103216_saas_billing_plans_and_entitlements.sql
-- ==============================================================================

-- 1. SAAS PLANS CATALOG
CREATE TABLE IF NOT EXISTS public.saas_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  description_en text,
  description_ar text,
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  trial_days integer NOT NULL DEFAULT 0,
  badge_color text DEFAULT 'bg-primary/10 text-primary',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. SAAS PLAN VERSIONS (Immutable Pricing & Feature Sets for Grandfathering)
CREATE TABLE IF NOT EXISTS public.saas_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.saas_plans(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  currency text NOT NULL DEFAULT 'BHD',
  price_monthly numeric(10,2) NOT NULL DEFAULT 0.00,
  price_annual numeric(10,2) NOT NULL DEFAULT 0.00,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz DEFAULT NULL,
  is_current boolean NOT NULL DEFAULT true,
  change_summary text DEFAULT 'Initial release',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id, version_number)
);

-- 3. GLOBAL ENTITLEMENTS & FEATURES CATALOG
CREATE TABLE IF NOT EXISTS public.saas_features (
  key text PRIMARY KEY,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  category text NOT NULL CHECK (category IN ('catalog_sales', 'operations', 'marketing_loyalty', 'developer_api', 'infrastructure', 'finance', 'storefront')),
  value_type text NOT NULL CHECK (value_type IN ('boolean', 'numeric_limit')),
  unit text,
  description_en text,
  description_ar text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. PLAN VERSION FEATURE ALLOCATIONS
CREATE TABLE IF NOT EXISTS public.saas_plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_version_id uuid NOT NULL REFERENCES public.saas_plan_versions(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.saas_features(key) ON DELETE CASCADE,
  boolean_value boolean DEFAULT NULL,
  numeric_value bigint DEFAULT NULL, -- -1 denotes unlimited, >=0 denotes hard limit
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_version_id, feature_key)
);

-- 5. MODULAR SAAS ADD-ONS
CREATE TABLE IF NOT EXISTS public.saas_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  description_en text,
  description_ar text,
  currency text NOT NULL DEFAULT 'BHD',
  price_monthly numeric(10,2) NOT NULL DEFAULT 0.00,
  price_annual numeric(10,2) NOT NULL DEFAULT 0.00,
  is_active boolean NOT NULL DEFAULT true,
  target_feature_key text NOT NULL REFERENCES public.saas_features(key) ON DELETE RESTRICT,
  grant_type text NOT NULL CHECK (grant_type IN ('boolean_unlock', 'numeric_increment')),
  grant_numeric_amount bigint NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. BRAND ACTIVE SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS public.brand_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid UNIQUE NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.saas_plans(id) ON DELETE RESTRICT,
  plan_version_id uuid NOT NULL REFERENCES public.saas_plan_versions(id) ON DELETE RESTRICT,
  billing_interval text NOT NULL CHECK (billing_interval IN ('monthly', 'annual', 'lifetime', 'trial')),
  status text NOT NULL CHECK (status IN ('active', 'trialing', 'past_due', 'grace_period', 'paused', 'cancelled', 'expired')),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '1 year'),
  trial_ends_at timestamptz DEFAULT NULL,
  grace_period_ends_at timestamptz DEFAULT NULL,
  cancelled_at timestamptz DEFAULT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  paused_at timestamptz DEFAULT NULL,
  renewal_intent text CHECK (renewal_intent IN ('renew', 'cancel', 'upgrade', 'downgrade')),
  renewal_target_plan_id uuid REFERENCES public.saas_plans(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. BRAND ACTIVE ADD-ONS
CREATE TABLE IF NOT EXISTS public.brand_subscription_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.brand_subscriptions(id) ON DELETE CASCADE,
  addon_id uuid NOT NULL REFERENCES public.saas_addons(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, addon_id)
);

-- 8. BRAND CUSTOM ENTITLEMENT OVERRIDES (Super Admin Manual Grants)
CREATE TABLE IF NOT EXISTS public.brand_entitlement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.saas_features(key) ON DELETE CASCADE,
  override_type text NOT NULL CHECK (override_type IN ('set_boolean', 'set_limit', 'increment_limit')),
  boolean_value boolean DEFAULT NULL,
  numeric_value bigint DEFAULT NULL,
  reason text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, feature_key)
);

-- 9. SAAS USAGE SNAPSHOTS (Billing-Period Aggregated Consumption)
CREATE TABLE IF NOT EXISTS public.saas_usage_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  current_usage bigint NOT NULL DEFAULT 0,
  last_consumed_at timestamptz NOT NULL DEFAULT now(),
  warning_80_sent_at timestamptz DEFAULT NULL,
  limit_100_sent_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, metric_key, period_start)
);

-- 10. SAAS USAGE EVENTS (Audit Trail with Idempotency)
CREATE TABLE IF NOT EXISTS public.saas_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  quantity bigint NOT NULL DEFAULT 1,
  idempotency_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- 11. SAAS AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.saas_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==============================================================================
-- INDEXES FOR PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_saas_plan_versions_plan_id ON public.saas_plan_versions(plan_id);
CREATE INDEX IF NOT EXISTS idx_saas_plan_features_version_id ON public.saas_plan_features(plan_version_id);
CREATE INDEX IF NOT EXISTS idx_brand_subscriptions_brand_id ON public.brand_subscriptions(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_subscriptions_status ON public.brand_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_brand_subscription_addons_brand ON public.brand_subscription_addons(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_overrides_brand ON public.brand_entitlement_overrides(brand_id);
CREATE INDEX IF NOT EXISTS idx_usage_snapshots_lookup ON public.saas_usage_snapshots(brand_id, metric_key, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_usage_events_idempotency ON public.saas_usage_events(brand_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_saas_audit_logs_brand ON public.saas_audit_logs(brand_id, created_at DESC);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_subscription_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_audit_logs ENABLE ROW LEVEL SECURITY;

-- Public read for catalog
CREATE POLICY "Public read active plans" ON public.saas_plans FOR SELECT USING (is_active = true OR public.is_super_admin());
CREATE POLICY "Public read plan versions" ON public.saas_plan_versions FOR SELECT USING (true);
CREATE POLICY "Public read features" ON public.saas_features FOR SELECT USING (true);
CREATE POLICY "Public read plan features" ON public.saas_plan_features FOR SELECT USING (true);
CREATE POLICY "Public read active addons" ON public.saas_addons FOR SELECT USING (is_active = true OR public.is_super_admin());

-- Super Admin full access on catalog tables
CREATE POLICY "Super admin manage plans" ON public.saas_plans FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admin manage plan versions" ON public.saas_plan_versions FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admin manage features" ON public.saas_features FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admin manage plan features" ON public.saas_plan_features FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admin manage addons" ON public.saas_addons FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Brand scoped policies
CREATE POLICY "Brand access own subscription" ON public.brand_subscriptions FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id) OR public.is_super_admin());

CREATE POLICY "Super admin manage brand subscriptions" ON public.brand_subscriptions FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Brand access own subscription addons" ON public.brand_subscription_addons FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id) OR public.is_super_admin());

CREATE POLICY "Super admin manage subscription addons" ON public.brand_subscription_addons FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Brand access own overrides" ON public.brand_entitlement_overrides FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id) OR public.is_super_admin());

CREATE POLICY "Super admin manage brand overrides" ON public.brand_entitlement_overrides FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Brand access own usage snapshots" ON public.saas_usage_snapshots FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id) OR public.is_super_admin());

CREATE POLICY "Super admin manage usage snapshots" ON public.saas_usage_snapshots FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Brand access own usage events" ON public.saas_usage_events FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id) OR public.is_super_admin());

CREATE POLICY "Super admin manage audit logs" ON public.saas_audit_logs FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY "Brand view own audit logs" ON public.saas_audit_logs FOR SELECT TO authenticated
  USING (brand_id IS NOT NULL AND (public.can_access_brand(brand_id) OR public.is_super_admin()));

-- Grants
GRANT SELECT ON public.saas_plans, public.saas_plan_versions, public.saas_features, public.saas_plan_features, public.saas_addons TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ==============================================================================
-- STORED PROCEDURES & RPC ENGINE
-- ==============================================================================

-- 1. Evaluates all effective entitlements for a brand
CREATE OR REPLACE FUNCTION public.rpc_evaluate_brand_entitlements(_brand_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_brand record;
  v_result jsonb := '{}'::jsonb;
  v_feat record;
  v_override record;
  v_addon record;
  v_bool boolean;
  v_limit bigint;
  v_is_unlimited boolean;
BEGIN
  -- Check brand existence
  SELECT id, slug, plan_type, subscription_status INTO v_brand
  FROM public.brands
  WHERE id = _brand_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'BRAND_NOT_FOUND');
  END IF;

  -- Platform Owner permanent bypass (pura)
  IF lower(v_brand.slug) = 'pura' OR v_brand.plan_type = 'lifetime' THEN
    -- Return unlimited for all known features
    FOR v_feat IN SELECT key, value_type FROM public.saas_features LOOP
      IF v_feat.value_type = 'boolean' THEN
        v_result := jsonb_set(v_result, ARRAY[v_feat.key], jsonb_build_object(
          'enabled', true,
          'limit_value', -1,
          'is_unlimited', true,
          'source', 'lifetime_founder'
        ));
      ELSE
        v_result := jsonb_set(v_result, ARRAY[v_feat.key], jsonb_build_object(
          'enabled', true,
          'limit_value', -1,
          'is_unlimited', true,
          'source', 'lifetime_founder'
        ));
      END IF;
    END LOOP;
    RETURN v_result;
  END IF;

  -- Fetch active subscription
  SELECT bs.*, pv.id as version_id
  INTO v_sub
  FROM public.brand_subscriptions bs
  JOIN public.saas_plan_versions pv ON pv.id = bs.plan_version_id
  WHERE bs.brand_id = _brand_id;

  -- If no subscription row exists, attempt on-the-fly legacy fallback
  IF NOT FOUND THEN
    PERFORM public.rpc_sync_legacy_brands_to_subscriptions();
    SELECT bs.*, pv.id as version_id
    INTO v_sub
    FROM public.brand_subscriptions bs
    JOIN public.saas_plan_versions pv ON pv.id = bs.plan_version_id
    WHERE bs.brand_id = _brand_id;
  END IF;

  -- Base feature values from Plan Version
  FOR v_feat IN 
    SELECT sf.key, sf.value_type, spf.boolean_value, spf.numeric_value
    FROM public.saas_features sf
    LEFT JOIN public.saas_plan_features spf 
      ON spf.feature_key = sf.key 
      AND spf.plan_version_id = v_sub.plan_version_id
  LOOP
    v_bool := COALESCE(v_feat.boolean_value, false);
    v_limit := COALESCE(v_feat.numeric_value, 0);
    v_is_unlimited := (v_limit = -1);

    -- If feature is numeric limit and limit > 0 or unlimited, mark enabled as true
    IF v_feat.value_type = 'numeric_limit' THEN
      v_bool := (v_limit != 0);
    END IF;

    v_result := jsonb_set(v_result, ARRAY[v_feat.key], jsonb_build_object(
      'enabled', v_bool,
      'limit_value', v_limit,
      'is_unlimited', v_is_unlimited,
      'source', 'plan_version'
    ));
  END LOOP;

  -- Stack Active Add-ons
  FOR v_addon IN
    SELECT sa.target_feature_key, sa.grant_type, sa.grant_numeric_amount, bsa.quantity
    FROM public.brand_subscription_addons bsa
    JOIN public.saas_addons sa ON sa.id = bsa.addon_id
    WHERE bsa.brand_id = _brand_id AND bsa.status = 'active'
  LOOP
    IF v_result ? v_addon.target_feature_key THEN
      IF v_addon.grant_type = 'boolean_unlock' THEN
        v_result := jsonb_set(v_result, ARRAY[v_addon.target_feature_key, 'enabled'], 'true'::jsonb);
        v_result := jsonb_set(v_result, ARRAY[v_addon.target_feature_key, 'source'], '"addon"'::jsonb);
      ELSIF v_addon.grant_type = 'numeric_increment' THEN
        -- If not already unlimited, add increment * quantity
        IF (v_result->v_addon.target_feature_key->>'is_unlimited')::boolean = false THEN
          v_limit := (v_result->v_addon.target_feature_key->>'limit_value')::bigint + (v_addon.grant_numeric_amount * v_addon.quantity);
          v_result := jsonb_set(v_result, ARRAY[v_addon.target_feature_key, 'limit_value'], to_jsonb(v_limit));
          v_result := jsonb_set(v_result, ARRAY[v_addon.target_feature_key, 'enabled'], to_jsonb(v_limit > 0));
          v_result := jsonb_set(v_result, ARRAY[v_addon.target_feature_key, 'source'], '"addon"'::jsonb);
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Apply Brand-Specific Overrides (Highest priority, unless expired)
  FOR v_override IN
    SELECT feature_key, override_type, boolean_value, numeric_value
    FROM public.brand_entitlement_overrides
    WHERE brand_id = _brand_id 
      AND (expires_at IS NULL OR expires_at > now())
  LOOP
    IF v_result ? v_override.feature_key THEN
      IF v_override.override_type = 'set_boolean' THEN
        v_result := jsonb_set(v_result, ARRAY[v_override.feature_key, 'enabled'], to_jsonb(COALESCE(v_override.boolean_value, false)));
        v_result := jsonb_set(v_result, ARRAY[v_override.feature_key, 'source'], '"override"'::jsonb);
      ELSIF v_override.override_type = 'set_limit' THEN
        v_limit := COALESCE(v_override.numeric_value, 0);
        v_is_unlimited := (v_limit = -1);
        v_result := jsonb_set(v_result, ARRAY[v_override.feature_key, 'limit_value'], to_jsonb(v_limit));
        v_result := jsonb_set(v_result, ARRAY[v_override.feature_key, 'is_unlimited'], to_jsonb(v_is_unlimited));
        v_result := jsonb_set(v_result, ARRAY[v_override.feature_key, 'enabled'], to_jsonb(v_limit != 0));
        v_result := jsonb_set(v_result, ARRAY[v_override.feature_key, 'source'], '"override"'::jsonb);
      ELSIF v_override.override_type = 'increment_limit' THEN
        IF (v_result->v_override.feature_key->>'is_unlimited')::boolean = false THEN
          v_limit := (v_result->v_override.feature_key->>'limit_value')::bigint + COALESCE(v_override.numeric_value, 0);
          v_result := jsonb_set(v_result, ARRAY[v_override.feature_key, 'limit_value'], to_jsonb(v_limit));
          v_result := jsonb_set(v_result, ARRAY[v_override.feature_key, 'enabled'], to_jsonb(v_limit > 0));
          v_result := jsonb_set(v_result, ARRAY[v_override.feature_key, 'source'], '"override"'::jsonb);
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

-- 2. Check entitlement helper
CREATE OR REPLACE FUNCTION public.rpc_check_entitlement(
  _brand_id uuid,
  _feature_key text,
  _requested_amount bigint DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entitlements jsonb;
  v_item jsonb;
  v_enabled boolean;
  v_limit bigint;
  v_is_unlimited boolean;
BEGIN
  v_entitlements := public.rpc_evaluate_brand_entitlements(_brand_id);
  
  IF v_entitlements ? 'error' THEN
    RETURN jsonb_build_object('allowed', false, 'error', v_entitlements->>'error');
  END IF;

  v_item := v_entitlements-> _feature_key;
  IF v_item IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'error', 'FEATURE_NOT_DEFINED');
  END IF;

  v_enabled := (v_item->>'enabled')::boolean;
  v_limit := (v_item->>'limit_value')::bigint;
  v_is_unlimited := (v_item->>'is_unlimited')::boolean;

  IF NOT v_enabled THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'feature_disabled',
      'feature_key', _feature_key,
      'limit_value', v_limit
    );
  END IF;

  IF v_is_unlimited THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'is_unlimited', true,
      'feature_key', _feature_key,
      'limit_value', -1
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'is_unlimited', false,
    'feature_key', _feature_key,
    'limit_value', v_limit
  );
END;
$$;

-- 3. Consume Usage Meter atomically with race-condition prevention & threshold triggers
CREATE OR REPLACE FUNCTION public.rpc_consume_usage(
  _brand_id uuid,
  _metric_key text,
  _quantity bigint DEFAULT 1,
  _idempotency_key text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_p_start timestamptz;
  v_p_end timestamptz;
  v_snapshot record;
  v_new_usage bigint;
  v_entitlement jsonb;
  v_limit bigint;
  v_is_unlimited boolean;
  v_warning_triggered text := NULL;
BEGIN
  -- Idempotency check
  IF _idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.saas_usage_events 
      WHERE brand_id = _brand_id AND idempotency_key = _idempotency_key
    ) THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', true,
        'metric_key', _metric_key
      );
    END IF;
  END IF;

  -- Determine active billing period
  SELECT current_period_start, current_period_end 
  INTO v_sub
  FROM public.brand_subscriptions 
  WHERE brand_id = _brand_id;

  IF FOUND THEN
    v_p_start := v_sub.current_period_start;
    v_p_end := v_sub.current_period_end;
  ELSE
    v_p_start := date_trunc('month', now());
    v_p_end := v_p_start + interval '1 month';
  END IF;

  -- Upsert snapshot atomically
  INSERT INTO public.saas_usage_snapshots (brand_id, metric_key, period_start, period_end, current_usage, last_consumed_at)
  VALUES (_brand_id, _metric_key, v_p_start, v_p_end, _quantity, now())
  ON CONFLICT (brand_id, metric_key, period_start)
  DO UPDATE SET
    current_usage = saas_usage_snapshots.current_usage + _quantity,
    last_consumed_at = now(),
    updated_at = now()
  RETURNING * INTO v_snapshot;

  v_new_usage := v_snapshot.current_usage;

  -- Record event
  INSERT INTO public.saas_usage_events (brand_id, metric_key, quantity, idempotency_key, metadata)
  VALUES (_brand_id, _metric_key, _quantity, _idempotency_key, _metadata);

  -- Evaluate threshold against matching limit key if any
  -- Metric keys map to entitlement keys (e.g. 'orders' -> 'orders.monthly_limit', 'api_requests' -> 'api.monthly_requests')
  DECLARE
    v_ent_key text := _metric_key;
  BEGIN
    IF _metric_key = 'orders' THEN v_ent_key := 'orders.monthly_limit';
    ELSIF _metric_key = 'api_requests' THEN v_ent_key := 'api.monthly_requests';
    ELSIF _metric_key = 'abandoned_cart_messages' THEN v_ent_key := 'abandoned_carts.monthly_messages';
    ELSIF _metric_key = 'returns' THEN v_ent_key := 'returns.monthly_limit';
    END IF;

    v_entitlement := public.rpc_check_entitlement(_brand_id, v_ent_key);
    v_limit := (v_entitlement->>'limit_value')::bigint;
    v_is_unlimited := (v_entitlement->>'is_unlimited')::boolean;

    IF NOT v_is_unlimited AND v_limit > 0 THEN
      IF v_new_usage >= v_limit AND v_snapshot.limit_100_sent_at IS NULL THEN
        UPDATE public.saas_usage_snapshots
        SET limit_100_sent_at = now()
        WHERE id = v_snapshot.id;
        v_warning_triggered := 'limit_100_reached';
      ELSIF v_new_usage >= (v_limit * 0.8) AND v_snapshot.warning_80_sent_at IS NULL THEN
        UPDATE public.saas_usage_snapshots
        SET warning_80_sent_at = now()
        WHERE id = v_snapshot.id;
        v_warning_triggered := 'warning_80_reached';
      END IF;
    END IF;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'current_usage', v_new_usage,
    'metric_key', _metric_key,
    'warning_triggered', v_warning_triggered
  );
END;
$$;

-- 4. Sync legacy brands without altering any contracted terms
CREATE OR REPLACE FUNCTION public.rpc_sync_legacy_brands_to_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b record;
  v_plan_id uuid;
  v_ver_id uuid;
  v_interval text;
  v_status text;
  v_synced_count integer := 0;
BEGIN
  FOR v_b IN 
    SELECT id, slug, plan_type, subscription_tier, subscription_status, subscription_expires_at, trial_ends_at, created_at
    FROM public.brands
  LOOP
    -- If already subscribed, skip
    IF EXISTS (SELECT 1 FROM public.brand_subscriptions WHERE brand_id = v_b.id) THEN
      CONTINUE;
    END IF;

    -- Determine mapped plan code
    IF lower(v_b.slug) = 'pura' OR v_b.plan_type = 'lifetime' THEN
      SELECT p.id, pv.id INTO v_plan_id, v_ver_id
      FROM public.saas_plans p
      JOIN public.saas_plan_versions pv ON pv.plan_id = p.id AND pv.is_current = true
      WHERE p.code = 'lifetime_founder'
      LIMIT 1;
      v_interval := 'lifetime';
      v_status := 'active';
    ELSIF v_b.plan_type = 'trial' THEN
      SELECT p.id, pv.id INTO v_plan_id, v_ver_id
      FROM public.saas_plans p
      JOIN public.saas_plan_versions pv ON pv.plan_id = p.id AND pv.is_current = true
      WHERE p.code = 'trial'
      LIMIT 1;
      v_interval := 'trial';
      v_status := COALESCE(v_b.subscription_status, 'trialing');
    ELSE
      -- Map by tier or default to growth/starter
      DECLARE
        v_target_code text := 'growth';
      BEGIN
        IF v_b.subscription_tier = 'enterprise' THEN v_target_code := 'enterprise';
        ELSIF v_b.subscription_tier = 'basic' THEN v_target_code := 'starter';
        ELSIF v_b.subscription_tier = 'growth' THEN v_target_code := 'growth';
        ELSE v_target_code := 'growth';
        END IF;

        SELECT p.id, pv.id INTO v_plan_id, v_ver_id
        FROM public.saas_plans p
        JOIN public.saas_plan_versions pv ON pv.plan_id = p.id AND pv.is_current = true
        WHERE p.code = v_target_code
        LIMIT 1;
        v_interval := 'annual';
        v_status := COALESCE(v_b.subscription_status, 'active');
      END;
    END IF;

    IF v_plan_id IS NOT NULL AND v_ver_id IS NOT NULL THEN
      INSERT INTO public.brand_subscriptions (
        brand_id,
        plan_id,
        plan_version_id,
        billing_interval,
        status,
        current_period_start,
        current_period_end,
        trial_ends_at
      ) VALUES (
        v_b.id,
        v_plan_id,
        v_ver_id,
        v_interval,
        v_status,
        COALESCE(v_b.created_at, now()),
        COALESCE(v_b.subscription_expires_at, now() + interval '1 year'),
        v_b.trial_ends_at
      ) ON CONFLICT (brand_id) DO NOTHING;

      v_synced_count := v_synced_count + 1;
    END IF;
  END LOOP;

  RETURN v_synced_count;
END;
$$;

-- ==============================================================================
-- SEED DATA: FEATURES CATALOG, PLANS, VERSIONS & ALLOCATIONS
-- ==============================================================================

-- 1. Features Catalog
INSERT INTO public.saas_features (key, name_en, name_ar, category, value_type, unit, description_en, description_ar, sort_order) VALUES
('products.limit', 'Products Limit', 'الحد الأقصى للمنتجات', 'catalog_sales', 'numeric_limit', 'products', 'Maximum active products allowed in catalog', 'الحد الأقصى للمنتجات المسموح بإنشائها', 10),
('orders.monthly_limit', 'Monthly Orders Limit', 'الحد الشهري للطلبات', 'operations', 'numeric_limit', 'orders', 'Maximum processed orders per billing period', 'الحد الأقصى للطلبات المكتملة شهرياً', 20),
('team.members_limit', 'Team Members Limit', 'حد أعضاء الفريق', 'operations', 'numeric_limit', 'members', 'Maximum staff and admin accounts', 'الحد الأقصى لحسابات الموظفين والإداريين', 30),
('storage.bytes_limit', 'Storage Limit (GB)', 'سعة التخزين (جيجابايت)', 'infrastructure', 'numeric_limit', 'GB', 'Storage limit for media and receipts', 'المساحة السحابية المخصصة للمتجر بالجيجابايت', 40),
('returns.enabled', 'Returns & Exchanges Module', 'نظام المرتجعات والاستبدال', 'operations', 'boolean', NULL, 'Enable customer return portal and admin workflow', 'تفعيل بوابة طلبات الإرجاع والاستبدال', 50),
('returns.monthly_limit', 'Monthly Returns Quota', 'الحد الشهري لطلبات الإرجاع', 'operations', 'numeric_limit', 'requests', 'Maximum return requests processed per month', 'الحد الأقصى لطلبات الإرجاع شهرياً', 60),
('loyalty.enabled', 'Loyalty & Rewards Program', 'برنامج الولاء والمكافآت', 'marketing_loyalty', 'boolean', NULL, 'Customer points earning, ledger, and checkout redemptions', 'تفعيل نقاط المكافآت واستبدالها عند الدفع', 70),
('abandoned_carts.enabled', 'Abandoned Carts Recovery', 'استعادة السلات المتروكة', 'marketing_loyalty', 'boolean', NULL, 'Automated abandoned checkout capture and recovery campaigns', 'تتبع السلات المتروكة وحملات التذكير', 80),
('abandoned_carts.monthly_messages', 'Monthly Abandoned Cart Messages', 'رسائل السلات المتروكة شهرياً', 'marketing_loyalty', 'numeric_limit', 'messages', 'Quota for recovery emails and WhatsApp messages', 'عدد رسائل التذكير المسموح بإرسالها شهرياً', 90),
('api.enabled', 'Public REST API Access', 'منصة API العامة', 'developer_api', 'boolean', NULL, 'Access to /api/v1 endpoints for custom apps and integrations', 'إمكانية استخدام واجهات برمجة التطبيقات العامة', 100),
('api.keys_limit', 'Active API Keys Limit', 'الحد الأقصى لمفاتيح API', 'developer_api', 'numeric_limit', 'keys', 'Number of scoped live and test API keys', 'الحد الأقصى لمفاتيح الربط المشفرة', 110),
('api.monthly_requests', 'Monthly API Requests Quota', 'الحد الشهري لطلبات API', 'developer_api', 'numeric_limit', 'requests', 'Maximum HTTP requests allowed per month', 'الحد الشهري لطلبات الـ API المسموح بها', 120),
('webhooks.enabled', 'Webhooks Engine', 'نظام الويب هوكس', 'developer_api', 'boolean', NULL, 'HMAC-signed outbound event webhooks', 'إرسال الويب هوكس الموقعة للأحداث الحية', 130),
('webhooks.endpoints_limit', 'Webhook Endpoints Limit', 'حد روابط الويب هوك', 'developer_api', 'numeric_limit', 'endpoints', 'Maximum destination webhook URLs', 'الحد الأقصى لروابط استلام الأحداث', 140),
('custom_domain.enabled', 'Custom Domain Mapping', 'ربط النطاق المخصص', 'storefront', 'boolean', NULL, 'Connect proprietary domain (e.g., brand.com)', 'ربط دومين خاص بالمتجر', 150),
('white_label.enabled', 'White-Label Branding', 'العلامة البيضاء وحذف شعار المنصة', 'storefront', 'boolean', NULL, 'Remove Boutq branding and power signature', 'إزالة شعار المنصة وتخصيص هوية كاملة للمتجر', 160),
('mobile_factory.enabled', 'Mobile App Factory', 'مصنع تطبيقات الجوال (iOS & Android)', 'storefront', 'boolean', NULL, 'Native mobile applications build and app store publishing', 'بناء وتوليد تطبيقات آبل وأندرويد الخاصة بالمتجر', 170),
('accounting.enabled', 'Double-Entry Accounting & COGS', 'المحاسبة المالية وتكاليف المنتجات', 'finance', 'boolean', NULL, 'Journal entries, balance sheets, vendors and BOM COGS', 'نظام المحاسبة المالية المزدوجة وتكلفة المنتجات', 180),
('incubators.enabled', 'Incubators & Consignment Module', 'إدارة الحاضنات ومنافذ البيع المشتركة', 'operations', 'boolean', NULL, 'Multi-vendor incubator spaces, stock transfers and sales', 'إدارة مساحات الحاضنات ومبيعات الأفرع المشتركة', 190),
('import_center.enabled', 'Import Center & Bulk CSV Engine', 'مركز الاستيراد السريع', 'operations', 'boolean', NULL, 'Bulk import products, variants and inventory via Excel/CSV', 'استيراد المنتجات والمخزون بالجملة عبر ملفات إكسل', 200)
ON CONFLICT (key) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  category = EXCLUDED.category,
  value_type = EXCLUDED.value_type,
  unit = EXCLUDED.unit,
  description_en = EXCLUDED.description_en,
  description_ar = EXCLUDED.description_ar,
  sort_order = EXCLUDED.sort_order;

-- 2. Master Plans
INSERT INTO public.saas_plans (code, name_en, name_ar, description_en, description_ar, is_active, is_public, sort_order, trial_days, badge_color) VALUES
('starter', 'Starter Plan', 'باقة البداية', 'Essential tools for emerging boutiques and single creators', 'الأدوات الأساسية للمتاجر الناشئة والمبدعين', true, true, 10, 0, 'bg-blue-500/10 text-blue-700 dark:text-blue-300'),
('growth', 'Growth Plan', 'باقة النمو', 'Everything growing brands need to scale operations and sales', 'كل ما تحتاجه العلامات التجارية الصاعدة لتوسيع أعمالها ومبيعاتها', true, true, 20, 0, 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'),
('pro', 'Pro Plan', 'الباقة الاحترافية', 'High-volume powerhouse with API, webhooks, and advanced loyalty', 'القوة التشغيلية العالية مع منصة API وبرنامج ولاء متقدم', true, true, 30, 0, 'bg-purple-500/10 text-purple-700 dark:text-purple-300'),
('enterprise', 'Enterprise Plan', 'باقة الشركات', 'Custom limits, dedicated infrastructure, and mobile app factory', 'حدود غير محدودة، بنية تحتية مخصصة، ومصنع تطبيقات الجوال', true, true, 40, 0, 'bg-amber-500/10 text-amber-700 dark:text-amber-300'),
('trial', 'Free Trial', 'الفترة التجريبية', '14 days full exploration of Boutq OS core platform', '14 يوماً لتجربة منصة Boutq OS بالكامل', true, false, 50, 14, 'bg-slate-500/10 text-slate-700 dark:text-slate-300'),
('lifetime_founder', 'Lifetime Founder', 'باقة المؤسس الدائم', 'Permanent unlimited license for platform owner stores (e.g., Pura)', 'ترخيص دائم غير محدود لمتجر مالك المنصة', true, false, 60, 0, 'bg-rose-500/10 text-rose-700 dark:text-rose-300')
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  description_en = EXCLUDED.description_en,
  description_ar = EXCLUDED.description_ar,
  sort_order = EXCLUDED.sort_order,
  trial_days = EXCLUDED.trial_days;

-- 3. Plan Versions (Version 1 for each)
DO $$
DECLARE
  v_p_starter uuid;
  v_p_growth uuid;
  v_p_pro uuid;
  v_p_enterprise uuid;
  v_p_trial uuid;
  v_p_founder uuid;
  v_v_starter uuid;
  v_v_growth uuid;
  v_v_pro uuid;
  v_v_enterprise uuid;
  v_v_trial uuid;
  v_v_founder uuid;
BEGIN
  SELECT id INTO v_p_starter FROM public.saas_plans WHERE code = 'starter';
  SELECT id INTO v_p_growth FROM public.saas_plans WHERE code = 'growth';
  SELECT id INTO v_p_pro FROM public.saas_plans WHERE code = 'pro';
  SELECT id INTO v_p_enterprise FROM public.saas_plans WHERE code = 'enterprise';
  SELECT id INTO v_p_trial FROM public.saas_plans WHERE code = 'trial';
  SELECT id INTO v_p_founder FROM public.saas_plans WHERE code = 'lifetime_founder';

  -- Starter Version 1 (15 BHD/mo, 144 BHD/yr)
  INSERT INTO public.saas_plan_versions (plan_id, version_number, currency, price_monthly, price_annual, is_current, change_summary)
  VALUES (v_p_starter, 1, 'BHD', 15.00, 144.00, true, 'Initial V1 release')
  ON CONFLICT (plan_id, version_number) DO UPDATE SET price_monthly = EXCLUDED.price_monthly, price_annual = EXCLUDED.price_annual
  RETURNING id INTO v_v_starter;

  -- Growth Version 1 (35 BHD/mo, 336 BHD/yr)
  INSERT INTO public.saas_plan_versions (plan_id, version_number, currency, price_monthly, price_annual, is_current, change_summary)
  VALUES (v_p_growth, 1, 'BHD', 35.00, 336.00, true, 'Initial V1 release')
  ON CONFLICT (plan_id, version_number) DO UPDATE SET price_monthly = EXCLUDED.price_monthly, price_annual = EXCLUDED.price_annual
  RETURNING id INTO v_v_growth;

  -- Pro Version 1 (65 BHD/mo, 588 BHD/yr)
  INSERT INTO public.saas_plan_versions (plan_id, version_number, currency, price_monthly, price_annual, is_current, change_summary)
  VALUES (v_p_pro, 1, 'BHD', 65.00, 588.00, true, 'Initial V1 release')
  ON CONFLICT (plan_id, version_number) DO UPDATE SET price_monthly = EXCLUDED.price_monthly, price_annual = EXCLUDED.price_annual
  RETURNING id INTO v_v_pro;

  -- Enterprise Version 1 (150 BHD/mo, 1440 BHD/yr)
  INSERT INTO public.saas_plan_versions (plan_id, version_number, currency, price_monthly, price_annual, is_current, change_summary)
  VALUES (v_p_enterprise, 1, 'BHD', 150.00, 1440.00, true, 'Initial V1 release')
  ON CONFLICT (plan_id, version_number) DO UPDATE SET price_monthly = EXCLUDED.price_monthly, price_annual = EXCLUDED.price_annual
  RETURNING id INTO v_v_enterprise;

  -- Trial Version 1 (0 BHD)
  INSERT INTO public.saas_plan_versions (plan_id, version_number, currency, price_monthly, price_annual, is_current, change_summary)
  VALUES (v_p_trial, 1, 'BHD', 0.00, 0.00, true, 'Initial Trial V1')
  ON CONFLICT (plan_id, version_number) DO UPDATE SET price_monthly = 0, price_annual = 0
  RETURNING id INTO v_v_trial;

  -- Founder Lifetime Version 1 (0 BHD)
  INSERT INTO public.saas_plan_versions (plan_id, version_number, currency, price_monthly, price_annual, is_current, change_summary)
  VALUES (v_p_founder, 1, 'BHD', 0.00, 0.00, true, 'Initial Lifetime V1')
  ON CONFLICT (plan_id, version_number) DO UPDATE SET price_monthly = 0, price_annual = 0
  RETURNING id INTO v_v_founder;

  -- 4. Allocations for Starter V1
  INSERT INTO public.saas_plan_features (plan_version_id, feature_key, boolean_value, numeric_value) VALUES
  (v_v_starter, 'products.limit', true, 50),
  (v_v_starter, 'orders.monthly_limit', true, 100),
  (v_v_starter, 'team.members_limit', true, 2),
  (v_v_starter, 'storage.bytes_limit', true, 2), -- 2 GB
  (v_v_starter, 'returns.enabled', true, NULL),
  (v_v_starter, 'returns.monthly_limit', true, 15),
  (v_v_starter, 'loyalty.enabled', false, NULL),
  (v_v_starter, 'abandoned_carts.enabled', false, NULL),
  (v_v_starter, 'abandoned_carts.monthly_messages', false, 0),
  (v_v_starter, 'api.enabled', false, NULL),
  (v_v_starter, 'api.keys_limit', false, 0),
  (v_v_starter, 'api.monthly_requests', false, 0),
  (v_v_starter, 'webhooks.enabled', false, NULL),
  (v_v_starter, 'webhooks.endpoints_limit', false, 0),
  (v_v_starter, 'custom_domain.enabled', false, NULL),
  (v_v_starter, 'white_label.enabled', false, NULL),
  (v_v_starter, 'mobile_factory.enabled', false, NULL),
  (v_v_starter, 'accounting.enabled', true, NULL),
  (v_v_starter, 'incubators.enabled', false, NULL),
  (v_v_starter, 'import_center.enabled', false, NULL)
  ON CONFLICT (plan_version_id, feature_key) DO UPDATE SET boolean_value = EXCLUDED.boolean_value, numeric_value = EXCLUDED.numeric_value;

  -- Allocations for Growth V1
  INSERT INTO public.saas_plan_features (plan_version_id, feature_key, boolean_value, numeric_value) VALUES
  (v_v_growth, 'products.limit', true, 300),
  (v_v_growth, 'orders.monthly_limit', true, 1000),
  (v_v_growth, 'team.members_limit', true, 5),
  (v_v_growth, 'storage.bytes_limit', true, 10), -- 10 GB
  (v_v_growth, 'returns.enabled', true, NULL),
  (v_v_growth, 'returns.monthly_limit', true, 100),
  (v_v_growth, 'loyalty.enabled', true, NULL),
  (v_v_growth, 'abandoned_carts.enabled', true, NULL),
  (v_v_growth, 'abandoned_carts.monthly_messages', true, 300),
  (v_v_growth, 'api.enabled', true, NULL),
  (v_v_growth, 'api.keys_limit', true, 2),
  (v_v_growth, 'api.monthly_requests', true, 10000),
  (v_v_growth, 'webhooks.enabled', true, NULL),
  (v_v_growth, 'webhooks.endpoints_limit', true, 5),
  (v_v_growth, 'custom_domain.enabled', true, NULL),
  (v_v_growth, 'white_label.enabled', false, NULL),
  (v_v_growth, 'mobile_factory.enabled', false, NULL),
  (v_v_growth, 'accounting.enabled', true, NULL),
  (v_v_growth, 'incubators.enabled', true, NULL),
  (v_v_growth, 'import_center.enabled', true, NULL)
  ON CONFLICT (plan_version_id, feature_key) DO UPDATE SET boolean_value = EXCLUDED.boolean_value, numeric_value = EXCLUDED.numeric_value;

  -- Allocations for Pro V1
  INSERT INTO public.saas_plan_features (plan_version_id, feature_key, boolean_value, numeric_value) VALUES
  (v_v_pro, 'products.limit', true, 1500),
  (v_v_pro, 'orders.monthly_limit', true, 5000),
  (v_v_pro, 'team.members_limit', true, 15),
  (v_v_pro, 'storage.bytes_limit', true, 50), -- 50 GB
  (v_v_pro, 'returns.enabled', true, NULL),
  (v_v_pro, 'returns.monthly_limit', true, -1), -- Unlimited
  (v_v_pro, 'loyalty.enabled', true, NULL),
  (v_v_pro, 'abandoned_carts.enabled', true, NULL),
  (v_v_pro, 'abandoned_carts.monthly_messages', true, 2000),
  (v_v_pro, 'api.enabled', true, NULL),
  (v_v_pro, 'api.keys_limit', true, 10),
  (v_v_pro, 'api.monthly_requests', true, 100000),
  (v_v_pro, 'webhooks.enabled', true, NULL),
  (v_v_pro, 'webhooks.endpoints_limit', true, 25),
  (v_v_pro, 'custom_domain.enabled', true, NULL),
  (v_v_pro, 'white_label.enabled', false, NULL),
  (v_v_pro, 'mobile_factory.enabled', false, NULL),
  (v_v_pro, 'accounting.enabled', true, NULL),
  (v_v_pro, 'incubators.enabled', true, NULL),
  (v_v_pro, 'import_center.enabled', true, NULL)
  ON CONFLICT (plan_version_id, feature_key) DO UPDATE SET boolean_value = EXCLUDED.boolean_value, numeric_value = EXCLUDED.numeric_value;

  -- Allocations for Enterprise V1
  INSERT INTO public.saas_plan_features (plan_version_id, feature_key, boolean_value, numeric_value) VALUES
  (v_v_enterprise, 'products.limit', true, -1),
  (v_v_enterprise, 'orders.monthly_limit', true, -1),
  (v_v_enterprise, 'team.members_limit', true, -1),
  (v_v_enterprise, 'storage.bytes_limit', true, 500), -- 500 GB
  (v_v_enterprise, 'returns.enabled', true, NULL),
  (v_v_enterprise, 'returns.monthly_limit', true, -1),
  (v_v_enterprise, 'loyalty.enabled', true, NULL),
  (v_v_enterprise, 'abandoned_carts.enabled', true, NULL),
  (v_v_enterprise, 'abandoned_carts.monthly_messages', true, -1),
  (v_v_enterprise, 'api.enabled', true, NULL),
  (v_v_enterprise, 'api.keys_limit', true, -1),
  (v_v_enterprise, 'api.monthly_requests', true, -1),
  (v_v_enterprise, 'webhooks.enabled', true, NULL),
  (v_v_enterprise, 'webhooks.endpoints_limit', true, -1),
  (v_v_enterprise, 'custom_domain.enabled', true, NULL),
  (v_v_enterprise, 'white_label.enabled', true, NULL),
  (v_v_enterprise, 'mobile_factory.enabled', true, NULL),
  (v_v_enterprise, 'accounting.enabled', true, NULL),
  (v_v_enterprise, 'incubators.enabled', true, NULL),
  (v_v_enterprise, 'import_center.enabled', true, NULL)
  ON CONFLICT (plan_version_id, feature_key) DO UPDATE SET boolean_value = EXCLUDED.boolean_value, numeric_value = EXCLUDED.numeric_value;

  -- Allocations for Trial V1 (14 days exploration)
  INSERT INTO public.saas_plan_features (plan_version_id, feature_key, boolean_value, numeric_value) VALUES
  (v_v_trial, 'products.limit', true, 25),
  (v_v_trial, 'orders.monthly_limit', true, 50),
  (v_v_trial, 'team.members_limit', true, 2),
  (v_v_trial, 'storage.bytes_limit', true, 1), -- 1 GB
  (v_v_trial, 'returns.enabled', true, NULL),
  (v_v_trial, 'returns.monthly_limit', true, 10),
  (v_v_trial, 'loyalty.enabled', true, NULL),
  (v_v_trial, 'abandoned_carts.enabled', true, NULL),
  (v_v_trial, 'abandoned_carts.monthly_messages', true, 50),
  (v_v_trial, 'api.enabled', true, NULL),
  (v_v_trial, 'api.keys_limit', true, 1),
  (v_v_trial, 'api.monthly_requests', true, 2500),
  (v_v_trial, 'webhooks.enabled', true, NULL),
  (v_v_trial, 'webhooks.endpoints_limit', true, 2),
  (v_v_trial, 'custom_domain.enabled', false, NULL),
  (v_v_trial, 'white_label.enabled', false, NULL),
  (v_v_trial, 'mobile_factory.enabled', false, NULL),
  (v_v_trial, 'accounting.enabled', true, NULL),
  (v_v_trial, 'incubators.enabled', true, NULL),
  (v_v_trial, 'import_center.enabled', true, NULL)
  ON CONFLICT (plan_version_id, feature_key) DO UPDATE SET boolean_value = EXCLUDED.boolean_value, numeric_value = EXCLUDED.numeric_value;

  -- Allocations for Lifetime Founder (Unlimited across all)
  INSERT INTO public.saas_plan_features (plan_version_id, feature_key, boolean_value, numeric_value) VALUES
  (v_v_founder, 'products.limit', true, -1),
  (v_v_founder, 'orders.monthly_limit', true, -1),
  (v_v_founder, 'team.members_limit', true, -1),
  (v_v_founder, 'storage.bytes_limit', true, -1),
  (v_v_founder, 'returns.enabled', true, NULL),
  (v_v_founder, 'returns.monthly_limit', true, -1),
  (v_v_founder, 'loyalty.enabled', true, NULL),
  (v_v_founder, 'abandoned_carts.enabled', true, NULL),
  (v_v_founder, 'abandoned_carts.monthly_messages', true, -1),
  (v_v_founder, 'api.enabled', true, NULL),
  (v_v_founder, 'api.keys_limit', true, -1),
  (v_v_founder, 'api.monthly_requests', true, -1),
  (v_v_founder, 'webhooks.enabled', true, NULL),
  (v_v_founder, 'webhooks.endpoints_limit', true, -1),
  (v_v_founder, 'custom_domain.enabled', true, NULL),
  (v_v_founder, 'white_label.enabled', true, NULL),
  (v_v_founder, 'mobile_factory.enabled', true, NULL),
  (v_v_founder, 'accounting.enabled', true, NULL),
  (v_v_founder, 'incubators.enabled', true, NULL),
  (v_v_founder, 'import_center.enabled', true, NULL)
  ON CONFLICT (plan_version_id, feature_key) DO UPDATE SET boolean_value = EXCLUDED.boolean_value, numeric_value = EXCLUDED.numeric_value;
END $$;

-- 5. Modular Add-ons Catalog
INSERT INTO public.saas_addons (code, name_en, name_ar, description_en, description_ar, currency, price_monthly, price_annual, is_active, target_feature_key, grant_type, grant_numeric_amount, sort_order) VALUES
('addon_extra_products_500', 'Extra 500 Products', 'إضافة 500 منتج', 'Increases active product catalog capacity by 500 products', 'زيادة سعة كتالوج المنتجات بـ 500 منتج إضافي', 'BHD', 10.00, 96.00, true, 'products.limit', 'numeric_increment', 500, 10),
('addon_extra_orders_1000', 'Extra 1,000 Monthly Orders', 'إضافة 1,000 طلب شهرياً', 'Expands monthly order processing allowance by 1,000 orders', 'زيادة حد الطلبات الشهرية بـ 1,000 طلب إضافي', 'BHD', 15.00, 144.00, true, 'orders.monthly_limit', 'numeric_increment', 1000, 20),
('addon_extra_storage_50gb', 'Extra 50 GB Storage', 'مساحة تخزين إضافية 50 جيجابايت', 'Adds 50 GB high-performance cloud object storage', 'مساحة تخزين سحابية إضافية 50 جيجابايت للصور والملفات', 'BHD', 8.00, 75.00, true, 'storage.bytes_limit', 'numeric_increment', 50, 30),
('addon_abandoned_carts_1000', 'Extra 1,000 Recovery Messages', '1,000 رسالة استعادة سلات إضافية', 'Additional 1,000 SMS/WhatsApp/Email abandoned cart recovery alerts', '1,000 رسالة تذكير واستعادة سلات متروكة إضافية', 'BHD', 12.00, 110.00, true, 'abandoned_carts.monthly_messages', 'numeric_increment', 1000, 40),
('addon_white_label_app', 'Mobile App Factory & Store Deploy', 'مصنع وتطبيقات الجوال الرسمية', 'Native iOS & Android mobile application builds and app store submission', 'توليد ونشر تطبيقات المتجر الأصلية على متجري آبل وجوجل', 'BHD', 30.00, 280.00, true, 'mobile_factory.enabled', 'boolean_unlock', 0, 50),
('addon_extra_api_keys_5', 'Extra 5 API Keys & 50k Requests', '5 مفاتيح API و 50 ألف طلب', 'Adds 5 scoped API keys and 50,000 monthly API calls', 'إضافة 5 مفاتيح ربط و 50,000 طلب API شهرياً', 'BHD', 10.00, 95.00, true, 'api.monthly_requests', 'numeric_increment', 50000, 60),
('addon_extra_staff_5', 'Extra 5 Staff Accounts', '5 حسابات موظفين إضافية', 'Add 5 additional staff/admin team members', 'إضافة 5 حسابات إضافية للموظفين والإداريين', 'BHD', 8.00, 75.00, true, 'team.members_limit', 'numeric_increment', 5, 70)
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  price_monthly = EXCLUDED.price_monthly,
  price_annual = EXCLUDED.price_annual,
  grant_numeric_amount = EXCLUDED.grant_numeric_amount;

-- 6. Execute Initial Synchronization of all existing legacy brands
SELECT public.rpc_sync_legacy_brands_to_subscriptions();

NOTIFY pgrst, 'reload schema';
