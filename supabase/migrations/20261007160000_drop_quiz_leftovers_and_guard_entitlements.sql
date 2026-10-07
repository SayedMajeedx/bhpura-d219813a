-- Database clean-up from the audit.
--
-- 1. The quiz game from an old project lived on in this database: nine tables, seventeen
--    functions (most callable by any visitor with the public API key) and a storage bucket's
--    policies. Nothing in the app, the edge functions or the mobile app uses them (checked), no
--    other table points at them, and the live tables hold no sessions (rooms, players, answers and
--    results are empty; only 33 quiz titles and 37 questions remain). They are dropped.
--    The empty `question-images` bucket cannot be removed with SQL (Storage refuses direct
--    deletes): remove it in the dashboard (Storage) if you want it gone; its policies go here.
--
-- 2. rpc_evaluate_brand_entitlements(brand) returned any brand's plan and limits to any signed-in
--    account, and, when the brand had no subscription row yet, seeded rows for EVERY brand as a
--    side effect. It now answers only the server or staff of that brand. The old body is kept as a
--    private function (the same code, not callable from the browser) so this change cannot alter
--    what it computes.
--
-- 3. rpc_sync_legacy_brands_to_subscriptions() is for the server only now (the one TypeScript
--    caller, getBrandSubscription, runs it with the service role after checking brand access).
--
-- check_registered_customer_exists stays as it is: the storefront sign-up needs to tell a shopper
-- that an account exists. It is listed in supabase/function-grants.json as an accepted risk.

-- 1. Quiz game ------------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.advance_room(uuid, integer, text);
DROP FUNCTION IF EXISTS public.archive_room(uuid);
DROP FUNCTION IF EXISTS public.check_user_hosting_eligibility();
DROP FUNCTION IF EXISTS public.claim_daily_hosted_quiz();
DROP FUNCTION IF EXISTS public.get_all_admin_quizzes();
DROP FUNCTION IF EXISTS public.get_room_by_code(text);
DROP FUNCTION IF EXISTS public.join_room(text, text, text);
DROP FUNCTION IF EXISTS public.room_answers(uuid, uuid);
DROP FUNCTION IF EXISTS public.room_players(uuid, uuid);
DROP FUNCTION IF EXISTS public.room_questions(uuid);
DROP FUNCTION IF EXISTS public.room_reveals(uuid);
DROP FUNCTION IF EXISTS public.start_room_v2(uuid);
DROP FUNCTION IF EXISTS public.submit_answer(uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.upsert_admin_quiz(text, text, text, text, text, boolean, jsonb);
DROP FUNCTION IF EXISTS public.upsert_admin_quiz(text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.upsert_admin_quiz_by_id_or_title(uuid, text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.use_fifty_fifty(uuid, uuid);

DROP TABLE IF EXISTS public.user_answers;
DROP TABLE IF EXISTS public.answers;
DROP TABLE IF EXISTS public.game_results;
DROP TABLE IF EXISTS public.game_sessions;
DROP TABLE IF EXISTS public.players;
DROP TABLE IF EXISTS public.rooms;
DROP TABLE IF EXISTS public.daily_hosted_quiz_usage;
DROP TABLE IF EXISTS public.questions;
DROP TABLE IF EXISTS public.quizzes;

DROP POLICY IF EXISTS question_images_public_read ON storage.objects;
DROP POLICY IF EXISTS question_images_owner_insert ON storage.objects;
DROP POLICY IF EXISTS question_images_owner_update ON storage.objects;
DROP POLICY IF EXISTS question_images_owner_delete ON storage.objects;

-- 2. Entitlements ---------------------------------------------------------------------------------

ALTER FUNCTION public.rpc_evaluate_brand_entitlements(uuid)
  RENAME TO rpc_evaluate_brand_entitlements_unchecked;

REVOKE EXECUTE ON FUNCTION public.rpc_evaluate_brand_entitlements_unchecked(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_evaluate_brand_entitlements(_brand_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- NOT COALESCE(..., false): an anonymous caller has no user, so the test is NULL, never "allowed".
  IF NOT COALESCE(auth.role() = 'service_role' OR public.can_access_brand(_brand_id), false) THEN
    RAISE EXCEPTION 'Not authorized to read this brand''s plan' USING ERRCODE = '42501';
  END IF;
  RETURN public.rpc_evaluate_brand_entitlements_unchecked(_brand_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_evaluate_brand_entitlements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_evaluate_brand_entitlements(uuid) TO authenticated, service_role;

-- 3. Subscription seeding -------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.rpc_sync_legacy_brands_to_subscriptions()
  FROM PUBLIC, anon, authenticated;
