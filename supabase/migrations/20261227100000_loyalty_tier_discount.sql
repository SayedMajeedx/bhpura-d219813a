-- A loyalty tier's discount, given by the order builder (improvement 2 of the final report,
-- 2026-11-27, second part). `brand_loyalty_tiers.discount_percent` was saved and given by nothing,
-- so the loyalty pages hid it.
--
-- The owner's decision of 2026-11-27: a member gets **the larger** of their tier's discount and
-- what the promo code and the store's offers take off, never both. So on a storefront order whose
-- customer is the signed-in shopper (as the tier's free delivery already reads it), while the
-- programme is on: the tier's percentage of the order's lines (before a gift's own lines, which no
-- discount reaches) is weighed against the code and the offers; when it saves more it replaces
-- them (the code is left unused, a free-delivery offer still stands) and is kept as
-- `orders.tier_discount`, a part of `orders.discount` like `offer_discount`. The tax follows, as
-- for any discount. A booking's order and staff orders are not touched.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tier_discount numeric(14,3) NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.orders.tier_discount IS
  'The part of discount that is the customer''s loyalty tier discount (written by the order builder).';

-- The signed-in member's tier discount on an order: its percentage and amount (none: not the
-- caller's own order, no programme, or a tier with no discount).
CREATE OR REPLACE FUNCTION public.member_tier_discount(p_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
           'tier_key', t.tier_key,
           'name_ar', t.name_ar,
           'name_en', t.name_en,
           'percent', LEAST(t.discount_percent, 100),
           'amount', round(greatest(o.subtotal, 0) * LEAST(t.discount_percent, 100) / 100, 3)
         )
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id AND c.auth_user_id = auth.uid()
    JOIN public.brand_loyalty_programs lp ON lp.brand_id = o.brand_id AND lp.is_enabled IS TRUE
    JOIN public.loyalty_accounts la ON la.brand_id = o.brand_id AND la.customer_id = c.id
    JOIN public.brand_loyalty_tiers t
      ON t.brand_id = o.brand_id AND t.tier_key = la.current_tier_key AND t.discount_percent > 0
   WHERE o.id = p_order_id AND auth.uid() IS NOT NULL
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.member_tier_discount(uuid) FROM PUBLIC, anon, authenticated;

-- The live function (migration 20261208100000) with the member's tier weighed last.
CREATE OR REPLACE FUNCTION public.apply_store_offers(p_order_id uuid, p_fulfillment text, p_country text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_mode text;
  v_lines jsonb;
  v_has_code boolean;
  v_out jsonb;
  -- ADDED (20261227100000)
  v_tier jsonb;
  v_tier_amount numeric;
  v_discount numeric;
  v_kept jsonb;
BEGIN
  IF current_setting('boutq.booking_order', true) = 'on' THEN
    RETURN jsonb_build_object('offer_discount', 0, 'code_discount', 0, 'code_kept', true,
      'code_dropped', false, 'free_delivery', false, 'applied', '[]'::jsonb);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(s.offers_combine, 'best') INTO v_mode
    FROM public.business_settings s WHERE s.brand_id = v_order.brand_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'product_id', oi.product_id,
           'category', p.category,
           'quantity', oi.quantity,
           'line_total', oi.line_total,
           'on_sale', COALESCE(COALESCE(pv.original_price, 0) > pv.selling_price, false),
           -- ADDED (20261208100000): a piece made to the customer's order.
           'made_to_order', COALESCE(oi.location = 'custom', false)
         ) ORDER BY oi.id), '[]'::jsonb)
    INTO v_lines
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
   WHERE oi.order_id = p_order_id;

  v_has_code := v_order.promo_code_id IS NOT NULL OR NULLIF(btrim(COALESCE(v_order.promo_code, '')), '') IS NOT NULL;

  v_out := public.store_offers_outcome(
    -- ADDED (20261205100000): an area offer only for an address in one of its areas.
    public.store_offers_for_area(
      public.store_offers_live(v_order.brand_id, now()),
      v_order.delivery_address_snapshot ->> 'region',
      p_country
    ),
    v_lines,
    COALESCE(v_mode, 'best'),
    CASE WHEN v_has_code THEN v_order.discount ELSE 0 END,
    p_fulfillment,
    p_country
  );

  UPDATE public.orders
     SET discount = CASE WHEN v_has_code THEN 0 ELSE discount END
                    + (v_out ->> 'code_discount')::numeric
                    + (v_out ->> 'offer_discount')::numeric,
         offer_discount = (v_out ->> 'offer_discount')::numeric,
         applied_offers = v_out -> 'applied',
         promo_code = CASE WHEN (v_out ->> 'code_dropped')::boolean THEN NULL ELSE promo_code END,
         promo_code_id = CASE WHEN (v_out ->> 'code_dropped')::boolean THEN NULL ELSE promo_code_id END
   WHERE id = p_order_id
  RETURNING discount INTO v_discount;

  -- ADDED (20261227100000): the signed-in member's tier discount, when it saves more than the code
  -- and the offers together, takes their place; a free-delivery offer still stands.
  v_tier := public.member_tier_discount(p_order_id);
  v_tier_amount := COALESCE((v_tier ->> 'amount')::numeric, 0);
  IF v_tier_amount > COALESCE(v_discount, 0) THEN
    SELECT COALESCE(jsonb_agg(a), '[]'::jsonb) INTO v_kept
      FROM jsonb_array_elements(COALESCE(v_out -> 'applied', '[]'::jsonb)) a
     WHERE a ->> 'kind' = 'free_delivery';
    UPDATE public.orders
       SET discount = v_tier_amount,
           offer_discount = 0,
           tier_discount = v_tier_amount,
           applied_offers = v_kept,
           promo_code = NULL,
           promo_code_id = NULL
     WHERE id = p_order_id;
    v_out := v_out || jsonb_build_object(
      'offer_discount', 0,
      'code_discount', 0,
      'code_kept', false,
      'code_dropped', v_has_code OR COALESCE((v_out ->> 'code_dropped')::boolean, false),
      'applied', v_kept,
      'tier_discount', v_tier_amount,
      'tier', v_tier
    );
  END IF;

  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_store_offers(uuid, text, text) FROM PUBLIC, anon, authenticated;
