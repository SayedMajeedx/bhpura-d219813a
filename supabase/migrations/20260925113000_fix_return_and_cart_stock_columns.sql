-- Fix column references in rpc_inspect_and_restock_return_item and rpc_validate_and_restore_abandoned_cart.
-- Historical functions referenced non-existent columns (stock_quantity on product_variants and products).
-- Updated to reference stock_main and stock_incubator. Removed obsolete products.stock_quantity update.

CREATE OR REPLACE FUNCTION public.rpc_inspect_and_restock_return_item(
    p_brand_id uuid,
    p_return_item_id uuid,
    p_condition text,
    p_restock_branch_id uuid DEFAULT NULL::uuid,
    p_inspection_notes text DEFAULT NULL::text
)
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

    IF p_condition = 'sellable' AND v_item.variant_id IS NOT NULL THEN
        v_qty_after := v_qty_before + v_item.quantity;
        
        UPDATE public.product_variants
        SET stock_main = v_qty_after,
            is_active = CASE WHEN v_qty_after > 0 THEN true ELSE is_active END,
            updated_at = NOW()
        WHERE id = v_item.variant_id;

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
$function$;

REVOKE ALL ON FUNCTION public.rpc_inspect_and_restock_return_item FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_inspect_and_restock_return_item TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_validate_and_restore_abandoned_cart(p_brand_slug text, p_recovery_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand public.brands%ROWTYPE;
  v_cart public.abandoned_carts%ROWTYPE;
  v_item jsonb;
  v_variant public.product_variants%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_adjusted_items jsonb := '[]'::jsonb;
  v_has_out_of_stock boolean := false;
  v_has_price_change boolean := false;
  v_available_qty integer;
  v_current_price numeric;
  v_qty integer;
  v_new_subtotal numeric := 0;
BEGIN
  SELECT * INTO v_brand FROM public.brands WHERE slug = p_brand_slug;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Brand not found');
  END IF;

  SELECT * INTO v_cart
    FROM public.abandoned_carts
   WHERE brand_id = v_brand.id AND recovery_token = p_recovery_token;
  IF NOT FOUND OR v_cart.status IN ('expired', 'unsubscribed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired recovery link');
  END IF;
  IF v_cart.status = 'recovered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This cart has already been completed');
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_cart.cart_items)
  LOOP
    IF NULLIF(v_item->>'variant_id', '') IS NULL THEN
      v_has_out_of_stock := true;
      CONTINUE;
    END IF;

    SELECT * INTO v_variant
      FROM public.product_variants
     WHERE id = (v_item->>'variant_id')::uuid AND brand_id = v_brand.id;
    IF NOT FOUND THEN
      v_has_out_of_stock := true;
      CONTINUE;
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = v_variant.product_id;
    v_available_qty := COALESCE(v_variant.stock_main, 0) + COALESCE(v_variant.stock_incubator, 0);
    v_current_price := COALESCE(v_variant.selling_price, v_product.base_price, (v_item->>'price')::numeric);
    v_qty := LEAST(GREATEST(COALESCE((v_item->>'qty')::integer, 1), 1), v_available_qty);
    IF COALESCE((v_item->>'price')::numeric, 0) <> v_current_price THEN
      v_has_price_change := true;
    END IF;

    IF v_available_qty <= 0 THEN
      v_has_out_of_stock := true;
      CONTINUE;
    END IF;

    v_adjusted_items := v_adjusted_items || (
      v_item || jsonb_build_object(
        'variant_id', v_variant.id,
        'product_id', v_variant.product_id,
        'title', COALESCE(v_product.name_ar, v_product.name_en, v_item->>'title'),
        'name', COALESCE(v_product.name_ar, v_product.name_en, v_item->>'name'),
        'price', v_current_price,
        'unit_price', v_current_price,
        'qty', v_qty,
        'quantity', v_qty,
        'line_total', v_current_price * v_qty,
        'image_url', COALESCE(v_variant.image_url, v_item->>'image_url', v_item->>'image'),
        'stock_available', v_available_qty
      )
    );
    v_new_subtotal := v_new_subtotal + (v_current_price * v_qty);
  END LOOP;

  UPDATE public.abandoned_carts
     SET status = 'recovering', updated_at = now()
   WHERE id = v_cart.id;

  RETURN jsonb_build_object(
    'success', true,
    'valid', true,
    'cart_id', v_cart.id,
    'guest_name', v_cart.guest_name,
    'guest_email', v_cart.guest_email,
    'guest_phone', v_cart.guest_phone,
    'items', v_adjusted_items,
    'subtotal', v_new_subtotal,
    'currency', v_cart.currency,
    'recovery_discount_code', v_cart.recovery_discount_code,
    'has_out_of_stock', v_has_out_of_stock,
    'has_price_change', v_has_price_change
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_validate_and_restore_abandoned_cart FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_validate_and_restore_abandoned_cart TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';
