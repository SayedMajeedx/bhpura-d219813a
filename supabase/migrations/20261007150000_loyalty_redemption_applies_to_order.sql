-- Redeeming loyalty points now lowers what the order costs.
--
-- The checkout showed a "points discount" in its summary, but the order was placed without it:
-- place_storefront_order takes a promo code and no points, so the stored total (which the card is
-- charged, the courier collects and the invoice shows) stayed at the full price, while the points
-- were still taken from the customer's balance afterwards. Redemption was a number on the screen.
--
-- redeem_loyalty_points_for_order(order, points) does it in one transaction, from the order itself:
--   * it checks the order can still take a discount (unpaid, nothing advanced, not cancelled) and
--     has a customer, and that it was not redeemed before (the order records it);
--   * it takes the points through rpc_validate_and_redeem_loyalty_points (balance, minimum and the
--     programme's cap), measured against what is still to pay (subtotal less any promo discount),
--     so the discount can never exceed it;
--   * it adds the discount to the order's discount and recomputes the total the way a promo code
--     does in place_storefront_order: greatest(0, subtotal - discount) + shipping + tax_amount;
--   * it records the points and the discount on the order (loyalty_points_redeemed,
--     loyalty_discount).
-- Only the server calls it (the Worker, after checking the order is the signed-in shopper's), so it
-- is revoked from PUBLIC, anon and authenticated.
--
-- Additive: two defaulted columns and one function. No store uses loyalty yet.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS loyalty_points_redeemed integer NOT NULL DEFAULT 0
    CHECK (loyalty_points_redeemed >= 0),
  ADD COLUMN IF NOT EXISTS loyalty_discount numeric(14, 3) NOT NULL DEFAULT 0
    CHECK (loyalty_discount >= 0);

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
  v_total := GREATEST(0, v_order.subtotal - (v_order.discount + v_discount))
             + v_order.shipping + v_order.tax_amount;

  UPDATE public.orders
     SET discount = v_order.discount + v_discount,
         loyalty_points_redeemed = p_points,
         loyalty_discount = v_discount,
         total = v_total
   WHERE id = v_order.id;

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
