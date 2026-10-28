-- A promo code's own rules, held by the database.
--
-- Found in the owner's review of the discounts (2026-10-28): the live `validate_promo_code` (its
-- inner function, `..._before_returning_customer_guard_20260825`) checked the code is on, its
-- minimum, its customer limits and the sale items, and nothing else. A code past its end date,
-- before its start date or past its total redemptions was accepted at checkout, and the margin
-- floor ("exclude products whose margin falls below") did nothing: the admin saved all of it and
-- only drew it. The order builder takes its discount from this function (`place_storefront_order_core`
-- and `place_booking_order` call `validate_promo_code`), so the rules belong here.
--
-- This replaces that inner function with one that also holds, in this order:
--   1. the start date and the end date (`CODE_NOT_STARTED`, `CODE_EXPIRED`);
--   2. the total redemptions (`CODE_MAX_REDEMPTIONS_REACHED`: orders that carry the code and were
--      not cancelled or left as drafts), serialised per code so two orders at the last redemption
--      cannot both take it;
--   3. which lines the code reaches: every line, or the products and categories chosen (new:
--      `product_ids`, `category_slugs`; a line counts when its product is chosen or its category
--      is, as for the store's offers), less the lines on sale (`exclude_sale_items`) and the lines
--      whose margin after the discount falls below the code's floor (`exclude_low_margin`,
--      `margin_threshold`; a line with no known cost is not excluded). The discount is worked on
--      what those lines cost the shopper; no line left is `NO_ELIGIBLE_ITEMS`.
--
-- Additive: two columns with defaults (a code reaches every line until a store chooses), and one
-- function replaced with the same signature. The wrapper `validate_promo_code` is untouched.
-- Tested in a real Postgres by tests/promo-code-rules-migration.test.ts.

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS product_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category_slugs text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_scope_size_check,
  ADD CONSTRAINT promo_codes_scope_size_check CHECK (
    cardinality(product_ids) <= 200 AND cardinality(category_slugs) <= 50
  );

