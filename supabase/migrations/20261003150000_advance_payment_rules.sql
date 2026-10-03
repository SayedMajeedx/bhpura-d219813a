-- Advance payment, phase 2: a store's own rules.
--
-- Until now a store had one switch, one percentage and one scope. A store can now add rules of
-- its own: "tailoring orders 50%", "this abaya line a fixed 20", "delivery 30%". Each rule says
-- which order lines it reaches (the order's fulfillment, made-to-order or ready-made, chosen
-- products, chosen categories) and what it asks (a percentage or a fixed amount, with a least and
-- a most, and whether the delivery fee is part of it). The rules are ordered: a line is taken by
-- the first rule that reaches it. Lines no rule of the store's own reaches fall to the store's
-- general rule (the percentage and scope already in business_settings), so nothing changes for a
-- store that adds no rule.
--
-- orders.advance_rules keeps the rules that applied when the order was placed (see the next
-- migration), so changing a rule later does not move an order already placed.
--
-- Additive: a new table and one nullable column. Rules are readable by anyone (the storefront
-- shows what they ask), writable only by people who manage the store's settings.

CREATE TABLE IF NOT EXISTS public.advance_payment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name_en text,
  name_ar text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  -- Which orders: empty means every way of fulfilling.
  fulfillment text[] NOT NULL DEFAULT '{}'
    CHECK (fulfillment <@ ARRAY['delivery', 'pickup', 'digital', 'appointment']::text[]),
  -- Which lines: NULL any, true only made-to-order lines, false only ready-made ones.
  made_to_order boolean,
  product_ids uuid[] NOT NULL DEFAULT '{}',
  category_slugs text[] NOT NULL DEFAULT '{}',
  -- What it asks.
  amount_kind text NOT NULL DEFAULT 'percent' CHECK (amount_kind IN ('percent', 'fixed')),
  amount_value numeric(12, 3) NOT NULL CHECK (amount_value > 0),
  min_amount numeric(12, 3) CHECK (min_amount IS NULL OR min_amount >= 0),
  max_amount numeric(12, 3) CHECK (max_amount IS NULL OR max_amount > 0),
  include_delivery_fee boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount_kind <> 'percent' OR amount_value <= 100),
  CHECK (min_amount IS NULL OR max_amount IS NULL OR max_amount >= min_amount)
);

CREATE INDEX IF NOT EXISTS advance_payment_rules_brand_idx
  ON public.advance_payment_rules (brand_id, sort_order, created_at);

ALTER TABLE public.advance_payment_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public reads advance payment rules" ON public.advance_payment_rules;
CREATE POLICY "public reads advance payment rules" ON public.advance_payment_rules
  FOR SELECT TO anon, authenticated USING (is_active OR public.can_access_brand(brand_id));

DROP POLICY IF EXISTS "settings managers write advance payment rules" ON public.advance_payment_rules;
CREATE POLICY "settings managers write advance payment rules" ON public.advance_payment_rules
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS advance_rules jsonb;
