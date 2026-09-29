-- Migration: 20260929180000_refine_store_verticals.sql
--
-- Verticals V2, phase 3: two new store verticals.
--
--   fragrance  Perfume & Oud, under beauty (which becomes Beauty & Care)
--   services   Services & Events: bookable services, rentals and event
--              packages (the bookings add-on builds on it)
--
-- Every existing value stays valid (electronics is kept for any store on it;
-- the app just stops offering it). Names, parents and packs live in the app's
-- vertical registry (src/lib/verticals/registry.ts); this list only has to
-- accept its ids.

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_store_vertical_check;

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_store_vertical_check CHECK (
    store_vertical = ANY (ARRAY[
      'abayas', 'fashion', 'beauty', 'fragrance', 'coffee', 'food', 'gifts', 'print',
      'jewelry', 'home', 'electronics', 'digital', 'services', 'general'
    ]::text[])
  );
