-- Row rules ask who the caller is once per request, not once per row (the speed review of
-- 2026-11-22).
--
-- 184 of the 262 row rules called can_access_brand(brand_id), has_permission(...),
-- is_super_admin(), is_admin() or can_view_brand_costs(brand_id) as written, so Postgres ran them
-- for every row it looked at: each call reads the caller's profile and, since two-factor sign-in,
-- their authenticator factors. 66 sizes' costs took 0.4 s on average, the super admin's health
-- page 5.4 s, and the cost grows with every order and product.
--
-- The rules mean exactly what they meant. What changes is how they are written:
--   * a call that does not depend on the row is put in a sub-select, which Postgres evaluates once
--     for the whole request: (SELECT has_permission('x')), (SELECT is_super_admin()), ...;
--   * can_access_brand(col) is "a super admin, or col is the caller's own store": it becomes
--     ((SELECT is_super_admin()) OR col = (SELECT staff_brand_id())), both asked once;
--   * can_view_brand_costs(col) is can_access_brand(col) AND has_permission('view_financials').
-- staff_brand_id() is the store can_access_brand opens to a member who is not a super admin: an
-- active profile that is not a courier, once the session gave its two-factor code when it has one.
-- can_access_brand and the others stay as they are for the functions that call them.

CREATE OR REPLACE FUNCTION public.staff_brand_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.brand_id
    FROM public.profiles p
   WHERE p.id = auth.uid()
     AND p.status = 'active'
     AND p.role IS DISTINCT FROM 'courier'
     AND public.staff_session_verified();
$$;

REVOKE ALL ON FUNCTION public.staff_brand_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_brand_id() TO authenticated, service_role;

-- A rule's text, rewritten to ask once per request. Calls already in a sub-select are left.
CREATE OR REPLACE FUNCTION public.rls_expression_once_per_request(expr text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out text := expr;
BEGIN
  IF out IS NULL THEN
    RETURN NULL;
  END IF;
  out := regexp_replace(out, '(?<!SELECT )\mis_super_admin\(\)', '(SELECT is_super_admin())', 'g');
  out := regexp_replace(out, '(?<!SELECT )\mis_admin\(\)', '(SELECT is_admin())', 'g');
  out := regexp_replace(out, '(?<!SELECT )\mcurrent_brand_id\(\)', '(SELECT current_brand_id())', 'g');
  out := regexp_replace(out, '(?<!SELECT )\mauth\.uid\(\)', '(SELECT auth.uid())', 'g');
  out := regexp_replace(out, '(?<!SELECT )\mhas_permission\(([^()]*)\)', '(SELECT has_permission(\1))', 'g');
  out := regexp_replace(
    out,
    '\mcan_view_brand_costs\(([a-z_]+(\.[a-z_]+)?)\)',
    '(((SELECT is_super_admin()) OR \1 = (SELECT staff_brand_id())) AND (SELECT has_permission(''view_financials''::text)))',
    'g'
  );
  out := regexp_replace(
    out,
    '\mcan_access_brand\(([a-z_]+(\.[a-z_]+)?)\)',
    '((SELECT is_super_admin()) OR \1 = (SELECT staff_brand_id()))',
    'g'
  );
  RETURN out;
END;
$$;

REVOKE ALL ON FUNCTION public.rls_expression_once_per_request(text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  pol record;
  new_qual text;
  new_check text;
  statement text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
  LOOP
    new_qual := public.rls_expression_once_per_request(pol.qual);
    new_check := public.rls_expression_once_per_request(pol.with_check);
    IF new_qual IS NOT DISTINCT FROM pol.qual AND new_check IS NOT DISTINCT FROM pol.with_check THEN
      CONTINUE;
    END IF;
    statement := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF new_qual IS NOT NULL THEN
      statement := statement || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      statement := statement || format(' WITH CHECK (%s)', new_check);
    END IF;
    EXECUTE statement;
  END LOOP;
END;
$$;

-- The super admin's health page reads the latest runs of every service.
CREATE INDEX IF NOT EXISTS system_health_events_created_idx
  ON public.system_health_events (created_at DESC);