CREATE OR REPLACE FUNCTION public.validate_promo_code_before_returning_customer_guard_20260825(
  p_brand_slug text,
  p_code text,
  p_subtotal numeric,
  p_items jsonb DEFAULT NULL::jsonb,
  p_customer_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_promo public.promo_codes%ROWTYPE;
  v_brand_id uuid;
  v_user_id uuid := auth.uid();
  v_effective_customer_id uuid;
  v_effective_auth_user_id uuid;
  v_discountable_subtotal numeric(14,3) := greatest(COALESCE(p_subtotal, 0), 0);
  v_discount numeric(14,3);
  v_historical_orders integer := 0;
  v_prior_uses integer := 0;
  v_global_uses integer := 0;
  v_scoped boolean;
BEGIN
  IF NULLIF(trim(p_code), '') IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'CODE_REQUIRED');
  END IF;

  SELECT pc.* INTO v_promo
  FROM public.promo_codes pc
  JOIN public.brands b ON b.id = pc.brand_id
  WHERE b.slug = p_brand_slug AND b.is_active = true
    AND upper(pc.code) = upper(trim(p_code));

  IF v_promo.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'CODE_NOT_FOUND');
  END IF;
  v_brand_id := v_promo.brand_id;
  IF NOT v_promo.is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'CODE_INACTIVE');
  END IF;

  -- The code's days.
  IF v_promo.start_date IS NOT NULL AND now() < v_promo.start_date THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'CODE_NOT_STARTED',
      'start_date', v_promo.start_date);
  END IF;
  IF v_promo.end_date IS NOT NULL AND now() > v_promo.end_date THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'CODE_EXPIRED',
      'end_date', v_promo.end_date);
  END IF;

  -- Its total redemptions. The lock holds to the end of the caller's transaction, so an order
  -- being placed counts the others and is counted by the next.
  IF v_promo.max_redemptions IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('promo_code:' || v_promo.id::text));
    SELECT count(*) INTO v_global_uses
    FROM public.orders o
    WHERE o.brand_id = v_brand_id
      AND o.promo_code_id = v_promo.id
      AND COALESCE(o.status, '') NOT IN ('cancelled', 'draft');
    IF v_global_uses >= v_promo.max_redemptions THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'CODE_MAX_REDEMPTIONS_REACHED',
        'max_redemptions', v_promo.max_redemptions);
    END IF;
  END IF;

  IF v_promo.minimum_order_amount IS NOT NULL AND p_subtotal < v_promo.minimum_order_amount THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'MINIMUM_NOT_MET',
      'minimum_order_amount', v_promo.minimum_order_amount);
  END IF;

  IF v_promo.first_time_customers_only OR v_promo.usage_limit_per_customer IS NOT NULL THEN
    IF p_customer_id IS NOT NULL THEN
      IF NOT (public.is_super_admin() OR (public.is_admin() AND public.current_brand_id() = v_brand_id)) THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'CUSTOMER_ACCESS_DENIED');
      END IF;
      SELECT c.id, c.auth_user_id INTO v_effective_customer_id, v_effective_auth_user_id
      FROM public.customers c WHERE c.id = p_customer_id AND c.brand_id = v_brand_id;
      IF v_effective_customer_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'CUSTOMER_REQUIRED');
      END IF;
    ELSE
      IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'AUTH_REQUIRED');
      END IF;
      v_effective_auth_user_id := v_user_id;
    END IF;

    SELECT count(*) INTO v_historical_orders
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    WHERE o.brand_id = v_brand_id
      AND ((v_effective_auth_user_id IS NOT NULL AND c.auth_user_id = v_effective_auth_user_id)
        OR (v_effective_auth_user_id IS NULL AND c.id = v_effective_customer_id))
      AND (o.status IN ('completed', 'paid') OR o.payment_status = 'paid');

    IF v_promo.first_time_customers_only AND v_historical_orders > 0 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'FIRST_ORDER_ONLY');
    END IF;

    IF v_promo.usage_limit_per_customer IS NOT NULL THEN
      SELECT count(*) INTO v_prior_uses
      FROM public.orders o
      JOIN public.customers c ON c.id = o.customer_id
      WHERE o.brand_id = v_brand_id
        AND ((v_effective_auth_user_id IS NOT NULL AND c.auth_user_id = v_effective_auth_user_id)
          OR (v_effective_auth_user_id IS NULL AND c.id = v_effective_customer_id))
        AND o.promo_code_id = v_promo.id
        AND COALESCE(o.status, '') NOT IN ('cancelled', 'draft');
      IF v_prior_uses >= v_promo.usage_limit_per_customer THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'USAGE_LIMIT_REACHED',
          'usage_limit_per_customer', v_promo.usage_limit_per_customer);
      END IF;
    END IF;
  END IF;

  -- Which lines the code reaches.
  v_scoped := cardinality(v_promo.product_ids) > 0 OR cardinality(v_promo.category_slugs) > 0;
  IF v_scoped AND p_items IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'NO_ELIGIBLE_ITEMS');
  END IF;
  IF p_items IS NOT NULL AND (v_scoped OR v_promo.exclude_sale_items OR v_promo.exclude_low_margin) THEN
    SELECT COALESCE(sum(greatest(COALESCE((item->>'line_total')::numeric, 0), 0)), 0)
      INTO v_discountable_subtotal
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) item
    JOIN public.product_variants pv ON pv.id = (item->>'variant_id')::uuid
    LEFT JOIN public.products p ON p.id = pv.product_id
    LEFT JOIN public.variant_costs vc ON vc.variant_id = pv.id
    LEFT JOIN public.product_costs pcost ON pcost.product_id = pv.product_id
    WHERE pv.brand_id = v_brand_id
      -- The products and categories the code is for (none chosen: every line).
      AND (
        NOT v_scoped
        OR pv.product_id = ANY (v_promo.product_ids)
        OR (p.category IS NOT NULL AND p.category = ANY (v_promo.category_slugs))
      )
      -- Not the lines already on sale.
      AND (NOT v_promo.exclude_sale_items OR NOT (COALESCE(pv.original_price, 0) > pv.selling_price))
      -- Not the lines whose margin the discount takes below the floor. A line with no known
      -- cost has nothing to judge by and stays.
      AND (
        NOT v_promo.exclude_low_margin
        OR COALESCE(vc.cost_price, pcost.cost_price, 0) <= 0
        OR (
          pv.selling_price > 0
          AND CASE v_promo.discount_type
            WHEN 'percentage' THEN
              pv.selling_price * (1.0 - v_promo.discount_value / 100.0) > 0
              AND (
                (pv.selling_price * (1.0 - v_promo.discount_value / 100.0)
                  - COALESCE(vc.cost_price, pcost.cost_price, 0))
                / (pv.selling_price * (1.0 - v_promo.discount_value / 100.0))
              ) * 100.0 >= v_promo.margin_threshold
            ELSE
              -- A fixed amount comes off the cart as a share of it.
              p_subtotal > 0
              AND (1.0 - least(v_promo.discount_value / p_subtotal, 1.0)) * pv.selling_price > 0
              AND (
                ((1.0 - least(v_promo.discount_value / p_subtotal, 1.0)) * pv.selling_price
                  - COALESCE(vc.cost_price, pcost.cost_price, 0))
                / ((1.0 - least(v_promo.discount_value / p_subtotal, 1.0)) * pv.selling_price)
              ) * 100.0 >= v_promo.margin_threshold
          END
        )
      );
    v_discountable_subtotal := least(v_discountable_subtotal, greatest(COALESCE(p_subtotal, 0), 0));
    IF v_discountable_subtotal <= 0 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'NO_ELIGIBLE_ITEMS');
    END IF;
  END IF;

  v_discount := CASE v_promo.discount_type
    WHEN 'percentage' THEN round(v_discountable_subtotal * v_promo.discount_value / 100, 3)
    ELSE least(v_promo.discount_value, v_discountable_subtotal)
  END;
  IF v_promo.discount_type = 'percentage' AND v_promo.maximum_discount_amount IS NOT NULL THEN
    v_discount := least(v_discount, v_promo.maximum_discount_amount);
  END IF;
  v_discount := least(greatest(v_discount, 0), v_discountable_subtotal);

  RETURN jsonb_build_object(
    'valid', true, 'code', upper(v_promo.code),
    'promo_code_id', v_promo.id,
    'discount_type', v_promo.discount_type,
    'discount_value', v_promo.discount_value,
    'discount_amount', v_discount,
    'discountable_subtotal', v_discountable_subtotal,
    'maximum_discount_amount', v_promo.maximum_discount_amount,
    'minimum_order_amount', v_promo.minimum_order_amount
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
