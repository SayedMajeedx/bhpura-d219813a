-- Advance payment, phase 3: two more things a store's own rule can look at.
--
--   min_order_total / max_order_total   the order's total (lines after discounts, tax and the
--                                       delivery fee) must be at least / at most this
--   customer_kind                       any, new (no earlier order from this customer in this
--                                       store) or returning (at least one)
--
-- Both are conditions on the order, not on a line: a rule that has them reaches a line only when
-- the order meets them, like the way of fulfilling. orders.advance_returning keeps, when the order
-- is placed, whether the customer already had an order with the store (the next migration sets
-- it), so the answer never changes afterwards. Orders placed before this have none: they are read
-- as a new customer, and their rules carry no such condition anyway.
--
-- Additive: nullable or defaulted columns on a table this feature added and on orders.

ALTER TABLE public.advance_payment_rules
  ADD COLUMN IF NOT EXISTS min_order_total numeric(12, 3)
    CHECK (min_order_total IS NULL OR min_order_total >= 0),
  ADD COLUMN IF NOT EXISTS max_order_total numeric(12, 3)
    CHECK (max_order_total IS NULL OR max_order_total > 0),
  ADD COLUMN IF NOT EXISTS customer_kind text NOT NULL DEFAULT 'any'
    CHECK (customer_kind IN ('any', 'new', 'returning'));

ALTER TABLE public.advance_payment_rules
  DROP CONSTRAINT IF EXISTS advance_payment_rules_order_total_range;
ALTER TABLE public.advance_payment_rules
  ADD CONSTRAINT advance_payment_rules_order_total_range
  CHECK (min_order_total IS NULL OR max_order_total IS NULL OR max_order_total >= min_order_total);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS advance_returning boolean;
