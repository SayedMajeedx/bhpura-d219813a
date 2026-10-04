-- Advance payment, phase 3: the engine looks at the order's total and at the customer.
--
-- A rule that names an order total (least and most) or a kind of customer (new or returning)
-- reaches a line only when the order meets it. The total is orders.total, after discounts, with
-- tax and the delivery fee. A customer is returning when the store already has an earlier order
-- from them that is not a draft, still pending or cancelled; that is worked out once, when the
-- order is placed, and kept (orders.advance_returning). Everything else is the phase 2 engine
-- unchanged: advance_rules_for_brand now also writes min_total, max_total and customer into the
-- rules it snapshots, and advance_rules_due checks them. A snapshot made before this has no such
-- keys, which read as "any".
--
-- advance_customer_is_returning_rpc lets the checkout show the same answer to a signed-in
-- customer about themselves (the checkout's preview); a guest is shown as new, and the database
-- decides when the order is placed.
--
-- Additive: functions replaced and two added.

-- Whether this customer already has an order with the store.
CREATE OR REPLACE FUNCTION public.advance_customer_is_returning(p_brand_id uuid, p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(p_customer_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.brand_id = p_brand_id
       AND o.customer_id = p_customer_id
       AND o.status NOT IN ('draft', 'pending', 'cancelled')
  ), false)
$function$;

REVOKE ALL ON FUNCTION public.advance_customer_is_returning(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The same answer for a signed-in customer about themselves (the checkout's preview).
CREATE OR REPLACE FUNCTION public.advance_customer_is_returning_rpc(p_brand_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(EXISTS (
    SELECT 1
      FROM public.brands b
      JOIN public.customers c ON c.brand_id = b.id AND c.user_id = auth.uid()
      JOIN public.orders o ON o.customer_id = c.id AND o.brand_id = b.id
     WHERE b.slug = p_brand_slug
       AND auth.uid() IS NOT NULL
       AND o.status NOT IN ('draft', 'pending', 'cancelled')
  ), false)
$function$;

REVOKE ALL ON FUNCTION public.advance_customer_is_returning_rpc(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_customer_is_returning_rpc(text) TO authenticated;

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
           'include_fee', r.include_delivery_fee,
           'min_total', r.min_order_total,
           'max_total', r.max_order_total,
           'customer', r.customer_kind
         ) ORDER BY r.sort_order, r.created_at, r.id), '[]'::jsonb)
    INTO v_own
    FROM public.advance_payment_rules r
   WHERE r.brand_id = p_brand_id AND r.is_active;
  RETURN v_own || public.advance_default_rules(COALESCE(v_percent, 30), v_scope);
END;
$function$;

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
         AND ((r ->> 'min_total') IS NULL OR o.total >= (r ->> 'min_total')::numeric)
         AND ((r ->> 'max_total') IS NULL OR o.total <= (r ->> 'max_total')::numeric)
         AND (COALESCE(r ->> 'customer', 'any') = 'any'
              OR (r ->> 'customer' = 'returning') = COALESCE(o.advance_returning, false))
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
    NEW.advance_returning := public.advance_customer_is_returning(NEW.brand_id, NEW.customer_id);
  END IF;
  RETURN NEW;
END;
$function$;
