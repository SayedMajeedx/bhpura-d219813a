-- Migration: Add must_change_password to profiles and secure RPC for first login setup
-- Timestamp: 20260923100000

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'must_change_password'
  ) THEN
    ALTER TABLE public.profiles
    ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- RPC to let an authenticated user clear their own must_change_password flag upon setting their new password
CREATE OR REPLACE FUNCTION public.complete_first_sign_in_password_change()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET must_change_password = false,
      updated_at = now()
  WHERE id = v_uid;

  RETURN true;
END;
$func$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.complete_first_sign_in_password_change() TO authenticated;
