-- Migration: 20261014110000_loyalty_points_follow_the_order.sql
--
-- Loyalty points follow the order, whoever wrote it.
--
-- Before this, an order earned points in one place only: the storefront's checkout asked for
-- them, for a signed-in shopper, the moment the order was placed. An order made by staff never
-- earned (all of Pura's orders), an order placed and then cancelled kept its points, a refund
-- took nothing back, and the points earned were held for the holding period with nothing to
-- release them: they stayed "pending" for good. Points never expired either.
--
-- 1. An order earns its points when it counts as earned: it has a customer, it is completed or
--    paid, and it was not undone. The trigger asks the existing award function, with the same
--    key the checkout used ('award:<order>'), so an order the checkout already rewarded is not
--    rewarded twice. An order that is undone (cancelled, refunded, voided, failed, returned, or
--    its payment refunded) gives back what it still holds: held points first, then available
--    ones, never more than the account has. An order put back after that earns again, once.
--    A problem with points never stops an order from being saved: it is reported as a warning.
-- 2. release_due_loyalty_points(), every hour: held points whose holding period is over become
--    available.
-- 3. expire_loyalty_points(), every night: points past their expiry date go, oldest first, after
--    what the customer already spent (spending takes the points that expire first).
-- 4. The award and the return adjustment could not write to the ledger (an integer invoice
--    number joined to text): fixed below.
-- 5. A customer's tier counts the orders that count as sold (the reading of
--    src/lib/data/orders/sold-orders.ts), not unpaid or pending ones.
--
-- Tested in a real Postgres by tests/loyalty-follows-order-migration.test.ts.

