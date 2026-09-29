-- Migration: 20260929140000_guard_store_vertical.sql
--
-- A store's vertical (business_settings.store_vertical) is set by the
-- platform: proposed at onboarding, confirmed by a super admin, and changed
-- only by a super admin. Until now any staff member with manage_settings
-- could change it through the settings row's update policy, and a change
-- rewires the store (add-ons, categories, wording, option labels).
--
-- This guard allows a change only from:
--   * a super admin (is_super_admin()), or
--   * trusted server code: SECURITY DEFINER functions (they run as their
--     owner) and the service role, which provision and approve brands.
-- Brand staff can still save every other setting; the guard only fires when
-- the vertical itself changes.
--
-- Settings are saved with an upsert, and Postgres fires BEFORE INSERT
-- triggers for an upsert even when the row exists (it then becomes an
-- update, where the UPDATE branch checks the change). So an insert is only
-- checked when the brand has no settings row yet.

CREATE OR REPLACE FUNCTION public.guard_store_vertical()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER on purpose: current_user must be the caller's role
-- ('authenticated' for app users), not this function's owner.
SET search_path TO 'public'
AS $function$
DECLARE
  v_privileged boolean :=
    current_user NOT IN ('authenticated', 'anon') OR public.is_super_admin();
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.store_vertical IS DISTINCT FROM OLD.store_vertical THEN
      RAISE EXCEPTION 'STORE_VERTICAL_SUPER_ADMIN_ONLY'
        USING ERRCODE = '42501',
              HINT = 'Only a platform super admin can change a store''s vertical.';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.store_vertical IS DISTINCT FROM 'general'
       AND NOT EXISTS (
         SELECT 1 FROM public.business_settings WHERE brand_id = NEW.brand_id
       ) THEN
      RAISE EXCEPTION 'STORE_VERTICAL_SUPER_ADMIN_ONLY'
        USING ERRCODE = '42501',
              HINT = 'Only a platform super admin can set a store''s vertical.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_business_settings_guard_store_vertical ON public.business_settings;
CREATE TRIGGER trg_business_settings_guard_store_vertical
  BEFORE INSERT OR UPDATE OF store_vertical ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_store_vertical();
