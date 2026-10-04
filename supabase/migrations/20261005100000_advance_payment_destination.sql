-- Advance payment, phase 3b: a rule can look at where an order is going.
--
--   advance_payment_rules.destination_kind       any, local (the store's own country, Bahrain)
--                                                or abroad (any other country)
--   advance_payment_rules.destination_countries  for abroad: only these countries (ISO codes;
--                                                empty means any country abroad)
--   orders.destination_country                   the country a delivery order goes to, kept
--                                                when the order is placed (the next migration
--                                                makes the checkout write it)
--
-- A condition on the order, like the order total and the kind of customer. An order with no
-- country (a pickup or digital order, or one placed before this) counts as local, because it is
-- not going abroad.
--
-- Additive: defaulted columns on a table this feature added, and a nullable column on orders.

ALTER TABLE public.advance_payment_rules
  ADD COLUMN IF NOT EXISTS destination_kind text NOT NULL DEFAULT 'any'
    CHECK (destination_kind IN ('any', 'local', 'abroad')),
  ADD COLUMN IF NOT EXISTS destination_countries text[] NOT NULL DEFAULT '{}'
    CHECK (destination_countries::text ~ '^\{([A-Z]{2}(,[A-Z]{2})*)?\}$');

ALTER TABLE public.advance_payment_rules
  DROP CONSTRAINT IF EXISTS advance_payment_rules_destination_countries_abroad;
ALTER TABLE public.advance_payment_rules
  ADD CONSTRAINT advance_payment_rules_destination_countries_abroad
  CHECK (cardinality(destination_countries) = 0 OR destination_kind = 'abroad');

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS destination_country text
    CHECK (destination_country IS NULL OR destination_country ~ '^[A-Z]{2}$');
