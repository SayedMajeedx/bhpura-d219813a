-- Migration: 20260910143000_fix_return_restock_branch_fallback_and_loyalty_cap.sql
-- Description:
-- 1. Ensure rpc_inspect_and_restock_return_item falls back to brand's primary/active branch
--    if p_restock_branch_id is null or inactive, avoiding orphaned return stock.
-- 2. Ensure rpc_validate_and_redeem_loyalty_points validates and caps subtotal against
--    the authoritative order record if p_order_id is provided, preventing discount over-redemption.

CREATE OR REPLACE FUNCTION public.rpc_inspect_and_restock_return_item(
    p_brand_id UUID,
    p_return_item_id UUID,
    p_condition TEXT,
    p_restock_branch_id UUID DEFAULT NULL,
    p_inspection_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item public.return_items%ROWTYPE;
    v_req public.return_requests%ROWTYPE;
    v_variant public.product_variants%ROWTYPE;
    v_qty_before INT := 0;
    v_qty_after INT := 0;
    v_user_id UUID := (SELECT auth.uid());
    v_all_inspected BOOLEAN := true;
    v_target_branch_id UUID := NULL;
BEGIN
    IF NOT public.can_access_brand(p_brand_id) OR 
       (NOT public.has_permission('manage_inventory') AND NOT public.has_permission('manage_orders')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
    END IF;

    SELECT * INTO v_item FROM public.return_items WHERE id = p_return_item_id AND brand_id = p_brand_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'RETURN_ITEM_NOT_FOUND'); END IF;

    SELECT * INTO v_req FROM public.return_requests WHERE id = v_item.return_id AND brand_id = p_brand_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'RETURN_REQUEST_NOT_FOUND'); END IF;

    IF v_item.restocked THEN
        RETURN jsonb_build_object('success', false, 'error', 'ITEM_ALREADY_RESTOCKED');
    END IF;

    -- Authoritatively resolve active restock branch (explicit branch -> fallback to primary active branch)
    IF p_restock_branch_id IS NOT NULL THEN
        SELECT id INTO v_target_branch_id
        FROM public.branches
        WHERE id = p_restock_branch_id AND brand_id = p_brand_id AND is_active = true;
    END IF;

    IF v_target_branch_id IS NULL THEN
        SELECT id INTO v_target_branch_id
        FROM public.branches
        WHERE brand_id = p_brand_id AND is_active = true
        ORDER BY sort_order ASC, created_at ASC
        LIMIT 1;
    END IF;

    IF v_item.variant_id IS NOT NULL THEN
        SELECT * INTO v_variant FROM public.product_variants WHERE id = v_item.variant_id AND brand_id = p_brand_id;
        v_qty_before := COALESCE(v_variant.stock_quantity, 0);
    END IF;

    IF p_condition = 'sellable' AND v_item.variant_id IS NOT NULL THEN
        v_qty_after := v_qty_before + v_item.quantity;
        
        UPDATE public.product_variants
        SET stock_quantity = v_qty_after,
            is_active = CASE WHEN v_qty_after > 0 THEN true ELSE is_active END,
            updated_at = NOW()
        WHERE id = v_item.variant_id;

        IF v_item.product_id IS NOT NULL THEN
            UPDATE public.products
            SET stock_quantity = COALESCE((
                SELECT SUM(stock_quantity) FROM public.product_variants WHERE product_id = v_item.product_id
            ), 0),
            updated_at = NOW()
            WHERE id = v_item.product_id;
        END IF;

        INSERT INTO public.inventory_movement_logs (
            brand_id, variant_id, branch_id, return_id, return_item_id,
            quantity_before, quantity_changed, quantity_after,
            movement_type, item_condition, handled_by, reference_code
        ) VALUES (
            p_brand_id, v_item.variant_id, v_target_branch_id, v_req.id, v_item.id,
            v_qty_before, v_item.quantity, v_qty_after,
            'return_restock', p_condition, v_user_id, v_req.return_number
        );

        UPDATE public.return_items
        SET condition = p_condition,
            restocked = true,
            restocked_quantity = v_item.quantity,
            restocked_at = NOW(),
            restocked_to_branch_id = v_target_branch_id,
            restocked_by = v_user_id,
            inspection_notes = p_inspection_notes
        WHERE id = v_item.id;
    ELSE
        v_qty_after := v_qty_before;

        IF v_item.variant_id IS NOT NULL THEN
            INSERT INTO public.inventory_movement_logs (
                brand_id, variant_id, branch_id, return_id, return_item_id,
                quantity_before, quantity_changed, quantity_after,
                movement_type, item_condition, handled_by, reference_code
            ) VALUES (
                p_brand_id, v_item.variant_id, v_target_branch_id, v_req.id, v_item.id,
                v_qty_before, 0, v_qty_after,
                CASE WHEN p_condition = 'damaged' THEN 'return_damaged_writeoff' ELSE 'manual_adjustment' END,
                p_condition, v_user_id, v_req.return_number
            );
        END IF;

        UPDATE public.return_items
        SET condition = p_condition,
            restocked = false,
            restocked_quantity = 0,
            restocked_at = NOW(),
            restocked_to_branch_id = v_target_branch_id,
            restocked_by = v_user_id,
            inspection_notes = p_inspection_notes
        WHERE id = v_item.id;
    END IF;

    SELECT NOT EXISTS (
        SELECT 1 FROM public.return_items 
        WHERE return_id = v_req.id AND condition = 'pending'
    ) INTO v_all_inspected;

    IF v_all_inspected THEN
        UPDATE public.return_requests
        SET status = 'under_inspection',
            inspected_at = NOW(),
            inspected_by = v_user_id
        WHERE id = v_req.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'condition', p_condition,
        'restocked', (p_condition = 'sellable'),
        'restocked_to_branch_id', v_target_branch_id,
        'quantity_before', v_qty_before,
        'quantity_after', v_qty_after
    );
