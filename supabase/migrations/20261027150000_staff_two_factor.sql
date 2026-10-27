-- Two-factor sign-in for staff (the owner's decision of 2026-10-27: optional, each member turns
-- it on). A member who has added an authenticator app (a verified TOTP factor in Supabase Auth)
-- signs in with their password or passkey and then a code; until the code is given the session is
-- at assurance level aal1, and the database grants it nothing a member is granted.
--
-- The rule is held where every staff permission is decided: can_access_brand, has_permission,
-- is_admin and is_super_admin (the live definitions, read from production on 2026-10-27) each
-- gain one condition, staff_session_verified(): true for a session that gave its code (aal2) and
-- for a member who has not turned two-factor on, so nobody without it notices anything. A browser
-- that skipped the code screen, with only a password, reads and writes nothing of a store.
--
-- brand_staff_two_factor lists the store's members who have it on, for the Team page (the owner
-- and admins only).

CREATE OR REPLACE FUNCTION public.staff_session_verified()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors f
         WHERE f.user_id = auth.uid() AND f.status = 'verified'
      )
$$;

REVOKE ALL ON FUNCTION public.staff_session_verified() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.can_access_brand(_brand_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IS DISTINCT FROM 'courier'
      AND (p.role = 'super_admin' OR p.brand_id = _brand_id)
  )
  -- ADDED (20261027150000): a member with two-factor on, only once this session gave the code.
  AND public.staff_session_verified();
$function$;

CREATE OR REPLACE FUNCTION public.has_permission(p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND status = 'active' -- Guard: Deactivated staff are auto-blocked standalone
      AND (
        role IN ('admin', 'super_admin', 'brand_admin')
        OR jsonb_exists(permissions, p_permission)
      )
  )
  -- ADDED (20261027150000): a member with two-factor on, only once this session gave the code.
  AND public.staff_session_verified();
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin', 'owner', 'brand_admin')
      AND status = 'active'
  )
  -- ADDED (20261027150000): a member with two-factor on, only once this session gave the code.
  AND public.staff_session_verified();
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'
      AND status = 'active'
  )
  -- ADDED (20261027150000): a member with two-factor on, only once this session gave the code.
  AND public.staff_session_verified();
$function$;

-- The store's members who have two-factor on (their profile ids), for the owner and admins.
CREATE OR REPLACE FUNCTION public.brand_staff_two_factor(p_brand_id uuid)
RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT DISTINCT f.user_id
    FROM auth.mfa_factors f
    JOIN public.profiles p ON p.id = f.user_id
   WHERE f.status = 'verified'
     AND p.brand_id = p_brand_id
     AND public.can_access_brand(p_brand_id)
     AND public.is_admin()
$$;

REVOKE ALL ON FUNCTION public.brand_staff_two_factor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brand_staff_two_factor(uuid) TO authenticated;
