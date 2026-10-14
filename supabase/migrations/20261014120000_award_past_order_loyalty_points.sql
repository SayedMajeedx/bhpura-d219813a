-- Migration: 20261014120000_award_past_order_loyalty_points.sql
--
-- Points for the orders a store had before its programme earned anything.
--
-- The points engine (migration 20261014110000) gives an order its points when it becomes
-- completed or paid. Orders that were already completed or paid before it, or before the store
-- saved its programme, never pass that moment again. award_past_order_loyalty_points(brand) gives
-- them their points once, as the store's rules say today:
--   * every order that earns (loyalty_order_earns) and has no points yet, oldest first, through
--     the award function with the engine's own key ('award:<order>'), so no order is ever given
--     points twice, by this or by the engine;
--   * dated from when the order was handed over (delivered_at, else completed_at, else when it
--     was placed): the holding period and the expiry count from there, not from today, and what
--     is already past its holding period is made available at once;
--   * nothing while the store's programme is not on.
-- It is run by the owner, once per store (server-only):
--   select public.award_past_order_loyalty_points('<brand id>');
--
-- The first-order bonus also changes: it went only to a customer with no other order at all, so a
-- customer with two orders got it on neither. It now goes to the customer's earliest order that
-- earns, once.
--
-- Tested in a real Postgres by tests/loyalty-past-orders-migration.test.ts.

