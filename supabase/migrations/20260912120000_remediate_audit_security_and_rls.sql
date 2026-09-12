-- Migration: 20260912120000_remediate_audit_security_and_rls.sql
-- Description: Remediate Pre-Cleanup Audit Security & RLS findings:
-- 1. P-1: Drop permissive "Users can update own name" on public.profiles to prevent privilege/brand_id escalation.
-- 2. M-2: Drop public SELECT on shared_carts; introduce secure RPC get_shared_cart_by_code.
-- 3. M-3: Revoke full table SELECT on public.brands from anon; grant SELECT on public storefront columns only.
-- 4. M-4: Drop OR public.is_super_admin() from public SELECT policies on saas_plans, saas_plan_versions, saas_plan_features, and saas_addons.

-- ============================================================
-- 1. P-1 (CRITICAL): Profiles Privilege Escalation via Permissive Policy
-- ============================================================
-- "Users can update own name" only checked (id = auth.uid() AND email = email)
-- which evaluated to true on ANY update by the user, bypassing "Users can update own profile"
-- and allowing self-elevation to super_admin or lateral tenant movement via brand_id.
-- "Users can update own profile" already allows updating names/avatars while pinning role/brand_id/permissions.
DROP POLICY IF EXISTS "Users can update own name" ON public.profiles;

-- ============================================================
-- 2. M-2 (MEDIUM): Restrict Shared Carts Exposure
-- ============================================================
-- shared_carts had "Allow public read shared_carts" FOR SELECT USING (true),
-- allowing anonymous key holders to harvest all saved carts.
DROP POLICY IF EXISTS "Allow public read shared_carts" ON public.shared_carts;
DROP POLICY IF EXISTS "shared_carts_public_read" ON public.shared_carts;

-- Create secure lookup function that requires the exact unguessable share code and checks expiration
CREATE OR REPLACE FUNCTION public.get_shared_cart_by_code(_code text)
RETURNS SETOF public.shared_carts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.shared_carts
  WHERE code = _code
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_shared_cart_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_cart_by_code(text) TO anon, authenticated, service_role;

-- ============================================================
-- 3. M-3 (MEDIUM): Restrict public.brands Full-Row Exposure to Anon
-- ============================================================
-- Revoke full table SELECT from anon so internal billing, owner, receipt, and renewal columns are not exposed
REVOKE SELECT ON public.brands FROM anon;
GRANT SELECT (
  id,
  slug,
  name_en,
  name_ar,
  logo_url,
  is_active,
  meta_title,
  meta_description,
  custom_domain,
  created_at
) ON public.brands TO anon;

-- ============================================================
-- 4. M-4 (MEDIUM): Anon Access to SaaS Plans and Versions
-- ============================================================
-- Migration 20260911001500 revoked EXECUTE on is_super_admin() from anon.
-- Public SELECT policies checking "OR public.is_super_admin()" cause Postgres to throw
-- permission denied for function is_super_admin when queried by anon.
-- Super admins already have separate FOR ALL TO authenticated policies.

DROP POLICY IF EXISTS "Public read active public plans" ON public.saas_plans;
CREATE POLICY "Public read active public plans" ON public.saas_plans
FOR SELECT USING (is_active = true AND is_public = true);

DROP POLICY IF EXISTS "Public read current published plan versions" ON public.saas_plan_versions;
CREATE POLICY "Public read current published plan versions" ON public.saas_plan_versions
FOR SELECT USING (
  is_current = true
  AND effective_from <= now()
  AND (effective_until IS NULL OR effective_until > now())
  AND EXISTS (
    SELECT 1 FROM public.saas_plans p
    WHERE p.id = plan_id AND p.is_active = true AND p.is_public = true
  )
);

DROP POLICY IF EXISTS "Public read published plan features" ON public.saas_plan_features;
CREATE POLICY "Public read published plan features" ON public.saas_plan_features
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.saas_plan_versions pv
    JOIN public.saas_plans p ON p.id = pv.plan_id
    WHERE pv.id = plan_version_id
      AND pv.is_current = true
      AND pv.effective_from <= now()
      AND (pv.effective_until IS NULL OR pv.effective_until > now())
      AND p.is_active = true
      AND p.is_public = true
  )
);

DROP POLICY IF EXISTS "Public read active addons" ON public.saas_addons;
CREATE POLICY "Public read active addons" ON public.saas_addons
FOR SELECT USING (is_active = true);

NOTIFY pgrst, 'reload schema';
