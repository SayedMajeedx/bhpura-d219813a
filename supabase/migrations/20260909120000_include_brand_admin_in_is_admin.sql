-- Migration: Include brand_admin in public.is_admin()
-- Fixes permission check where store owners/brand_admins were rejected by is_admin() RPC.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin', 'owner', 'brand_admin')
      AND status = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