-- ---------------------------------------------------------------------------------------------
-- When an order earns, and when it was undone.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.loyalty_order_undone(p_status text, p_payment_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(COALESCE(p_status, '')) IN ('cancelled', 'canceled', 'refunded', 'voided', 'failed', 'returned')
      OR lower(COALESCE(p_payment_status, '')) = 'refunded';
$$;

CREATE OR REPLACE FUNCTION public.loyalty_order_earns(p_status text, p_payment_status text, p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_customer_id IS NOT NULL
     AND NOT public.loyalty_order_undone(p_status, p_payment_status)
     AND lower(COALESCE(p_status, '')) NOT IN ('draft', 'archived_historical', 'benefit_rejected')
     AND (lower(COALESCE(p_status, '')) = 'completed' OR lower(COALESCE(p_payment_status, '')) = 'paid');
$$;

-- ---------------------------------------------------------------------------------------------
-- The award and the return adjustment wrote COALESCE(invoice_number, '') into the ledger's note:
-- the invoice number is an integer, '' is not one, so each failed as soon as it reached the
-- ledger. Redefined from their own text with the number written as text, nothing else changed.
-- ---------------------------------------------------------------------------------------------

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

  -- Check if first order bonus applies
  SELECT NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE brand_id = p_brand_id AND customer_id = v_order.customer_id AND id <> p_order_id
      AND lower(COALESCE(status, '')) NOT IN ('cancelled')
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

CREATE OR REPLACE FUNCTION public.rpc_process_return_loyalty_adjustment(
  p_brand_id uuid,
  p_order_id uuid,
  p_return_id uuid,
  p_pro_rated_points_to_revoke integer,
  p_pro_rated_points_to_refund integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_account loyalty_accounts%ROWTYPE;
  v_existing_ledger loyalty_ledger%ROWTYPE;
  v_balance_after integer := 0;
BEGIN
  -- Idempotency check
  SELECT * INTO v_existing_ledger FROM public.loyalty_ledger
  WHERE brand_id = p_brand_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND brand_id = p_brand_id;
  IF NOT FOUND OR v_order.customer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  SELECT * INTO v_account FROM public.loyalty_accounts
  WHERE brand_id = p_brand_id AND customer_id = v_order.customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Loyalty account not found');
  END IF;

  -- 1. Revoke unearned points (deduct from pending or active)
  IF p_pro_rated_points_to_revoke > 0 THEN
    IF v_account.pending_points >= p_pro_rated_points_to_revoke THEN
      UPDATE public.loyalty_accounts
      SET pending_points = pending_points - p_pro_rated_points_to_revoke,
          lifetime_points = GREATEST(0, lifetime_points - p_pro_rated_points_to_revoke),
          updated_at = now()
      WHERE id = v_account.id;
    ELSE
      UPDATE public.loyalty_accounts
      SET active_points = GREATEST(0, active_points - (p_pro_rated_points_to_revoke - v_account.pending_points)),
          pending_points = 0,
          lifetime_points = GREATEST(0, lifetime_points - p_pro_rated_points_to_revoke),
          updated_at = now()
      WHERE id = v_account.id;
    END IF;

    INSERT INTO public.loyalty_ledger (
      brand_id, customer_id, account_id, event_type, points,
      points_status, order_id, effective_at, idempotency_key,
      reference_note_ar, reference_note_en, balance_after
    ) VALUES (
      p_brand_id, v_order.customer_id, v_account.id, 'revoke_cancelled',
      -p_pro_rated_points_to_revoke, 'cancelled', p_order_id, now(),
      p_idempotency_key || '_revoke',
      'إلغاء نقاط مكتسبة عن مرتجع/إلغاء الطلب #' || COALESCE(v_order.invoice_number::text, ''),
      'Revoked earned points on return/cancellation for Order #' || COALESCE(v_order.invoice_number::text, ''),
      v_account.active_points
    );
  END IF;

  -- 2. Refund redeemed points back to customer active balance
  IF p_pro_rated_points_to_refund > 0 THEN
    UPDATE public.loyalty_accounts
    SET active_points = active_points + p_pro_rated_points_to_refund,
        lifetime_spent_points = GREATEST(0, lifetime_spent_points - p_pro_rated_points_to_refund),
        updated_at = now()
    WHERE id = v_account.id
    RETURNING active_points INTO v_balance_after;

    INSERT INTO public.loyalty_ledger (
      brand_id, customer_id, account_id, event_type, points,
      points_status, order_id, effective_at, idempotency_key,
      reference_note_ar, reference_note_en, balance_after
    ) VALUES (
      p_brand_id, v_order.customer_id, v_account.id, 'refund_return',
      p_pro_rated_points_to_refund, 'active', p_order_id, now(),
      p_idempotency_key || '_refund',
      'إعادة نقاط مستخدمة لمرتجع الطلب #' || COALESCE(v_order.invoice_number::text, ''),
      'Refunded spent points on return for Order #' || COALESCE(v_order.invoice_number::text, ''),
      v_balance_after
    );
  END IF;

  -- Re-evaluate Tier
  PERFORM public.rpc_evaluate_customer_loyalty_tier(p_brand_id, v_order.customer_id);

  RETURN jsonb_build_object(
    'success', true,
    'points_revoked', p_pro_rated_points_to_revoke,
    'points_refunded', p_pro_rated_points_to_refund
  );
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- Taking back what an undone order still holds.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.loyalty_revoke_order_points(p_order_id uuid, p_idempotency_key text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_account loyalty_accounts%ROWTYPE;
  v_remaining integer;
  v_held integer;
  v_from_pending integer;
  v_from_active integer;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.customer_id IS NULL THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.loyalty_ledger
    WHERE brand_id = v_order.brand_id AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_account FROM public.loyalty_accounts
  WHERE brand_id = v_order.brand_id AND customer_id = v_order.customer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- What the order earned, less what was already taken back (by this engine or a return).
  SELECT GREATEST(0, COALESCE(SUM(points), 0))::integer INTO v_remaining
  FROM public.loyalty_ledger
  WHERE brand_id = v_order.brand_id AND order_id = p_order_id
    AND event_type IN ('earn_order', 'earn_first_order', 'revoke_cancelled');
  IF v_remaining = 0 THEN
    RETURN 0;
  END IF;

  -- Held first: what this order's earnings still hold in the pending balance.
  SELECT COALESCE(SUM(points), 0)::integer INTO v_held
  FROM public.loyalty_ledger
  WHERE brand_id = v_order.brand_id AND order_id = p_order_id
    AND event_type IN ('earn_order', 'earn_first_order') AND points_status = 'pending';

  v_from_pending := LEAST(v_remaining, v_held, v_account.pending_points);
  v_from_active := LEAST(v_remaining - v_from_pending, v_account.active_points);

  UPDATE public.loyalty_accounts
  SET pending_points = pending_points - v_from_pending,
      active_points = active_points - v_from_active,
      lifetime_points = GREATEST(0, lifetime_points - (v_from_pending + v_from_active)),
      updated_at = now()
  WHERE id = v_account.id;

  -- The order's earnings are no longer the customer's: never released, never expired.
  UPDATE public.loyalty_ledger
  SET points_status = 'cancelled'
  WHERE brand_id = v_order.brand_id AND order_id = p_order_id
    AND event_type IN ('earn_order', 'earn_first_order') AND points_status IN ('pending', 'active');

  INSERT INTO public.loyalty_ledger (
    brand_id, customer_id, account_id, event_type, points, points_status, order_id,
    effective_at, idempotency_key, reference_note_ar, reference_note_en, balance_after
  ) VALUES (
    v_order.brand_id, v_order.customer_id, v_account.id, 'revoke_cancelled',
    -(v_from_pending + v_from_active), 'cancelled', p_order_id, now(), p_idempotency_key,
    'استرجاع نقاط الطلب #' || COALESCE(v_order.invoice_number::text, '') || ' بعد إلغائه أو استرداده',
    'Points taken back: order #' || COALESCE(v_order.invoice_number::text, '') || ' was cancelled or refunded',
    v_account.active_points - v_from_active
  );

  PERFORM public.rpc_evaluate_customer_loyalty_tier(v_order.brand_id, v_order.customer_id);
  RETURN v_from_pending + v_from_active;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- The trigger: an order's points follow its state.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.orders_loyalty_follows_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_awards integer;
  v_revokes integer;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE event_type IN ('earn_order', 'earn_first_order')),
      COUNT(*) FILTER (WHERE event_type = 'revoke_cancelled' AND idempotency_key LIKE 'revoke:%')
    INTO v_awards, v_revokes
    FROM public.loyalty_ledger
    WHERE brand_id = NEW.brand_id AND order_id = NEW.id;

    IF public.loyalty_order_earns(NEW.status, NEW.payment_status, NEW.customer_id)
       AND v_awards <= v_revokes THEN
      -- The first award keeps the checkout's key, so an order it rewarded is not rewarded again.
      PERFORM public.rpc_award_order_loyalty_points(
        NEW.brand_id,
        NEW.id,
        CASE WHEN v_awards = 0 THEN 'award:' || NEW.id ELSE 'award:' || NEW.id || ':' || (v_awards + 1) END
      );
    ELSIF public.loyalty_order_undone(NEW.status, NEW.payment_status) AND v_awards > v_revokes THEN
      PERFORM public.loyalty_revoke_order_points(NEW.id, 'revoke:' || NEW.id || ':' || v_awards);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'loyalty points for order % were not updated: %', NEW.id, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

-- On a change of the values themselves, not of the columns an UPDATE names: the screens write
-- the stage (fulfillment_status) and a BEFORE trigger sets the status to completed
-- (trg_orders_status_follows_fulfillment); a payment becomes paid through what was collected
-- (trg_orders_payment_amounts). `UPDATE OF status` would miss both.
DROP TRIGGER IF EXISTS trg_orders_loyalty_follows_order ON public.orders;
DROP TRIGGER IF EXISTS trg_orders_loyalty_follows_order_insert ON public.orders;
CREATE TRIGGER trg_orders_loyalty_follows_order_insert
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.orders_loyalty_follows_order();
CREATE TRIGGER trg_orders_loyalty_follows_order
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
  OR OLD.customer_id IS DISTINCT FROM NEW.customer_id
)
EXECUTE FUNCTION public.orders_loyalty_follows_order();

-- ---------------------------------------------------------------------------------------------
-- Held points become available when their holding period is over.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_due_loyalty_points()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row record;
  v_released integer := 0;
BEGIN
  FOR v_row IN
    SELECT l.id, l.account_id, l.points
    FROM public.loyalty_ledger l
    WHERE l.points_status = 'pending' AND l.effective_at <= now() AND l.points > 0
    ORDER BY l.effective_at
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Never more than the account still holds (a return may have taken some back already).
    UPDATE public.loyalty_accounts
    SET pending_points = pending_points - LEAST(v_row.points, pending_points),
        active_points = active_points + LEAST(v_row.points, pending_points),
        updated_at = now()
    WHERE id = v_row.account_id;

    UPDATE public.loyalty_ledger SET points_status = 'active' WHERE id = v_row.id;
    v_released := v_released + 1;
  END LOOP;
  RETURN v_released;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- Points past their expiry date go, after what the customer already spent.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expire_loyalty_points()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_account loyalty_accounts%ROWTYPE;
  v_due integer;
  v_spent integer;
  v_expired integer;
  v_to_expire integer;
  v_accounts integer := 0;
BEGIN
  FOR v_account IN
    SELECT a.* FROM public.loyalty_accounts a
    WHERE EXISTS (
      SELECT 1 FROM public.loyalty_ledger l
      WHERE l.account_id = a.id AND l.points_status = 'active' AND l.points > 0
        AND l.expires_at IS NOT NULL AND l.expires_at <= now()
    )
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Everything earned that has reached its expiry date (counted again each night, so what
    -- expired before is subtracted below).
    SELECT COALESCE(SUM(points), 0)::integer INTO v_due
    FROM public.loyalty_ledger
    WHERE account_id = v_account.id AND points > 0 AND points_status IN ('active', 'expired')
      AND expires_at IS NOT NULL AND expires_at <= now();

    -- Spending takes the points that expire first.
    SELECT COALESCE(-SUM(points), 0)::integer INTO v_spent
    FROM public.loyalty_ledger
    WHERE account_id = v_account.id AND points < 0 AND event_type IN ('redeem_checkout', 'adjust_manual');

    SELECT COALESCE(-SUM(points), 0)::integer INTO v_expired
    FROM public.loyalty_ledger
    WHERE account_id = v_account.id AND event_type = 'expire_points';

    v_to_expire := LEAST(v_account.active_points, GREATEST(0, v_due - v_spent - v_expired));

    IF v_to_expire > 0 THEN
      UPDATE public.loyalty_accounts
      SET active_points = active_points - v_to_expire, updated_at = now()
      WHERE id = v_account.id;

      INSERT INTO public.loyalty_ledger (
        brand_id, customer_id, account_id, event_type, points, points_status, effective_at,
        idempotency_key, reference_note_ar, reference_note_en, balance_after
      ) VALUES (
        v_account.brand_id, v_account.customer_id, v_account.id, 'expire_points', -v_to_expire,
        'expired', now(), 'expire:' || v_account.id || ':' || extract(epoch FROM clock_timestamp())::text,
        'انتهت صلاحية النقاط', 'Points expired', v_account.active_points - v_to_expire
      );
      v_accounts := v_accounts + 1;
    END IF;

    UPDATE public.loyalty_ledger
    SET points_status = 'expired'
    WHERE account_id = v_account.id AND points_status = 'active' AND points > 0
      AND expires_at IS NOT NULL AND expires_at <= now();
  END LOOP;
  RETURN v_accounts;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- A tier counts the orders that count as sold.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_evaluate_customer_loyalty_tier(p_brand_id uuid, p_customer_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_account loyalty_accounts%ROWTYPE;
  v_total_spend numeric := 0;
  v_tier_row brand_loyalty_tiers%ROWTYPE;
  v_assigned_tier text := 'bronze';
BEGIN
  INSERT INTO public.loyalty_accounts (brand_id, customer_id, current_tier_key)
  VALUES (p_brand_id, p_customer_id, 'bronze')
  ON CONFLICT (brand_id, customer_id) DO NOTHING;

  SELECT * INTO v_account FROM public.loyalty_accounts
  WHERE brand_id = p_brand_id AND customer_id = p_customer_id;

  -- The orders that count as sold (src/lib/data/orders/sold-orders.ts): not a draft, not waiting
  -- to be confirmed, not undone.
  SELECT COALESCE(SUM(total), 0) INTO v_total_spend
  FROM public.orders
  WHERE brand_id = p_brand_id
    AND customer_id = p_customer_id
    AND COALESCE(trim(status), '') <> ''
    AND lower(trim(status)) NOT IN (
      'draft', 'pending', 'pending_verification', 'benefit_rejected', 'cancelled', 'canceled',
      'refunded', 'voided', 'failed', 'returned', 'archived_historical'
    );

  FOR v_tier_row IN
    SELECT * FROM public.brand_loyalty_tiers
    WHERE brand_id = p_brand_id
    ORDER BY min_spend DESC, min_points DESC
  LOOP
    IF v_total_spend >= v_tier_row.min_spend AND v_account.lifetime_points >= v_tier_row.min_points THEN
      v_assigned_tier := v_tier_row.tier_key;
      EXIT;
    END IF;
  END LOOP;

  IF v_account.current_tier_key IS DISTINCT FROM v_assigned_tier THEN
    UPDATE public.loyalty_accounts
    SET current_tier_key = v_assigned_tier,
        tier_achieved_at = now(),
        updated_at = now()
    WHERE id = v_account.id;
  END IF;

  RETURN v_assigned_tier;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- Nobody calls these from a browser: the trigger and the scheduler do.
-- ---------------------------------------------------------------------------------------------

-- Redefined above: kept server-only as migration 20261007140000 made them.
REVOKE ALL ON FUNCTION public.rpc_award_order_loyalty_points(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_process_return_loyalty_adjustment(uuid, uuid, uuid, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_award_order_loyalty_points(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_process_return_loyalty_adjustment(uuid, uuid, uuid, integer, integer, text) TO service_role;
REVOKE ALL ON FUNCTION public.loyalty_revoke_order_points(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orders_loyalty_follows_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_due_loyalty_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_loyalty_points() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_evaluate_customer_loyalty_tier(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_revoke_order_points(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_due_loyalty_points() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_loyalty_points() TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_evaluate_customer_loyalty_tier(uuid, uuid) TO service_role;

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'loyalty_release_hourly') THEN
      PERFORM cron.unschedule('loyalty_release_hourly');
    END IF;
    PERFORM cron.schedule('loyalty_release_hourly', '11 * * * *', 'SELECT public.release_due_loyalty_points();');

    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'loyalty_expire_nightly') THEN
      PERFORM cron.unschedule('loyalty_expire_nightly');
    END IF;
    PERFORM cron.schedule('loyalty_expire_nightly', '41 0 * * *', 'SELECT public.expire_loyalty_points();');
  END IF;
END $$;
