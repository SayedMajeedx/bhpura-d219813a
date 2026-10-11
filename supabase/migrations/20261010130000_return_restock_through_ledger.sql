-- Putting a returned piece back into stock works again, and a made-to-order piece is not restocked.
--
-- rpc_inspect_and_restock_return_item (staff inspect a returned piece and, if it can be sold again,
-- put it back) could not succeed for a "sellable" piece:
--   * it set product_variants.is_active, a column that does not exist;
--   * it wrote stock_main directly, which the stock guard has refused since the ledger
--     (20260926110000): stock changes only through apply_inventory_movement.
-- No return has been restocked yet, so nothing was lost; the first one would have failed.
--
-- It also treated every returned piece alike. A piece made to order for one customer
-- (order_items.location = 'custom') is not a ready piece of any size, and its product often has
-- only a placeholder variant: putting it "back" would invent ready stock. It is now inspected and
-- recorded like any other, but never added to stock. (The made-to-order limit is not given back
-- either: a returned piece was still made.)
--
-- The function is its live definition with those changes only
-- (tests/return-restock-migration.test.ts): the stock change goes through the ledger with reason
-- 'return_restock', once per returned item, and the answer says whether it was restocked.

CREATE OR REPLACE FUNCTION public.rpc_inspect_and_restock_return_item(p_brand_id uuid, p_return_item_id uuid, p_condition text, p_restock_branch_id uuid DEFAULT NULL::uuid, p_inspection_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_item public.return_items%ROWTYPE;
    v_req public.return_requests%ROWTYPE;
    v_variant public.product_variants%ROWTYPE;
    v_qty_before INT := 0;
    v_qty_after INT := 0;
    v_user_id UUID := (SELECT auth.uid());
    v_all_inspected BOOLEAN := true;
    v_target_branch_id UUID := NULL;
    v_made_to_order BOOLEAN := false;
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
        v_qty_before := COALESCE(v_variant.stock_main, 0);
    END IF;

    -- A piece that was made to order for this customer is not a ready piece of any size: it is
    -- never put back into ready stock, whatever its condition.
    v_made_to_order := EXISTS (
        SELECT 1 FROM public.order_items oi
        WHERE oi.id = v_item.order_item_id AND oi.location = 'custom'
    );

    IF p_condition = 'sellable' AND v_item.variant_id IS NOT NULL AND NOT v_made_to_order THEN
        v_qty_after := v_qty_before + v_item.quantity;

        -- Through the stock ledger, like every other stock change (a direct update is refused).
        PERFORM public.apply_inventory_movement(
            p_brand_id => p_brand_id,
            p_variant_id => v_item.variant_id,
            p_location => 'main',
            p_delta => v_item.quantity,
            p_reason => 'return_restock',
            p_reference_type => 'return',
            p_reference_id => v_req.id,
            p_idempotency_key => 'return_restock:' || v_item.id::text,
            p_actor_id => v_user_id,
            p_note => 'Return restocked'
        );

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
        'restocked', (p_condition = 'sellable' AND v_item.variant_id IS NOT NULL AND NOT v_made_to_order),
        'made_to_order', v_made_to_order,
        'restocked_to_branch_id', v_target_branch_id,
        'quantity_before', v_qty_before,
        'quantity_after', v_qty_after
    );
END;
$function$;
