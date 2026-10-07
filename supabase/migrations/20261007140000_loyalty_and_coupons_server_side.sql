-- Loyalty points and cart-recovery coupons move to the server.
--
-- An audit found these callable by any visitor through the public API key, with nothing inside to
-- stop them:
--
--   * rpc_award_order_loyalty_points: its "already awarded" check is on a key the caller chooses,
--     so the same order could be awarded points again and again (and it never asks whether the
--     order is paid).
--   * rpc_validate_and_redeem_loyalty_points: takes the customer id from the caller, so anyone who
--     knew a customer's id could spend that customer's points.
--   * rpc_generate_abandoned_cart_recovery_coupon: the caller chose the discount (up to 100%) and
--     nothing asked who the caller was.
--
-- The checkout used to call the first two from the shopper's browser after placing an order. It now
-- asks the Worker (src/lib/loyalty-checkout.functions.ts), which checks that the order is the
-- signed-in shopper's, takes the customer and the amounts from the order itself, derives the
-- idempotency key from the order, and calls these with the service role. So:
--
--   Server only (revoked from PUBLIC, anon, authenticated):
--     rpc_award_order_loyalty_points, rpc_validate_and_redeem_loyalty_points,
--     rpc_process_return_loyalty_adjustment, rpc_calculate_order_loyalty_points,
--     rpc_evaluate_customer_loyalty_tier  (the last three are only called from other functions)
--
--   Signed in only (revoked from PUBLIC, anon): rpc_generate_abandoned_cart_recovery_coupon, which
--   now also checks the caller can manage the brand, rpc_evaluate_brand_entitlements and
--   rpc_sync_legacy_brands_to_subscriptions (the admin screens call them signed in).
--
-- Loyalty is not used by any store yet (no program, no ledger row), so nothing live changes.

REVOKE EXECUTE ON FUNCTION public.rpc_award_order_loyalty_points(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_validate_and_redeem_loyalty_points(uuid, uuid, integer, numeric, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_process_return_loyalty_adjustment(uuid, uuid, uuid, integer, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_calculate_order_loyalty_points(uuid, uuid, numeric, numeric, numeric, numeric, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_evaluate_customer_loyalty_tier(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_evaluate_brand_entitlements(uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_sync_legacy_brands_to_subscriptions()
  FROM PUBLIC, anon;

-- The coupon generator: the same function as before (read from the live database on 2026-10-07),
-- with the check of who is asking added at the top and the arguments checked. The check is
-- "the server, or someone who can manage this brand", never "if there is a user, check them":
-- an anonymous caller has no user and would skip it.
CREATE OR REPLACE FUNCTION public.rpc_generate_abandoned_cart_recovery_coupon(p_brand_id uuid, p_cart_id uuid, p_discount_type text DEFAULT 'percentage'::text, p_discount_value numeric DEFAULT 10.0, p_expiry_hours integer DEFAULT 48)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
  v_cart public.abandoned_carts%ROWTYPE;
BEGIN
  IF NOT COALESCE(auth.role() = 'service_role' OR public.can_access_brand(p_brand_id), false) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_discount_type NOT IN ('percentage', 'fixed') OR p_discount_value IS NULL OR p_discount_value <= 0
     OR (p_discount_type = 'percentage' AND p_discount_value > 100) THEN
    RAISE EXCEPTION 'INVALID_DISCOUNT';
  END IF;

  SELECT * INTO v_cart
    FROM public.abandoned_carts
   WHERE id = p_cart_id AND brand_id = p_brand_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_cart.recovery_discount_code IS NOT NULL THEN
    RETURN v_cart.recovery_discount_code;
  END IF;

  v_code := 'CART-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.promo_codes (
    brand_id, code, discount_type, discount_value, max_redemptions,
    usage_limit_per_customer, end_date, is_active
  ) VALUES (
    p_brand_id, v_code, p_discount_type, p_discount_value, 1, 1,
    now() + make_interval(hours => GREATEST(p_expiry_hours, 1)), true
  );

  UPDATE public.abandoned_carts
     SET recovery_discount_code = v_code, updated_at = now()
   WHERE id = p_cart_id;
  RETURN v_code;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_generate_abandoned_cart_recovery_coupon(uuid, uuid, text, numeric, integer)
  FROM PUBLIC, anon;
