-- Bug #44: a store's loyalty points come off the price before tax.
--
-- Redeeming points (redeem_loyalty_points_for_order) treated them as a way of paying: the tax
-- stayed what it was before the points. The order editor (src/features/orders/lib/order-editor.ts)
-- and reprice_order_totals read the same points, kept in orders.discount, as a discount before
-- tax, so a 40.000 order with 3.000 of points at a store adding 10% VAT was charged 41.000 and
-- became 40.700 once staff saved it again.
--
-- The owner's decision (2026-10-24), as international practice treats a seller's own loyalty
-- scheme (EU VAT, UK HMRC, the GCC VAT laws; Shopify's discounts): points the store funds are a
-- discount given at the sale, so VAT is due on what the customer pays after them. The
-- redemption now adds the points to the order's discount and reprices the order through
-- reprice_order_totals, the rule the editor and a booking's offer already follow: 40.000 with
-- 3.000 of points and 10% VAT on top is 37.000 + 3.700 = 40.700; with VAT inside the prices it
-- is 37.000, of which 3.364 is tax. No live order has redeemed points (checked 2026-10-24), so
-- none is re-read.
--
-- The function is the one migration 20261024100000 left, its grants kept. Run in a real
-- Postgres with the live order builder and repricing by tests/order-tax-parity.test.ts, against
-- the checkout's twin orderTotals (src/lib/order-tax.ts).

CREATE OR REPLACE FUNCTION public.redeem_loyalty_points_for_order(p_order_id uuid, p_points integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_room numeric;
  v_result jsonb;
  v_discount numeric(14, 3);
  v_total numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;
  IF v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CUSTOMER_REQUIRED');
  END IF;

  -- Done before: the order says so. Nothing is taken or changed twice.
  IF v_order.loyalty_points_redeemed > 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_redeemed', true,
      'points_redeemed', v_order.loyalty_points_redeemed,
      'discount_amount', v_order.loyalty_discount,
      'new_total', v_order.total
    );
  END IF;

  IF p_points IS NULL OR p_points <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_POINTS');
  END IF;
  IF lower(COALESCE(v_order.payment_status, 'unpaid')) <> 'unpaid'
     OR COALESCE(v_order.advance_paid, 0) > 0
     OR lower(COALESCE(v_order.status, '')) IN ('cancelled', 'canceled', 'refunded') THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_PAYABLE');
  END IF;

  v_room := GREATEST(v_order.subtotal - v_order.discount, 0);
  v_result := public.rpc_validate_and_redeem_loyalty_points(
    v_order.brand_id, v_order.customer_id, p_points, v_room, 'redeem:' || v_order.id::text, v_order.id
  );
  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RETURN v_result;
  END IF;
  IF COALESCE((v_result->>'already_redeemed')::boolean, false) THEN
    -- Points were taken for this order but the order does not show it: refuse rather than guess.
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_REDEEMED');
  END IF;

  v_discount := LEAST(ROUND((v_result->>'discount_amount')::numeric, 3), v_room);

  -- The store's own points are a discount on the price: they join the order's discount and the
  -- tax is worked out again on what is left, by the one rule every discount goes through
  -- (reprice_order_totals: the order's own rate, prices with or without VAT).
  UPDATE public.orders
     SET discount = v_order.discount + v_discount,
         loyalty_points_redeemed = p_points,
         loyalty_discount = v_discount
   WHERE id = v_order.id;
  PERFORM public.reprice_order_totals(v_order.id);
  SELECT total INTO v_total FROM public.orders WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'success', true,
    'points_redeemed', p_points,
    'discount_amount', v_discount,
    'new_total', v_total
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.redeem_loyalty_points_for_order(uuid, integer)
  FROM PUBLIC, anon, authenticated;
