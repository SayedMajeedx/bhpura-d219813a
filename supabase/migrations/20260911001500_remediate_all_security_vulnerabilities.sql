-- Migration: 20260911001500_remediate_all_security_vulnerabilities.sql
-- Description: Remediate critical security findings:
--   1. Protect business_settings credentials (drop anon read, set view to security_invoker = false)
--   2. Restrict subcategories and legacy quiz tables to admin mutations only
--   3. Restrict profiles SELECT policy to tenant-scoped brand isolation
--   4. Revoke anonymous EXECUTE on sensitive internal / permission functions

-- 1. Protect business_settings credentials
-- Prevent anon role from reading raw business_settings which contains card_secret_key, card_public_key, and benefit_account_number.
DROP POLICY IF EXISTS "business_settings public read" ON public.business_settings;
REVOKE ALL ON TABLE public.business_settings FROM anon;

-- Ensure brand_public_settings view runs with viewowner (postgres) permissions so anon can safely read public styling/branding attributes only
ALTER VIEW public.brand_public_settings SET (security_invoker = false);
GRANT SELECT ON public.brand_public_settings TO anon, authenticated;

-- 2. Restrict subcategories to authenticated admin mutations only
DROP POLICY IF EXISTS "Permissive subcategories" ON public.subcategories;

-- Ensure subcategories has explicit public read and admin mutation
DROP POLICY IF EXISTS "subcategories_admin_mutation" ON public.subcategories;
CREATE POLICY "subcategories_admin_mutation" ON public.subcategories
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Lock down legacy game tables against public/anon mutations
DROP POLICY IF EXISTS "answers_public_all" ON public.answers;
CREATE POLICY "answers_admin_all" ON public.answers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Permissive questions" ON public.questions;
CREATE POLICY "questions_admin_all" ON public.questions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Permissive quizzes" ON public.quizzes;
CREATE POLICY "quizzes_admin_all" ON public.quizzes
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "rooms_public_all" ON public.rooms;
CREATE POLICY "rooms_admin_all" ON public.rooms
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "players_public_all" ON public.players;
CREATE POLICY "players_admin_all" ON public.players
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Permissive game_sessions" ON public.game_sessions;
CREATE POLICY "game_sessions_admin_all" ON public.game_sessions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Permissive game_results" ON public.game_results;
CREATE POLICY "game_results_admin_all" ON public.game_results
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Permissive user_answers" ON public.user_answers;
CREATE POLICY "user_answers_admin_all" ON public.user_answers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Scope profiles SELECT to prevent cross-tenant merchant profile scraping
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;

CREATE POLICY "Admins can read brand profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR (
      public.is_admin()
      AND (NOT (brand_id IS DISTINCT FROM public.current_brand_id()))
    )
  );

-- 5. Revoke anon EXECUTE on internal permission and admin utility RPCs
REVOKE EXECUTE ON FUNCTION public.can_access_brand(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_brand_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_brand_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reporting_brand_id(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_check_entitlement(uuid, text, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_consume_usage(uuid, text, bigint, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_evaluate_brand_entitlements(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_evaluate_customer_loyalty_tier(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.courier_update_delivery(uuid, text, text, boolean, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.courier_update_delivery(uuid, uuid, boolean, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_courier_delivery_message(uuid) FROM anon;
