-- Bug #43: points taken off an order added its VAT again when the store's prices include it.
--
-- redeem_loyalty_points_for_order (migration 20261007150000) wrote the order's total as
-- subtotal - (discount + points) + shipping + tax_amount. Where prices exclude VAT that is right:
-- the tax stays as it was before the points and is added on top. Where prices include VAT
-- (business_settings.vat_inclusive) the tax is already inside the subtotal, so a 40.000 order
-- with 3.000 of points came to 40.636 instead of 37.000. No live store includes VAT in its prices
-- today (checked 2026-10-24), so no order was charged it.
--
-- The function is the live one with the store's vat_inclusive read and the tax added only where
-- prices exclude it, as the order builder and reprice_order_totals already do. The tax recorded
-- on the order is unchanged either way. Its grants are kept (CREATE OR REPLACE). Run in a real
-- Postgres with the live order builder by tests/order-tax-parity.test.ts, against the checkout's
-- twin orderTotals (src/lib/order-tax.ts).

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
  v_inclusive boolean;
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
  -- The points lower what is paid and leave the order's tax as it was. A store whose prices
  -- include VAT has the tax inside the subtotal already (as the order builder and
  -- reprice_order_totals read it): it is added again only where prices exclude it.
  SELECT COALESCE(vat_inclusive, false) INTO v_inclusive
    FROM public.business_settings WHERE brand_id = v_order.brand_id;
  v_total := GREATEST(0, v_order.subtotal - (v_order.discount + v_discount))
             + v_order.shipping
             + CASE WHEN COALESCE(v_inclusive, false) THEN 0 ELSE v_order.tax_amount END;

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
