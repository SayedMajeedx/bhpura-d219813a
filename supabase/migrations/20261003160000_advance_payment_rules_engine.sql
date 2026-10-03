-- Advance payment, phase 2: the engine that works an order's advance out from its rules.
--
-- One list of rules decides every order, however the store set things up:
--
--   * the store's own rules (advance_payment_rules), in their order, then
--   * the store's general rule (advance_payment_percent and advance_payment_scope), written as
--     rules by advance_default_rules, so a store that adds none behaves exactly as before.
--
-- A rule is {fulfillment: [], made_to_order: true|false|null, product_ids: [], category_slugs: [],
-- kind: "percent"|"fixed", value, min, max, include_fee}. An empty list or null reaches
-- everything. Each order line is taken by the first rule that reaches it: its basis is its share
-- of the order after discounts and tax (the order without its delivery fee, spread over the lines
-- by their amounts). The delivery fee joins the first rule with include_fee that reached a line.
-- A percentage is of the rule's basis, rounded up to the fils (the whole basis at 100); a fixed
-- amount is asked once per rule, never above its basis; a least and a most then apply. The
-- advance is the sum, never more than the order total, and NULL when nothing is asked.
--
-- The rules are snapshotted on the order when it is placed (orders.advance_rules), so editing a
-- rule never moves an order already placed. Orders placed before this migration have only
-- advance_percent and advance_scope; their rules are rebuilt from those, which gives the same
-- amount as before (tests/advance-payment-rule.test.ts).
--
-- Additive: functions replaced (order_advance_due, apply_advance_payment_rule) and two added.

-- The general rule, as rules.
CREATE OR REPLACE FUNCTION public.advance_default_rules(p_percent numeric, p_scope text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE COALESCE(p_scope, 'all')
    WHEN 'made_to_order' THEN jsonb_build_array(
      jsonb_build_object('made_to_order', true, 'kind', 'percent', 'value', p_percent, 'include_fee', false))
    WHEN 'delivery' THEN jsonb_build_array(
      jsonb_build_object('fulfillment', jsonb_build_array('delivery'), 'kind', 'percent', 'value', p_percent, 'include_fee', true))
    WHEN 'made_to_order_or_delivery' THEN jsonb_build_array(
      jsonb_build_object('fulfillment', jsonb_build_array('delivery'), 'kind', 'percent', 'value', p_percent, 'include_fee', true),
      jsonb_build_object('made_to_order', true, 'kind', 'percent', 'value', p_percent, 'include_fee', false))
    ELSE jsonb_build_array(
      jsonb_build_object('kind', 'percent', 'value', p_percent, 'include_fee', true))
  END
$function$;

-- The rules a store's next order is placed under: its own, in order, then its general rule.
CREATE OR REPLACE FUNCTION public.advance_rules_for_brand(p_brand_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_own jsonb;
  v_percent numeric;
  v_scope text;
BEGIN
  SELECT s.advance_payment_percent, s.advance_payment_scope
    INTO v_percent, v_scope
    FROM public.business_settings s WHERE s.brand_id = p_brand_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'fulfillment', to_jsonb(r.fulfillment),
           'made_to_order', r.made_to_order,
           'product_ids', to_jsonb(r.product_ids),
           'category_slugs', to_jsonb(r.category_slugs),
           'kind', r.amount_kind,
           'value', r.amount_value,
           'min', r.min_amount,
           'max', r.max_amount,
           'include_fee', r.include_delivery_fee
         ) ORDER BY r.sort_order, r.created_at, r.id), '[]'::jsonb)
    INTO v_own
    FROM public.advance_payment_rules r
   WHERE r.brand_id = p_brand_id AND r.is_active;
  RETURN v_own || public.advance_default_rules(COALESCE(v_percent, 30), v_scope);
END;
$function$;

REVOKE ALL ON FUNCTION public.advance_rules_for_brand(uuid) FROM PUBLIC, anon, authenticated;

