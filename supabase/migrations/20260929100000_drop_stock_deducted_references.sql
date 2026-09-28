-- Migration: 20260929100000_drop_stock_deducted_references.sql
--
-- 20260927100000 dropped orders.stock_deducted and orders.stock_snapshot, but
-- three functions still wrote them:
--
--   * order_inventory_transition(uuid): run by trg_orders_inventory on every
--     order insert and update, so creating an order or changing its status
--     failed with 'column "stock_deducted" of relation "orders" does not exist'.
--   * release_card_stock_on_terminal_payment(): the pre-ledger trigger
--     function. No trigger uses it any more (trg_release_card_stock_on_terminal_payment
--     runs trg_terminal_payment_status_proc), so it is dropped.
--   * place_storefront_order(text, jsonb, jsonb, text, text): the legacy
--     five-argument overload, which set both columns. The storefront calls the
--     newest overload, so this one is dropped.
--
-- order_inventory_transition is re-created unchanged apart from the two
-- column assignments; the allocations table and inventory_state already
-- carry what stock_deducted used to say.

CREATE OR REPLACE FUNCTION public.order_inventory_transition(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_desired_state text;
  v_brand_id uuid;
  v_revision integer;
  v_alloc record;
  v_wanted record;
  v_variant public.product_variants%ROWTYPE;
  v_cur_main integer;
  v_cur_inc integer;
  v_avail_main integer;
  v_avail_inc integer;
  v_target_main integer;
  v_target_inc integer;
  v_diff integer;
BEGIN
  -- Advisory lock per order to serialize concurrent status updates
  PERFORM pg_advisory_xact_lock(hashtext('order_inventory:' || p_order_id::text));

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_brand_id := v_order.brand_id;
  v_revision := COALESCE(v_order.inventory_revision, 0) + 1;
  v_desired_state := public.order_inventory_desired_state(
    v_order.status,
    v_order.payment_status,
    v_order.payment_method
  );

  -- Case A: Released or None -> Release all existing allocations idempotently
  IF v_desired_state IN ('released', 'none') THEN
    FOR v_alloc IN
      SELECT variant_id, location, quantity
      FROM public.order_inventory_allocations
      WHERE order_id = p_order_id
    LOOP
      PERFORM public.apply_inventory_movement(
        p_brand_id => v_brand_id,
        p_variant_id => v_alloc.variant_id,
        p_location => v_alloc.location,
        p_delta => v_alloc.quantity,
        p_reason => 'order_release',
        p_reference_type => 'order',
        p_reference_id => p_order_id,
        p_idempotency_key => 'order_release:' || p_order_id::text || ':' || v_alloc.variant_id::text || ':' || v_alloc.location || ':' || v_revision::text,
        p_actor_id => auth.uid(),
        p_note => 'Order inventory transition to ' || v_desired_state
      );
    END LOOP;

    DELETE FROM public.order_inventory_allocations WHERE order_id = p_order_id;

    UPDATE public.orders
    SET inventory_state = v_desired_state,
        inventory_revision = v_revision
    WHERE id = p_order_id;

    RETURN;
  END IF;

  -- Case B: Reserved or Committed -> Reconcile allocations against current order items
  CREATE TEMP TABLE IF NOT EXISTS _order_trans_alloc (
    variant_id uuid NOT NULL,
    location text NOT NULL,
    target_qty integer NOT NULL DEFAULT 0,
    cur_qty integer NOT NULL DEFAULT 0,
    PRIMARY KEY (variant_id, location)
  ) ON COMMIT DELETE ROWS;
  TRUNCATE _order_trans_alloc;

  -- Load existing allocations
  INSERT INTO _order_trans_alloc (variant_id, location, cur_qty)
  SELECT variant_id, location, quantity
  FROM public.order_inventory_allocations
  WHERE order_id = p_order_id;

  -- Calculate target allocations from order_items
  FOR v_wanted IN
    SELECT
      oi.variant_id,
      COALESCE(oi.location, 'main') AS req_location,
      SUM(oi.quantity)::integer AS req_qty
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.variant_id IS NOT NULL
      AND COALESCE(oi.location, '') <> 'custom'
    GROUP BY oi.variant_id, COALESCE(oi.location, 'main')
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(v_wanted.variant_id::text));

    SELECT * INTO v_variant
    FROM public.product_variants
    WHERE id = v_wanted.variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'VARIANT_NOT_FOUND:%', v_wanted.variant_id;
    END IF;

    -- Existing allocations for this variant on this order
    SELECT COALESCE(cur_qty, 0) INTO v_cur_main
    FROM _order_trans_alloc
    WHERE variant_id = v_wanted.variant_id AND location = 'main';
    IF NOT FOUND THEN v_cur_main := 0; END IF;

    SELECT COALESCE(cur_qty, 0) INTO v_cur_inc
    FROM _order_trans_alloc
    WHERE variant_id = v_wanted.variant_id AND location = 'incubator';
    IF NOT FOUND THEN v_cur_inc := 0; END IF;

    -- Compute effective stock available to THIS order
    v_avail_main := COALESCE(v_variant.stock_main, 0) + v_cur_main;
    v_avail_inc := COALESCE(v_variant.stock_incubator, 0) + v_cur_inc;

    IF v_wanted.req_location = 'incubator' THEN
      IF v_avail_inc < v_wanted.req_qty THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_wanted.variant_id;
      END IF;
      v_target_main := 0;
      v_target_inc := v_wanted.req_qty;
    ELSE
      IF (v_avail_main + v_avail_inc) < v_wanted.req_qty THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_wanted.variant_id;
      END IF;
      v_target_main := LEAST(v_avail_main, v_wanted.req_qty);
      v_target_inc := v_wanted.req_qty - v_target_main;
    END IF;

    -- Upsert target into working table
    INSERT INTO _order_trans_alloc (variant_id, location, target_qty)
    VALUES (v_wanted.variant_id, 'main', v_target_main)
    ON CONFLICT (variant_id, location) DO UPDATE
      SET target_qty = _order_trans_alloc.target_qty + EXCLUDED.target_qty;

    INSERT INTO _order_trans_alloc (variant_id, location, target_qty)
    VALUES (v_wanted.variant_id, 'incubator', v_target_inc)
    ON CONFLICT (variant_id, location) DO UPDATE
      SET target_qty = _order_trans_alloc.target_qty + EXCLUDED.target_qty;
  END LOOP;

  -- Apply delta movements for every row in _order_trans_alloc
  FOR v_alloc IN SELECT * FROM _order_trans_alloc LOOP
    v_diff := v_alloc.target_qty - v_alloc.cur_qty;

    IF v_diff > 0 THEN
      -- Reserve additional stock (negative delta)
      PERFORM public.apply_inventory_movement(
        p_brand_id => v_brand_id,
        p_variant_id => v_alloc.variant_id,
        p_location => v_alloc.location,
        p_delta => -v_diff,
        p_reason => 'order_reserve',
        p_reference_type => 'order',
        p_reference_id => p_order_id,
        p_idempotency_key => 'order_reserve:' || p_order_id::text || ':' || v_alloc.variant_id::text || ':' || v_alloc.location || ':' || v_revision::text,
        p_actor_id => auth.uid(),
        p_note => 'Order allocation reserved'
      );
    ELSIF v_diff < 0 THEN
      -- Release excess stock (positive delta)
      PERFORM public.apply_inventory_movement(
        p_brand_id => v_brand_id,
        p_variant_id => v_alloc.variant_id,
        p_location => v_alloc.location,
        p_delta => -v_diff,
        p_reason => 'order_release',
        p_reference_type => 'order',
        p_reference_id => p_order_id,
        p_idempotency_key => 'order_release:' || p_order_id::text || ':' || v_alloc.variant_id::text || ':' || v_alloc.location || ':' || v_revision::text,
        p_actor_id => auth.uid(),
        p_note => 'Order allocation adjusted/released'
      );
    END IF;
  END LOOP;

  -- Update order_inventory_allocations table
  DELETE FROM public.order_inventory_allocations
  WHERE order_id = p_order_id
    AND (variant_id, location) NOT IN (
      SELECT variant_id, location FROM _order_trans_alloc WHERE target_qty > 0
    );

  INSERT INTO public.order_inventory_allocations (
    order_id, variant_id, location, quantity, brand_id
  )
  SELECT p_order_id, variant_id, location, target_qty, v_brand_id
  FROM _order_trans_alloc
  WHERE target_qty > 0
  ON CONFLICT (order_id, variant_id, location)
  DO UPDATE SET quantity = EXCLUDED.quantity;

  -- Finalize order state
  UPDATE public.orders
  SET inventory_state = v_desired_state,
      inventory_revision = v_revision
  WHERE id = p_order_id;
END;
$function$;


DROP FUNCTION IF EXISTS public.release_card_stock_on_terminal_payment();
DROP FUNCTION IF EXISTS public.place_storefront_order(text, jsonb, jsonb, text, text);

NOTIFY pgrst, 'reload schema';