END;
$$;

-- Fix and harden rpc_validate_and_redeem_loyalty_points
CREATE OR REPLACE FUNCTION public.rpc_validate_and_redeem_loyalty_points(
    p_brand_id UUID,
    p_customer_id UUID,
    p_points_to_redeem INT,
    p_order_subtotal NUMERIC,
    p_idempotency_key TEXT,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program brand_loyalty_programs%ROWTYPE;
  v_account loyalty_accounts%ROWTYPE;
  v_existing_ledger loyalty_ledger%ROWTYPE;
  v_effective_subtotal numeric := p_order_subtotal;
  v_actual_order_subtotal numeric;
  v_max_redemption_amount numeric := 0;
  v_max_redeemable_points integer := 0;
  v_discount_amount numeric := 0;
  v_balance_after integer := 0;
BEGIN
  SELECT * INTO v_existing_ledger FROM public.loyalty_ledger
  WHERE brand_id = p_brand_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_redeemed', true,
      'points_redeemed', ABS(v_existing_ledger.points),
      'discount_amount', ABS(v_existing_ledger.points) * 0.010
    );
  END IF;

  SELECT * INTO v_program FROM public.brand_loyalty_programs WHERE brand_id = p_brand_id;
  IF NOT FOUND OR v_program.is_enabled = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Loyalty program is disabled');
  END IF;

  IF p_points_to_redeem < v_program.min_points_to_redeem THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Minimum points required to redeem is ' || v_program.min_points_to_redeem
    );
  END IF;

  SELECT * INTO v_account FROM public.loyalty_accounts
  WHERE brand_id = p_brand_id AND customer_id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND OR v_account.active_points < p_points_to_redeem THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient active points balance',
      'available_points', COALESCE(v_account.active_points, 0)
    );
  END IF;

  -- Authoritatively cross-validate against real order subtotal if order_id is present
  IF p_order_id IS NOT NULL THEN
    SELECT subtotal INTO v_actual_order_subtotal
    FROM public.orders
    WHERE id = p_order_id AND brand_id = p_brand_id;

    IF FOUND AND v_actual_order_subtotal IS NOT NULL AND v_actual_order_subtotal > 0 THEN
      v_effective_subtotal := LEAST(v_effective_subtotal, v_actual_order_subtotal);
    END IF;
  END IF;

  v_max_redemption_amount := v_effective_subtotal * (v_program.max_redemption_percentage / 100.0);
  v_max_redeemable_points := FLOOR(v_max_redemption_amount / v_program.redemption_rate);

  IF p_points_to_redeem > v_max_redeemable_points THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Points exceed max redemption threshold for this order',
      'max_allowed_points', v_max_redeemable_points
    );
  END IF;

  v_discount_amount := ROUND((p_points_to_redeem * v_program.redemption_rate)::numeric, 3);

  UPDATE public.loyalty_accounts
  SET active_points = active_points - p_points_to_redeem,
      lifetime_spent_points = lifetime_spent_points + p_points_to_redeem,
      updated_at = now()
  WHERE id = v_account.id
  RETURNING active_points INTO v_balance_after;

  INSERT INTO public.loyalty_ledger (
    brand_id, customer_id, account_id, event_type, points,
    points_status, order_id, effective_at, idempotency_key,
    reference_note_ar, reference_note_en, balance_after
  ) VALUES (
    p_brand_id, p_customer_id, v_account.id, 'redeem_checkout',
    -p_points_to_redeem, 'redeemed', p_order_id, now(),
    p_idempotency_key,
    'استخدام نقاط مكافآت عند الدفع',
    'Loyalty points redemption at checkout',
    v_balance_after
  );

  RETURN jsonb_build_object(
    'success', true,
    'points_redeemed', p_points_to_redeem,
    'discount_amount', v_discount_amount,
    'new_balance', v_balance_after
  );
END;
$$;
