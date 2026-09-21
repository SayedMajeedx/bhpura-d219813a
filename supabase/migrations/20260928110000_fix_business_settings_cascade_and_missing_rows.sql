-- Migration: 20260928110000_fix_business_settings_cascade_and_missing_rows.sql
-- Fix: Prevent business_settings deletion on auth user delete & heal missing rows

-- 1. Allow user_id to be nullable so store settings are not hard-bound to a single user identity
ALTER TABLE public.business_settings ALTER COLUMN user_id DROP NOT NULL;

-- 2. Drop the dangerous ON DELETE CASCADE constraint on user_id
-- A tenant's business settings MUST NOT be deleted when a user account is removed
ALTER TABLE public.business_settings DROP CONSTRAINT IF EXISTS business_settings_user_id_fkey;

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- 3. Update ensure_business_settings_for_brand trigger function to be fully resilient
CREATE OR REPLACE FUNCTION public.ensure_business_settings_for_brand()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_vertical text;
BEGIN
  -- Attempt to get a valid user ID, but don't abort if none exists
  v_owner := COALESCE(NEW.created_by, auth.uid());
  IF v_owner IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner) THEN
    -- If created_by is a stale/deleted user, look up brand admin profile
    SELECT id INTO v_owner FROM public.profiles WHERE brand_id = NEW.id AND status = 'active' LIMIT 1;
  END IF;

  v_vertical := 'general';

  INSERT INTO public.business_settings (
    user_id, brand_id, business_name, logo_url, currency, primary_color,
    text_color, background_color, cod_enabled, card_enabled, benefit_enabled,
    delivery_enabled, pickup_enabled, store_vertical
  ) VALUES (
    v_owner, NEW.id,
    COALESCE(NEW.name_en, NEW.name_ar, 'My Store'),
    NEW.logo_url,
    'BHD',
    COALESCE(NEW.primary_color, '#8b6f47'),
    '#111111', '#ffffff',
    true, false, false,
    true, true, v_vertical
  ) ON CONFLICT (brand_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 4. Create an idempotent self-healing RPC to guarantee a brand's business_settings row exists
CREATE OR REPLACE FUNCTION public.ensure_brand_business_settings(p_brand_id uuid)
RETURNS public.business_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_brand record;
  v_owner uuid;
  v_vertical text;
  v_settings public.business_settings;
BEGIN
  SELECT * INTO v_brand FROM public.brands WHERE id = p_brand_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brand % not found', p_brand_id;
  END IF;

  SELECT * INTO v_settings FROM public.business_settings WHERE brand_id = p_brand_id;
  IF FOUND THEN
    RETURN v_settings;
  END IF;

  -- Determine owner
  SELECT id INTO v_owner FROM public.profiles WHERE brand_id = p_brand_id AND status = 'active' LIMIT 1;
  IF v_owner IS NULL THEN
    v_owner := COALESCE(v_brand.created_by, auth.uid());
    IF v_owner IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_owner) THEN
      v_owner := NULL;
    END IF;
  END IF;

  -- Derive vertical from installed addons if already installed
  IF EXISTS (SELECT 1 FROM public.brand_addons WHERE brand_id = p_brand_id AND addon_id = 'coffee-roastery' AND status = 'installed') THEN
    v_vertical := 'coffee';
  ELSIF EXISTS (SELECT 1 FROM public.brand_addons WHERE brand_id = p_brand_id AND addon_id = 'fashion-core' AND status = 'installed') THEN
    v_vertical := 'fashion';
  ELSE
    v_vertical := 'general';
  END IF;

  INSERT INTO public.business_settings (
    user_id,
    brand_id,
    business_name,
    logo_url,
    currency,
    primary_color,
    storefront_accent_color,
    storefront_background_color,
    text_color,
    background_color,
    cod_enabled,
    card_enabled,
    benefit_enabled,
    delivery_enabled,
    pickup_enabled,
    store_vertical,
    storefront_mode,
    storefront_design_version
  ) VALUES (
    v_owner,
    p_brand_id,
    COALESCE(v_brand.name_en, v_brand.name_ar, 'Store'),
    v_brand.logo_url,
    'BHD',
    COALESCE(v_brand.primary_color, '#1c1917'),
    COALESCE(v_brand.primary_color, '#1c1917'),
    '#ffffff',
    '#111111',
    '#ffffff',
    true,
    false,
    false,
    true,
    true,
    v_vertical,
    'shop',
    2
  )
  ON CONFLICT (brand_id) DO NOTHING
  RETURNING * INTO v_settings;

  -- In case ON CONFLICT triggered concurrently
  IF v_settings IS NULL THEN
    SELECT * INTO v_settings FROM public.business_settings WHERE brand_id = p_brand_id;
  END IF;

  RETURN v_settings;
END;
$$;

-- 5. Backfill any existing brands missing a business_settings row
DO $$
DECLARE
  b record;
BEGIN
  FOR b IN SELECT id FROM public.brands WHERE id NOT IN (SELECT brand_id FROM public.business_settings)
  LOOP
    PERFORM public.ensure_brand_business_settings(b.id);
  END LOOP;
END;
$$;
