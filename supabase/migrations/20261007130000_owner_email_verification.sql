-- Whether the person behind a team account has shown they own its email address.
--
-- The instant trial creates an account with an already-confirmed email, so its owner can start at
-- once, but nobody proved they own the address (anyone could register someone else's). The trial
-- owner is therefore marked unverified until they enter a code Supabase Auth emails them, and an
-- unverified account can use the trial but cannot pay for a plan or invite staff.
--
--   * profiles.email_verified_at   NULL = not verified. It defaults to now(), so every account that
--     exists today, and every account made any other way (the super admin's wizard, team invites),
--     counts as verified. Only the instant trial writes NULL.
--   * Only the server (the service role) or a super admin may change it: a signed-in user could
--     otherwise mark themselves verified through the profile policy that lets them edit their row.
--
-- Additive: one nullable column with a default, and one trigger.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION public.guard_profile_email_verified()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at
     AND auth.role() IN ('anon', 'authenticated')
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'email_verified_at is set by the server only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_guard_email_verified ON public.profiles;
CREATE TRIGGER profiles_guard_email_verified
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_email_verified();