-- What an order owes under a list of rules (see the header), or NULL.
CREATE OR REPLACE FUNCTION public.advance_rules_due(p_order_id uuid, p_rules jsonb)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders%ROWTYPE;
  n integer := COALESCE(jsonb_array_length(p_rules), 0);
  v_lines numeric;
  v_items numeric;
  v_basis numeric[];
  v_hit boolean[];
  v_fee_taken boolean := false;
  v_total numeric := 0;
  v_amount numeric;
  line record;
  r jsonb;
  i integer;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND OR n = 0 OR COALESCE(o.total, 0) <= 0 THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(sum(line_total), 0) INTO v_lines FROM public.order_items WHERE order_id = o.id;
  -- The order without its delivery fee: discounts and tax are spread over the lines.
  v_items := GREATEST(o.total - COALESCE(o.shipping, 0), 0);
  v_basis := array_fill(0::numeric, ARRAY[n]);
  v_hit := array_fill(false, ARRAY[n]);

  FOR line IN
    SELECT oi.line_total, oi.location, oi.product_id, p.category
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
     WHERE oi.order_id = o.id
     ORDER BY oi.id
  LOOP
    FOR i IN 1..n LOOP
      r := p_rules -> (i - 1);
      IF (jsonb_array_length(COALESCE(r -> 'fulfillment', '[]'::jsonb)) = 0
            OR (r -> 'fulfillment') ? o.fulfillment_method)
         AND ((r ->> 'made_to_order') IS NULL
              OR ((line.location = 'custom') = (r ->> 'made_to_order')::boolean))
         AND (jsonb_array_length(COALESCE(r -> 'product_ids', '[]'::jsonb)) = 0
              OR (line.product_id IS NOT NULL AND (r -> 'product_ids') ? line.product_id::text))
         AND (jsonb_array_length(COALESCE(r -> 'category_slugs', '[]'::jsonb)) = 0
              OR (line.category IS NOT NULL AND (r -> 'category_slugs') ? line.category))
      THEN
        v_hit[i] := true;
        IF v_lines > 0 THEN
          v_basis[i] := v_basis[i] + v_items * line.line_total / v_lines;
        END IF;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;

  -- The delivery fee joins the first rule that asks for it and reached a line.
  IF COALESCE(o.shipping, 0) > 0 THEN
    FOR i IN 1..n LOOP
      IF v_hit[i] AND COALESCE((p_rules -> (i - 1) ->> 'include_fee')::boolean, false) AND NOT v_fee_taken THEN
        v_basis[i] := v_basis[i] + o.shipping;
        v_fee_taken := true;
      END IF;
    END LOOP;
  END IF;

  FOR i IN 1..n LOOP
    IF v_basis[i] > 0 THEN
      r := p_rules -> (i - 1);
      IF COALESCE(r ->> 'kind', 'percent') = 'fixed' THEN
        v_amount := LEAST((r ->> 'value')::numeric, v_basis[i]);
      ELSIF (r ->> 'value')::numeric >= 100 THEN
        v_amount := round(v_basis[i], 3);
      ELSE
        v_amount := ceil(v_basis[i] * (r ->> 'value')::numeric * 10 - 0.000000001) / 1000;
      END IF;
      IF (r ->> 'min') IS NOT NULL THEN
        v_amount := GREATEST(v_amount, LEAST((r ->> 'min')::numeric, v_basis[i]));
      END IF;
      IF (r ->> 'max') IS NOT NULL THEN
        v_amount := LEAST(v_amount, (r ->> 'max')::numeric);
      END IF;
      v_total := v_total + v_amount;
    END IF;
  END LOOP;

  IF v_total <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN LEAST(o.total, v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.advance_rules_due(uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- What the order owes in advance: under the rules it was placed under, or (an order placed
-- before rules) under its percentage and scope.
CREATE OR REPLACE FUNCTION public.order_advance_due(p_order_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF o.advance_rules IS NOT NULL THEN
    RETURN public.advance_rules_due(o.id, o.advance_rules);
  END IF;
  IF o.advance_percent IS NULL OR o.advance_percent <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN public.advance_rules_due(
    o.id, public.advance_default_rules(o.advance_percent, o.advance_scope));
END;
$function$;

REVOKE ALL ON FUNCTION public.order_advance_due(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_advance_due(uuid) TO service_role;

-- A storefront order is placed under the store's rules as they are now.
CREATE OR REPLACE FUNCTION public.apply_advance_payment_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
  v_percent numeric;
  v_scope text;
BEGIN
  IF NEW.channel IS DISTINCT FROM 'storefront' OR NEW.brand_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT s.advance_payment_enabled, s.advance_payment_percent, s.advance_payment_scope
    INTO v_enabled, v_percent, v_scope
    FROM public.business_settings s
   WHERE s.brand_id = NEW.brand_id;
  IF COALESCE(v_enabled, false) THEN
    NEW.advance_percent := v_percent;
    NEW.advance_scope := COALESCE(v_scope, 'all');
    NEW.advance_rules := public.advance_rules_for_brand(NEW.brand_id);
  END IF;
  RETURN NEW;
END;
$function$;