CREATE OR REPLACE FUNCTION public.rpc_award_order_loyalty_points(
  p_brand_id uuid,
  p_order_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_program brand_loyalty_programs%ROWTYPE;
  v_account loyalty_accounts%ROWTYPE;
  v_calc jsonb;
  v_points_to_earn integer;
  v_holding_days integer;
  v_effective_at timestamptz;
  v_expires_at timestamptz;
  v_is_first_order boolean := false;
  v_first_order_bonus integer := 0;
  v_total_awarded integer := 0;
  v_existing_ledger loyalty_ledger%ROWTYPE;
  v_balance_after integer := 0;
BEGIN
  -- Idempotency check
  SELECT * INTO v_existing_ledger FROM public.loyalty_ledger
  WHERE brand_id = p_brand_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_awarded', true, 'points', v_existing_ledger.points);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND brand_id = p_brand_id;
  IF NOT FOUND OR v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valid order with customer required');
  END IF;

  SELECT * INTO v_program FROM public.brand_loyalty_programs WHERE brand_id = p_brand_id;
  IF NOT FOUND OR v_program.is_enabled = false THEN
    RETURN jsonb_build_object('success', true, 'awarded', 0, 'message', 'Loyalty disabled');
  END IF;

  -- Ensure account exists
  INSERT INTO public.loyalty_accounts (brand_id, customer_id, current_tier_key)
  VALUES (p_brand_id, v_order.customer_id, 'bronze')
  ON CONFLICT (brand_id, customer_id) DO NOTHING;

  SELECT * INTO v_account FROM public.loyalty_accounts
  WHERE brand_id = p_brand_id AND customer_id = v_order.customer_id;

  -- Calculate points
  v_calc := public.rpc_calculate_order_loyalty_points(
    p_brand_id,
    v_order.customer_id,
    v_order.subtotal,
    v_order.discount,
    v_order.tax_amount,
    v_order.shipping,
    COALESCE(v_order.discount, 0) > 0
  );

  v_points_to_earn := COALESCE((v_calc->>'points_to_earn')::integer, 0);
  v_holding_days := COALESCE(v_program.holding_period_days, 14);

  IF v_holding_days > 0 THEN
    v_effective_at := now() + (v_holding_days || ' days')::interval;
  ELSE
    v_effective_at := now();
  END IF;

  IF v_program.points_expiry_days > 0 THEN
    v_expires_at := v_effective_at + (v_program.points_expiry_days || ' days')::interval;
  ELSE
    v_expires_at := NULL;
  END IF;

  -- The first-order bonus goes to the customer's earliest order that earns, once: not when
  -- the customer has no other order at all (a customer with two orders got it on neither).
  SELECT NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE brand_id = p_brand_id AND customer_id = v_order.customer_id AND id <> p_order_id
      AND (created_at, id) < (v_order.created_at, v_order.id)
      AND public.loyalty_order_earns(status, payment_status, customer_id)
  ) AND NOT EXISTS (
    SELECT 1 FROM public.loyalty_ledger
    WHERE brand_id = p_brand_id AND customer_id = v_order.customer_id
      AND event_type = 'earn_first_order' AND points_status <> 'cancelled'
  ) INTO v_is_first_order;

  IF v_is_first_order AND v_program.first_order_bonus_points > 0 THEN
    v_first_order_bonus := v_program.first_order_bonus_points;
  END IF;

  v_total_awarded := v_points_to_earn + v_first_order_bonus;
  IF v_total_awarded <= 0 THEN
    RETURN jsonb_build_object('success', true, 'points', 0);
  END IF;

  -- Update account balances
  IF v_holding_days > 0 THEN
    UPDATE public.loyalty_accounts
    SET pending_points = pending_points + v_total_awarded,
        lifetime_points = lifetime_points + v_total_awarded,
        updated_at = now()
    WHERE id = v_account.id
    RETURNING active_points INTO v_balance_after;
  ELSE
    UPDATE public.loyalty_accounts
    SET active_points = active_points + v_total_awarded,
        lifetime_points = lifetime_points + v_total_awarded,
        updated_at = now()
    WHERE id = v_account.id
    RETURNING active_points INTO v_balance_after;
  END IF;

  -- Log into Ledger
  INSERT INTO public.loyalty_ledger (
    brand_id, customer_id, account_id, event_type, points,
    points_status, order_id, effective_at, expires_at,
    idempotency_key, reference_note_ar, reference_note_en,
    balance_after
  ) VALUES (
    p_brand_id, v_order.customer_id, v_account.id,
    CASE WHEN v_first_order_bonus > 0 THEN 'earn_first_order' ELSE 'earn_order' END,
    v_total_awarded,
    CASE WHEN v_holding_days > 0 THEN 'pending' ELSE 'active' END,
    p_order_id, v_effective_at, v_expires_at,
    p_idempotency_key,
    'نقاط مكتسبة عن الطلب #' || COALESCE(v_order.invoice_number::text, ''),
    'Points earned for Order #' || COALESCE(v_order.invoice_number::text, ''),
    v_balance_after
  );

  -- Re-evaluate Tier
  PERFORM public.rpc_evaluate_customer_loyalty_tier(p_brand_id, v_order.customer_id);

  RETURN jsonb_build_object(
    'success', true,
    'points_awarded', v_total_awarded,
    'effective_at', v_effective_at,
    'status', CASE WHEN v_holding_days > 0 THEN 'pending' ELSE 'active' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.award_past_order_loyalty_points(p_brand_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_program brand_loyalty_programs%ROWTYPE;
  v_order record;
  v_result jsonb;
  v_points integer;
  v_from timestamptz;
  v_orders integer := 0;
  v_total integer := 0;
BEGIN
  SELECT * INTO v_program FROM public.brand_loyalty_programs WHERE brand_id = p_brand_id;
  IF NOT FOUND OR v_program.is_enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROGRAMME_NOT_ON');
  END IF;

  FOR v_order IN
    SELECT o.id, o.created_at, o.delivered_at, o.completed_at
    FROM public.orders o
    WHERE o.brand_id = p_brand_id
      AND public.loyalty_order_earns(o.status, o.payment_status, o.customer_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.loyalty_ledger l
        WHERE l.brand_id = p_brand_id AND l.order_id = o.id
          AND l.event_type IN ('earn_order', 'earn_first_order')
      )
    ORDER BY o.created_at, o.id
  LOOP
    v_result := public.rpc_award_order_loyalty_points(p_brand_id, v_order.id, 'award:' || v_order.id);
    v_points := COALESCE((v_result->>'points_awarded')::integer, 0);
    CONTINUE WHEN v_points <= 0;

    -- Dated from the hand-over, as if the engine had been there.
    v_from := COALESCE(v_order.delivered_at, v_order.completed_at, v_order.created_at);
    UPDATE public.loyalty_ledger
    SET effective_at = v_from + make_interval(days => v_program.holding_period_days),
        expires_at = CASE
          WHEN v_program.points_expiry_days > 0
            THEN v_from + make_interval(days => v_program.holding_period_days + v_program.points_expiry_days)
          ELSE NULL
        END
    WHERE brand_id = p_brand_id AND idempotency_key = 'award:' || v_order.id;

    v_orders := v_orders + 1;
    v_total := v_total + v_points;
  END LOOP;

  -- What is already past its holding period is available now, not at the next hourly run.
  PERFORM public.release_due_loyalty_points();

  RETURN jsonb_build_object('success', true, 'orders', v_orders, 'points', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.award_past_order_loyalty_points(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_past_order_loyalty_points(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.rpc_award_order_loyalty_points(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_award_order_loyalty_points(uuid, uuid, text) TO service_role;
