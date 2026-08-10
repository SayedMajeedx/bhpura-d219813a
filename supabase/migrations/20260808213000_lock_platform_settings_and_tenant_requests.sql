-- Restrict platform configuration and onboarding PII to actual super admins.

DROP POLICY IF EXISTS "Allow admin all to system_settings" ON public.system_settings;
CREATE POLICY "Super admins manage system settings"
  ON public.system_settings FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Allow public select to tenant_requests" ON public.tenant_requests;
DROP POLICY IF EXISTS "Allow admin all to tenant_requests" ON public.tenant_requests;
REVOKE SELECT, UPDATE, DELETE ON public.tenant_requests FROM anon, authenticated;
GRANT INSERT ON public.tenant_requests TO anon, authenticated;

CREATE POLICY "Super admins read tenant requests"
  ON public.tenant_requests FOR SELECT TO authenticated
  USING (public.is_super_admin());
CREATE POLICY "Super admins update tenant requests"
  ON public.tenant_requests FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admins delete tenant requests"
  ON public.tenant_requests FOR DELETE TO authenticated
  USING (public.is_super_admin());

GRANT SELECT, UPDATE, DELETE ON public.tenant_requests TO authenticated;

-- Public callers need only a boolean availability result, never applicant PII.
CREATE OR REPLACE FUNCTION public.is_tenant_subdomain_available(p_subdomain text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.tenant_requests
    WHERE lower(desired_subdomain) = lower(trim(p_subdomain))
      AND status <> 'rejected'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.brands
    WHERE lower(slug) = lower(trim(p_subdomain))
  );
$$;
REVOKE ALL ON FUNCTION public.is_tenant_subdomain_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_subdomain_available(text) TO anon, authenticated;
