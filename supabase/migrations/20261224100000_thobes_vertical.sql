-- Migration: 20261224100000_thobes_vertical.sql
--
-- A store vertical for men's thobes, thobe fabrics and ghutras / shemaghs (the owner's request
-- of 2026-11-26, phase 1 of docs/thobes-vertical-plan.md). It is a child of fashion, as abayas
-- is: its name, parent and add-ons live in the app's vertical registry
-- (src/lib/verticals/registry.ts); the database only has to accept its id.
--
--   1. business_settings.store_vertical accepts 'thobes' (every other value stays valid).
--   2. A new thobes store offers alterations by default, like the rest of the fashion family
--      (the default of migration 20261117100000). No store is on the vertical yet, so no row is
--      written.

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_store_vertical_check;

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_store_vertical_check CHECK (
    store_vertical = ANY (ARRAY[
      'abayas', 'thobes', 'fashion', 'beauty', 'fragrance', 'coffee', 'food', 'gifts', 'print',
      'jewelry', 'home', 'electronics', 'digital', 'services', 'general'
    ]::text[])
  );

-- The fashion family is `fashion` and its children; tests/thobes-vertical-migration.test.ts
-- keeps this list equal to the registry's.
CREATE OR REPLACE FUNCTION public.business_settings_alterations_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.offers_alterations IS NULL THEN
    NEW.offers_alterations := COALESCE(lower(NEW.store_vertical) IN ('fashion', 'abayas', 'thobes'), false);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.business_settings_alterations_default() FROM PUBLIC, anon, authenticated;
