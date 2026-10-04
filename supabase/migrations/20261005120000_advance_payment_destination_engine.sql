-- Advance payment, phase 3b: the engine looks at where the order is going.
--
-- A rule with destination 'local' reaches an order going to the store's own country (Bahrain, or
-- with no country at all: a pickup, digital or appointment order); 'abroad' reaches one going to
-- another country, and with countries listed, only to those. The country is
-- orders.destination_country, written when the order is placed (previous migration) and read
-- here when the amount is worked out, so the card charge, the BenefitPay approval and the
-- cash-on-delivery refusal all see it. advance_rules_for_brand writes destination and countries
-- into the rules it snapshots; a snapshot made before this has no such keys, which read as "any".
--
-- Additive: two functions replaced (the phase 3 versions, with that condition added).

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
           'customer', r.customer_kind,
           'destination', r.destination_kind,
           'countries', to_jsonb(r.destination_countries)
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
         AND (COALESCE(r ->> 'destination', 'any') = 'any'
              OR (r ->> 'destination' = 'local' AND COALESCE(o.destination_country, 'BH') = 'BH')
              OR (r ->> 'destination' = 'abroad'
                  AND COALESCE(o.destination_country, 'BH') <> 'BH'
                  AND (jsonb_array_length(COALESCE(r -> 'countries', '[]'::jsonb)) = 0
                       OR (r -> 'countries') ? o.destination_country)))
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
