-- Migration: 20261001120000_service_details.sql
--
-- Services vertical, step S2 (docs/services-vertical-plan.md): what a
-- service's editor records beyond a product's.
--
--   products.service_location  where the service happens: at the customer's
--                              place, at the store's venue, or either.
--   products.service_includes  what the service includes, shown on its page:
--                              a list of {"ar": "...", "en": "..."} lines.
--
-- Additive; both stay empty for products. Prices and lengths need no column:
-- a service's variants already carry them (duration_minutes, 20260930180000).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS service_location text
    CHECK (service_location IS NULL OR service_location IN ('customer', 'venue', 'both'));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS service_includes jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(service_includes) = 'array' AND jsonb_array_length(service_includes) <= 30);

COMMENT ON COLUMN public.products.service_location IS
  'A service''s place: customer (at the customer''s), venue (at the store''s), both. Null for products.';
COMMENT ON COLUMN public.products.service_includes IS
  'What a service includes: [{"ar": "...", "en": "..."}], at most 30 lines. Empty for products.';
