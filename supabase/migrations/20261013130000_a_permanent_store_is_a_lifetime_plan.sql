-- A permanent store is one whose plan is "lifetime", not one with a certain name.
--
-- Two functions gave a store everything, for ever, when its plan was "lifetime" OR when its
-- address was one particular store's. That store's plan is "lifetime" (checked on the live data
-- before writing this), so the name was a second way to say the same thing, and one that would
-- have kept the store unlimited if its plan were ever changed on purpose.
--
-- The two functions below are the live ones with that name taken out and nothing else changed.
-- No store's plan or limits change.

CREATE OR REPLACE FUNCTION public.rpc_evaluate_brand_entitlements_unchecked(_brand_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  SELECT id, slug, plan_type, subscription_status INTO v_brand
  FROM public.brands
  WHERE id = _brand_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'BRAND_NOT_FOUND');
  END IF;

  IF v_brand.plan_type = 'lifetime' THEN
    FOR v_feat IN SELECT key, value_type FROM public.saas_features LOOP
      v_result := jsonb_set(v_result, ARRAY[v_feat.key], jsonb_build_object(
        'enabled', true,
        'limit_value', -1,
        'is_unlimited', true,
        'source', 'lifetime_founder'
      ));
    END LOOP;
    RETURN v_result;
  END IF;

  SELECT bs.*, pv.id as version_id
  INTO v_sub
  FROM public.brand_subscriptions bs
  JOIN public.saas_plan_versions pv ON pv.id = bs.plan_version_id
  WHERE bs.brand_id = _brand_id;

  IF NOT FOUND THEN
    PERFORM public.rpc_sync_legacy_brands_to_subscriptions();
    SELECT bs.*, pv.id as version_id
    INTO v_sub
    FROM public.brand_subscriptions bs
    JOIN public.saas_plan_versions pv ON pv.id = bs.plan_version_id
    WHERE bs.brand_id = _brand_id;
  END IF;

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
        IF (v_result->v_addon.target_feature_key->>'is_unlimited')::boolean = false THEN
          v_limit := (v_result->v_addon.target_feature_key->>'limit_value')::bigint + (v_addon.grant_numeric_amount * v_addon.quantity);
          v_result := jsonb_set(v_result, ARRAY[v_addon.target_feature_key, 'limit_value'], to_jsonb(v_limit));
          v_result := jsonb_set(v_result, ARRAY[v_addon.target_feature_key, 'enabled'], to_jsonb(v_limit > 0));
          v_result := jsonb_set(v_result, ARRAY[v_addon.target_feature_key, 'source'], '"addon"'::jsonb);
        END IF;
      END IF;
    END IF;
  END LOOP;

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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_sync_legacy_brands_to_subscriptions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF EXISTS (SELECT 1 FROM public.brand_subscriptions WHERE brand_id = v_b.id) THEN
      CONTINUE;
    END IF;

    IF v_b.plan_type = 'lifetime' THEN
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
$function$;
