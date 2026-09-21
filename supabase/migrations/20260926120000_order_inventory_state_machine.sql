-- ==============================================================================
-- Order Inventory State Machine, Single Write Path Triggers, and Storefront Integration
-- ==============================================================================

-- 1. Pure function mapping order status to desired inventory state
CREATE OR REPLACE FUNCTION public.order_inventory_desired_state(
  p_status text,
  p_payment_status text,
  p_payment_method text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_st text := lower(trim(COALESCE(p_status, '')));
  v_pst text := lower(trim(COALESCE(p_payment_status, '')));
BEGIN
  -- Terminal failure / cancellation / refund -> release stock
  IF v_st IN ('cancelled', 'canceled', 'refunded', 'voided', 'failed')
     OR v_pst IN ('failed', 'declined') THEN
    RETURN 'released';
  END IF;

  -- Terminal fulfilled states -> committed stock
  IF v_st IN ('completed', 'delivered', 'picked_up') THEN
    RETURN 'committed';
  END IF;

  -- Draft / historic orders -> no inventory reservation
  IF v_st IN ('draft', 'archived_historical') OR v_st = '' THEN
    RETURN 'none';
  END IF;

  -- Active pipeline (pending, confirmed, paid, packing, sent_to_tailor, shipped, etc.)
  RETURN 'reserved';
END;
$$;

-- 2. State transition engine: synchronizes order_inventory_allocations and inventory_movements
CREATE OR REPLACE FUNCTION public.order_inventory_transition(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        stock_deducted = false,
        stock_snapshot = NULL,
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
      stock_deducted = EXISTS (SELECT 1 FROM public.order_inventory_allocations WHERE order_id = p_order_id),
      stock_snapshot = NULL,
      inventory_revision = v_revision
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.order_inventory_transition FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_inventory_transition TO authenticated, service_role;

-- 3. Replace order items atomically
CREATE OR REPLACE FUNCTION public.replace_order_items(
  p_order_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item jsonb;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND:%', p_order_id;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.can_access_brand(v_order.brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- Suppress items trigger during bulk replacement
  PERFORM set_config('inventory.suppress_items_trigger', '1', true);

  DELETE FROM public.order_items WHERE order_id = p_order_id;

  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.order_items (
        user_id,
        brand_id,
        order_id,
        product_id,
        variant_id,
        description,
        quantity,
        unit_price,
        unit_cost,
        original_price,
        customizations,
        customization_total,
        line_total,
        location,
        selected_variant,
        custom_field_values
      ) VALUES (
        COALESCE((v_item->>'user_id')::uuid, v_order.user_id, auth.uid()),
        v_order.brand_id,
        p_order_id,
        NULLIF(v_item->>'product_id', '')::uuid,
        NULLIF(v_item->>'variant_id', '')::uuid,
        COALESCE(v_item->>'description', 'Product'),
        GREATEST(1, COALESCE((v_item->>'quantity')::integer, 1)),
        COALESCE((v_item->>'unit_price')::numeric, 0),
        NULLIF(v_item->>'unit_cost', '')::numeric,
        NULLIF(v_item->>'original_price', '')::numeric,
        COALESCE(v_item->'customizations', '{}'::jsonb),
        COALESCE((v_item->>'customization_total')::numeric, 0),
        COALESCE((v_item->>'line_total')::numeric, 0),
        COALESCE(NULLIF(v_item->>'location', ''), 'main'),
        v_item->'selected_variant',
        COALESCE(v_item->'custom_field_values', '[]'::jsonb)
      );
    END LOOP;
  END IF;

  PERFORM set_config('inventory.suppress_items_trigger', '0', true);

  PERFORM public.order_inventory_transition(p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_order_items FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_order_items TO authenticated, service_role;

-- 4. Terminal card payment status trigger (side-effects only; stock handled by transition)
CREATE OR REPLACE FUNCTION public.trg_terminal_payment_status_proc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(trim(COALESCE(NEW.payment_method, ''))) NOT IN (
    'card', 'tap', 'creimax', 'credit', 'credit_card', 'debit_card',
    'apple_pay', 'google_pay'
  ) OR lower(trim(COALESCE(NEW.payment_status, ''))) NOT IN ('failed', 'declined') THEN
    RETURN NEW;
  END IF;

  IF lower(trim(COALESCE(OLD.payment_status, ''))) IN ('failed', 'declined') THEN
    RETURN NEW;
  END IF;

  NEW.status := 'cancelled';
  NEW.fulfillment_status := 'cancelled';

  INSERT INTO public.activity_logs (
    brand_id, user_id, action, message_en, message_ar, order_id
  ) VALUES (
    NEW.brand_id,
    NEW.user_id,
    'payment_' || lower(trim(COALESCE(NEW.payment_status, ''))),
    'Payment ' || lower(trim(COALESCE(NEW.payment_status, ''))) || '. Order cancelled.',
    'فشل الدفع. تم إلغاء الطلب.',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS release_card_stock_on_terminal_payment ON public.orders;
DROP TRIGGER IF EXISTS trg_release_card_stock_on_terminal_payment ON public.orders;
CREATE TRIGGER trg_release_card_stock_on_terminal_payment
BEFORE UPDATE OF payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_terminal_payment_status_proc();

-- 5. Order delete trigger (releases allocations cleanly and idempotently)
CREATE OR REPLACE FUNCTION public.trg_orders_inventory_delete_proc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc RECORD;
  v_rev integer := COALESCE(OLD.inventory_revision, 0) + 1;
BEGIN
  FOR v_alloc IN
    SELECT variant_id, location, quantity
    FROM public.order_inventory_allocations
    WHERE order_id = OLD.id
  LOOP
    PERFORM public.apply_inventory_movement(
      p_brand_id => OLD.brand_id,
      p_variant_id => v_alloc.variant_id,
      p_location => v_alloc.location,
      p_delta => v_alloc.quantity,
      p_reason => 'order_release',
      p_reference_type => 'order',
      p_reference_id => OLD.id,
      p_idempotency_key => 'order_delete_release:' || OLD.id::text || ':' || v_alloc.variant_id::text || ':' || v_alloc.location || ':' || v_rev::text,
      p_actor_id => auth.uid(),
      p_note => 'Order deleted'
    );
  END LOOP;

  DELETE FROM public.order_inventory_allocations WHERE order_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_restore_stock_on_delete ON public.orders;
DROP TRIGGER IF EXISTS orders_restore_stock_on_delete_trg ON public.orders;
DROP TRIGGER IF EXISTS trg_orders_restore_stock_on_cancel ON public.orders;
DROP TRIGGER IF EXISTS trg_orders_inventory_delete ON public.orders;

CREATE TRIGGER trg_orders_inventory_delete
BEFORE DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_inventory_delete_proc();

-- 6. Order lifecycle trigger
CREATE OR REPLACE FUNCTION public.trg_orders_inventory_proc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  PERFORM public.order_inventory_transition(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_inventory ON public.orders;
CREATE TRIGGER trg_orders_inventory
AFTER INSERT OR UPDATE OF status, payment_status, payment_method ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_inventory_proc();

-- 7. Order items inventory trigger
CREATE OR REPLACE FUNCTION public.trg_order_items_inventory_proc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF current_setting('inventory.suppress_items_trigger', true) = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order_id IS NOT NULL THEN
    PERFORM public.order_inventory_transition(v_order_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_inventory ON public.order_items;
CREATE TRIGGER trg_order_items_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_order_items_inventory_proc();

-- 8. Redefine sync_order_stock as thin wrapper
CREATE OR REPLACE FUNCTION public.sync_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.user_id <> auth.uid() AND NOT public.can_access_brand(v_order.brand_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM public.order_inventory_transition(p_order_id);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_order_stock FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_order_stock TO authenticated, service_role;

-- 9. Update place_storefront_order_internal_20260710 to use single write path
CREATE OR REPLACE FUNCTION public.place_storefront_order_internal_20260710(
  p_brand_slug text,
  p_customer jsonb,
  p_items jsonb,
  p_payment_method text,
  p_notes text,
  p_fulfillment text,
  p_branch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_brand public.brands%ROWTYPE;
  v_settings public.business_settings%ROWTYPE;
  v_owner uuid;
  v_customer_id uuid;
  v_address_id uuid;
  v_order_id uuid;
  v_invoice text;
  v_shipping numeric(10,3) := 0;
  v_subtotal numeric(14,3) := 0;
  v_item jsonb;
  v_variant public.product_variants%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_qty int;
  v_line_total numeric(14,3);
  v_custom_fields jsonb;
  v_is_tailoring boolean;
  v_selected_variant jsonb;
  v_clean_phone text;
  v_clean_email text;
  v_customer_user_id uuid;
BEGIN
  -- 1. Validate brand and status
  SELECT * INTO v_brand FROM public.brands WHERE slug = p_brand_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;
  IF v_brand.subscription_status NOT IN ('active', 'trialing') THEN
    RAISE EXCEPTION 'BRAND_INACTIVE';
  END IF;

  -- 2. Guard against expired trials
  IF v_brand.subscription_status = 'trialing'
     AND v_brand.trial_ends_at IS NOT NULL
     AND v_brand.trial_ends_at < now() THEN
    RAISE EXCEPTION 'TRIAL_EXPIRED';
  END IF;

  SELECT * INTO v_settings FROM public.business_settings WHERE brand_id = v_brand.id;

  -- 3. Guard against catalog mode
  IF v_settings.storefront_mode = 'catalog' THEN
    RAISE EXCEPTION 'CHECKOUT_DISABLED_CATALOG_MODE';
  END IF;

  v_owner := v_brand.created_by;
  IF v_owner IS NULL THEN
    SELECT user_id INTO v_owner FROM public.tenant_users
    WHERE brand_id = v_brand.id AND role = 'brand_owner' LIMIT 1;
  END IF;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'BRAND_OWNER_NOT_FOUND'; END IF;

  -- 4. Clean customer inputs
  v_clean_phone := NULLIF(trim(p_customer->>'phone'), '');
  v_clean_email := NULLIF(lower(trim(p_customer->>'email')), '');

  -- 5. Customer resolution & upsert
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM public.customers
    WHERE user_id = auth.uid() AND brand_id = v_brand.id LIMIT 1;

    IF v_customer_id IS NOT NULL THEN
      UPDATE public.customers SET
        name = COALESCE(NULLIF(trim(p_customer->>'name'), ''), name),
        phone = COALESCE(v_clean_phone, phone),
        email = COALESCE(v_clean_email, email),
        updated_at = now()
      WHERE id = v_customer_id;
    ELSE
      INSERT INTO public.customers (user_id, brand_id, name, phone, email)
      VALUES (
        auth.uid(), v_brand.id,
        COALESCE(NULLIF(trim(p_customer->>'name'), ''), 'Guest Customer'),
        v_clean_phone, v_clean_email
      ) RETURNING id INTO v_customer_id;
    END IF;
  ELSE
    IF v_clean_phone IS NOT NULL THEN
      SELECT id, user_id INTO v_customer_id, v_customer_user_id
      FROM public.customers
      WHERE brand_id = v_brand.id AND phone = v_clean_phone
      ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_customer_id IS NULL AND v_clean_email IS NOT NULL THEN
      SELECT id, user_id INTO v_customer_id, v_customer_user_id
      FROM public.customers
      WHERE brand_id = v_brand.id AND lower(email) = v_clean_email
      ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_customer_id IS NOT NULL THEN
      UPDATE public.customers SET
        name = COALESCE(NULLIF(trim(p_customer->>'name'), ''), name),
        phone = COALESCE(v_clean_phone, phone),
        email = CASE
          WHEN v_customer_user_id IS NOT NULL THEN email
          ELSE COALESCE(v_clean_email, email)
        END,
        updated_at = now()
      WHERE id = v_customer_id;
    ELSE
      INSERT INTO public.customers (brand_id, name, phone, email)
      VALUES (
        v_brand.id,
        COALESCE(NULLIF(trim(p_customer->>'name'), ''), 'Guest Customer'),
        v_clean_phone, v_clean_email
      ) RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  -- 6. Shipping address handling
  IF p_fulfillment = 'delivery' AND p_customer ? 'address' THEN
    INSERT INTO public.customer_addresses (
      customer_id, brand_id, address_name, block, street, way_number,
      building, apartment, floor, additional_directions, city, postal_code, country
    ) VALUES (
      v_customer_id, v_brand.id,
      COALESCE(p_customer->'address'->>'name', 'Delivery Address'),
      p_customer->'address'->>'block',
      p_customer->'address'->>'street',
      p_customer->'address'->>'way',
      p_customer->'address'->>'building',
      p_customer->'address'->>'apartment',
      p_customer->'address'->>'floor',
      p_customer->'address'->>'additional_directions',
      COALESCE(p_customer->'address'->>'city', 'Default City'),
      p_customer->'address'->>'postal_code',
      COALESCE(p_customer->'address'->>'country', 'BH')
    ) RETURNING id INTO v_address_id;

    v_shipping := COALESCE(v_settings.delivery_fee, 0);
  END IF;

  -- 7. Generate invoice number
  v_invoice := 'INV-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(gen_random_uuid()::text from 1 for 6));

  -- 8. Create Order record
  INSERT INTO public.orders (
    user_id, brand_id, customer_id, invoice_number, status,
    payment_method, payment_status, currency, notes, channel,
    fulfillment_method, shipping_address_id, shipping, branch_id
  ) VALUES (
    v_owner, v_brand.id, v_customer_id, v_invoice, 'pending',
    p_payment_method, 'unpaid', v_settings.currency, p_notes, 'storefront',
    p_fulfillment, v_address_id, v_shipping,
    CASE WHEN p_fulfillment = 'pickup' THEN p_branch_id ELSE NULL END
  ) RETURNING id INTO v_order_id;

  -- 9. Insert order items with stock pre-check
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));

    SELECT * INTO v_variant
    FROM public.product_variants
    WHERE id = (v_item->>'variant_id')::uuid
    FOR UPDATE;

    IF NOT FOUND OR v_variant.brand_id <> v_brand.id THEN
      RAISE EXCEPTION 'VARIANT_NOT_FOUND';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_variant.product_id;

    IF NOT v_product.is_active THEN
      RAISE EXCEPTION 'PRODUCT_INACTIVE';
    END IF;

    v_custom_fields := COALESCE(v_item->'custom_fields', '[]'::jsonb);
    v_is_tailoring := COALESCE(v_product.is_made_to_order, false);

    v_line_total := (v_variant.selling_price * v_qty)::numeric(14,3);
    v_subtotal := v_subtotal + v_line_total;

    v_selected_variant := jsonb_build_object(
      'size', v_variant.size, 'color', v_variant.color,
      'fabric', v_variant.fabric, 'sku', v_variant.sku
    );

    IF v_is_tailoring THEN
      INSERT INTO public.order_items (
        user_id, brand_id, order_id, product_id, variant_id,
        description, quantity, unit_price, line_total, location,
        selected_variant, custom_field_values
      ) VALUES (
        v_owner, v_brand.id, v_order_id, v_product.id, v_variant.id,
        COALESCE(v_product.name, 'Product'), v_qty, v_variant.selling_price,
        v_line_total, 'custom', v_selected_variant, v_custom_fields
      );
    ELSE
      -- Stock pre-check guarantees customer receives INSUFFICIENT_STOCK before proceeding
      IF (COALESCE(v_variant.stock_main, 0) + COALESCE(v_variant.stock_incubator, 0)) < v_qty THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_variant.id;
      END IF;

      INSERT INTO public.order_items (
        user_id, brand_id, order_id, product_id, variant_id,
        description, quantity, unit_price, line_total, location,
        selected_variant, custom_field_values
      ) VALUES (
        v_owner, v_brand.id, v_order_id, v_product.id, v_variant.id,
        COALESCE(v_product.name, 'Product'), v_qty, v_variant.selling_price,
        v_line_total, 'main', v_selected_variant, v_custom_fields
      );
    END IF;
  END LOOP;

  -- 10. Update order totals
  UPDATE public.orders
  SET subtotal = v_subtotal,
      total = v_subtotal + v_shipping
  WHERE id = v_order_id;

  -- 11. Execute inventory reservation through single state transition engine
  PERFORM public.order_inventory_transition(v_order_id);

  RETURN jsonb_build_object('order_id', v_order_id, 'invoice_number', v_invoice);
END;
$function$;

REVOKE ALL ON FUNCTION public.place_storefront_order_internal_20260710 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_storefront_order_internal_20260710 TO anon, authenticated, service_role;

-- 10. Incubator RPCs refactored to use apply_inventory_movement

-- 10a. transfer_stock_to_incubator
CREATE OR REPLACE FUNCTION public.transfer_stock_to_incubator(
  p_incubator_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_external_code text DEFAULT NULL,
  p_price numeric DEFAULT NULL,
  p_commission_type text DEFAULT NULL,
  p_commission_value numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_brand uuid;
  v_variant_brand uuid;
  v_inventory_id uuid;
  v_inc public.incubators%ROWTYPE;
  v_stock_main integer;
  v_stock_incubator integer;
  v_allocated_incubator integer;
  v_unallocated_incubator integer;
  v_needed_from_main integer;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  SELECT * INTO v_inc FROM public.incubators WHERE id = p_incubator_id AND is_active FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_brand(v_inc.brand_id) OR NOT public.has_permission('manage_inventory') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT p.brand_id, v.stock_main, v.stock_incubator
  INTO v_variant_brand, v_stock_main, v_stock_incubator
  FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
  WHERE v.id = p_variant_id FOR UPDATE;

  IF v_variant_brand IS DISTINCT FROM v_inc.brand_id THEN
    RAISE EXCEPTION 'CROSS_BRAND_INCUBATOR_REFERENCE';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_allocated_incubator
  FROM public.incubator_inventory
  WHERE variant_id = p_variant_id;

  v_unallocated_incubator := GREATEST(0, COALESCE(v_stock_incubator, 0) - v_allocated_incubator);

  IF v_unallocated_incubator >= p_quantity THEN
    v_needed_from_main := 0;
  ELSE
    v_needed_from_main := p_quantity - v_unallocated_incubator;
  END IF;

  IF v_needed_from_main > 0 THEN
    IF COALESCE(v_stock_main, 0) < v_needed_from_main THEN
      RAISE EXCEPTION 'INSUFFICIENT_MAIN_STOCK';
    END IF;

    -- Apply ledger movements for transfer
    PERFORM public.apply_inventory_movement(
      p_brand_id => v_inc.brand_id,
      p_variant_id => p_variant_id,
      p_location => 'main',
      p_delta => -v_needed_from_main,
      p_reason => 'transfer',
      p_reference_type => 'incubator_transfer',
      p_reference_id => p_incubator_id,
      p_idempotency_key => 'inc_transfer_out:' || gen_random_uuid()::text,
      p_actor_id => auth.uid(),
      p_note => p_notes
    );

    PERFORM public.apply_inventory_movement(
      p_brand_id => v_inc.brand_id,
      p_variant_id => p_variant_id,
      p_location => 'incubator',
      p_delta => v_needed_from_main,
      p_reason => 'transfer',
      p_reference_type => 'incubator_transfer',
      p_reference_id => p_incubator_id,
      p_idempotency_key => 'inc_transfer_in:' || gen_random_uuid()::text,
      p_actor_id => auth.uid(),
      p_note => p_notes
    );
  END IF;

  INSERT INTO public.incubator_inventory (
    brand_id, incubator_id, variant_id, external_code, quantity,
    consignment_price, commission_type, commission_value
  )
  VALUES (
    v_inc.brand_id, p_incubator_id, p_variant_id, nullif(trim(p_external_code), ''), p_quantity,
    COALESCE(p_price, 0), COALESCE(p_commission_type, v_inc.commission_type),
    COALESCE(p_commission_value, v_inc.commission_value)
  )
  ON CONFLICT (incubator_id, variant_id) DO UPDATE SET
    quantity = incubator_inventory.quantity + EXCLUDED.quantity,
    external_code = COALESCE(EXCLUDED.external_code, incubator_inventory.external_code),
    consignment_price = CASE WHEN EXCLUDED.consignment_price > 0 THEN EXCLUDED.consignment_price ELSE incubator_inventory.consignment_price END,
    commission_type = EXCLUDED.commission_type,
    commission_value = EXCLUDED.commission_value
  RETURNING id INTO v_inventory_id;

  INSERT INTO public.incubator_movements(
    brand_id, incubator_id, variant_id, movement_type, quantity_delta, notes
  )
  VALUES (v_inc.brand_id, p_incubator_id, p_variant_id, 'transfer_in', p_quantity, p_notes);

  RETURN v_inventory_id;
END;
$function$;

-- 10b. return_stock_from_incubator
CREATE OR REPLACE FUNCTION public.return_stock_from_incubator(
  p_incubator_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_brand uuid;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  SELECT brand_id INTO v_brand FROM public.incubators WHERE id = p_incubator_id FOR UPDATE;
  IF v_brand IS NULL OR NOT public.can_access_brand(v_brand) OR NOT public.has_permission('manage_inventory') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  UPDATE public.incubator_inventory
  SET quantity = quantity - p_quantity
  WHERE incubator_id = p_incubator_id AND variant_id = p_variant_id AND quantity >= p_quantity;

  IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_INCUBATOR_STOCK'; END IF;

  -- Apply ledger movements for return
  PERFORM public.apply_inventory_movement(
    p_brand_id => v_brand,
    p_variant_id => p_variant_id,
    p_location => 'incubator',
    p_delta => -p_quantity,
    p_reason => 'transfer',
    p_reference_type => 'incubator_return',
    p_reference_id => p_incubator_id,
    p_idempotency_key => 'inc_return_out:' || gen_random_uuid()::text,
    p_actor_id => auth.uid(),
    p_note => p_notes
  );

  PERFORM public.apply_inventory_movement(
    p_brand_id => v_brand,
    p_variant_id => p_variant_id,
    p_location => 'main',
    p_delta => p_quantity,
    p_reason => 'transfer',
    p_reference_type => 'incubator_return',
    p_reference_id => p_incubator_id,
    p_idempotency_key => 'inc_return_in:' || gen_random_uuid()::text,
    p_actor_id => auth.uid(),
    p_note => p_notes
  );

  INSERT INTO public.incubator_movements(
    brand_id, incubator_id, variant_id, movement_type, quantity_delta, notes
  )
  VALUES (v_brand, p_incubator_id, p_variant_id, 'return', -p_quantity, p_notes);
END;
$function$;

-- 10c. record_incubator_sale
CREATE OR REPLACE FUNCTION public.record_incubator_sale(
  p_incubator_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_unit_price numeric DEFAULT NULL,
  p_sold_at timestamp with time zone DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_inc public.incubators%ROWTYPE;
  v_item public.incubator_inventory%ROWTYPE;
  v_product_id uuid;
  v_unit_product_cost numeric(12,3);
  v_direct_packaging numeric(12,3);
  v_gross numeric(12,3);
  v_commission numeric(12,3);
  v_net numeric(12,3);
  v_packaging numeric(12,3) := 0;
  v_materials jsonb := '[]'::jsonb;
  v_sale_id uuid;
  r record;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  SELECT * INTO v_inc FROM public.incubators WHERE id = p_incubator_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_brand(v_inc.brand_id)
    OR NOT public.has_permission('manage_inventory') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;

  SELECT * INTO v_item FROM public.incubator_inventory
  WHERE incubator_id = p_incubator_id AND variant_id = p_variant_id FOR UPDATE;
  IF NOT FOUND OR v_item.quantity < p_quantity THEN RAISE EXCEPTION 'INSUFFICIENT_INCUBATOR_STOCK'; END IF;

  SELECT v.product_id, COALESCE(v.cost_price, 0), COALESCE(p.direct_packaging_cost, 0)
  INTO v_product_id, v_unit_product_cost, v_direct_packaging
  FROM public.product_variants v JOIN public.products p ON p.id = v.product_id
  WHERE v.id = p_variant_id AND p.brand_id = v_inc.brand_id;
  IF v_product_id IS NULL THEN RAISE EXCEPTION 'VARIANT_NOT_FOUND'; END IF;

  IF v_inc.packaging_policy = 'our_bom' THEN
    v_packaging := round(v_direct_packaging * p_quantity, 3);
    FOR r IN
      SELECT pm.id, pm.unit_cost, pbi.quantity_per_unit,
        pbi.quantity_per_unit * p_quantity AS required_quantity
      FROM public.product_bom_items pbi
      JOIN public.packaging_materials pm ON pm.id = pbi.packaging_material_id
      WHERE pbi.product_id = v_product_id AND pbi.brand_id = v_inc.brand_id
      FOR UPDATE OF pm
    LOOP
      UPDATE public.packaging_materials
      SET stock_quantity = stock_quantity - r.required_quantity
      WHERE id = r.id AND stock_quantity >= r.required_quantity;
      IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_PACKAGING_STOCK'; END IF;
      v_packaging := v_packaging + round(r.unit_cost * r.required_quantity, 3);
      v_materials := v_materials || jsonb_build_array(jsonb_build_object(
        'material_id', r.id, 'quantity', r.required_quantity, 'unit_cost', r.unit_cost));
    END LOOP;
  ELSIF v_inc.packaging_policy = 'fixed' THEN
    v_packaging := round(v_inc.fixed_packaging_cost * p_quantity, 3);
  END IF;

  v_gross := round(COALESCE(p_unit_price, v_item.consignment_price) * p_quantity, 3);
  v_commission := CASE WHEN v_item.commission_type = 'percentage'
    THEN round(v_gross * v_item.commission_value / 100, 3)
    ELSE round(v_item.commission_value * p_quantity, 3) END;
  v_commission := least(v_commission, v_gross);
  v_net := v_gross - v_commission;

  UPDATE public.incubator_inventory SET quantity = quantity - p_quantity WHERE id = v_item.id;

  INSERT INTO public.incubator_sales(
    brand_id, incubator_id, variant_id, quantity, unit_price, gross_amount,
    commission_amount, net_due, sold_at, product_cost_snapshot,
    packaging_cost_snapshot, packaging_policy_snapshot, packaging_materials_snapshot
  )
  VALUES (
    v_inc.brand_id, p_incubator_id, p_variant_id, p_quantity,
    COALESCE(p_unit_price, v_item.consignment_price), v_gross, v_commission, v_net, p_sold_at,
    round(v_unit_product_cost * p_quantity, 3), round(v_packaging, 3),
    v_inc.packaging_policy, v_materials
  )
  RETURNING id INTO v_sale_id;

  -- Ledger movement for incubator stock depletion
  PERFORM public.apply_inventory_movement(
    p_brand_id => v_inc.brand_id,
    p_variant_id => p_variant_id,
    p_location => 'incubator',
    p_delta => -p_quantity,
    p_reason => 'transfer',
    p_reference_type => 'incubator_sale',
    p_reference_id => v_sale_id,
    p_idempotency_key => 'inc_sale:' || v_sale_id::text,
    p_actor_id => auth.uid(),
    p_note => 'Incubator sale recorded'
  );

  INSERT INTO public.incubator_movements(
    brand_id, incubator_id, variant_id, movement_type,
    quantity_delta, reference_type, reference_id
  )
  VALUES (v_inc.brand_id, p_incubator_id, p_variant_id, 'sale', -p_quantity, 'sale', v_sale_id);

  RETURN v_sale_id;
END;
$function$;

-- 10d. reverse_incubator_sale
CREATE OR REPLACE FUNCTION public.reverse_incubator_sale(p_sale_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_sale public.incubator_sales%ROWTYPE;
  r record;
BEGIN
  SELECT * INTO v_sale FROM public.incubator_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_brand(v_sale.brand_id)
    OR NOT public.has_permission('manage_inventory') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF v_sale.status <> 'confirmed' THEN RAISE EXCEPTION 'SALE_ALREADY_REVERSED'; END IF;
  IF v_sale.paid_amount > 0 THEN RAISE EXCEPTION 'PAID_SALE_CANNOT_BE_REVERSED'; END IF;

  UPDATE public.incubator_sales
  SET status = 'reversed',
      reversal_reason = nullif(trim(p_reason), ''),
      reversed_at = now(),
      reversed_by = auth.uid()
  WHERE id = p_sale_id;

  UPDATE public.incubator_inventory
  SET quantity = quantity + v_sale.quantity
  WHERE incubator_id = v_sale.incubator_id AND variant_id = v_sale.variant_id;

  -- Ledger movement for incubator stock restoration
  PERFORM public.apply_inventory_movement(
    p_brand_id => v_sale.brand_id,
    p_variant_id => v_sale.variant_id,
    p_location => 'incubator',
    p_delta => v_sale.quantity,
    p_reason => 'transfer',
    p_reference_type => 'incubator_sale_reversal',
    p_reference_id => p_sale_id,
    p_idempotency_key => 'inc_sale_rev:' || p_sale_id::text,
    p_actor_id => auth.uid(),
    p_note => p_reason
  );

  FOR r IN SELECT * FROM jsonb_to_recordset(v_sale.packaging_materials_snapshot)
    AS x(material_id uuid, quantity integer, unit_cost numeric)
  LOOP
    UPDATE public.packaging_materials
    SET stock_quantity = stock_quantity + r.quantity
    WHERE id = r.material_id AND brand_id = v_sale.brand_id;
  END LOOP;

  INSERT INTO public.incubator_movements(
    brand_id, incubator_id, variant_id, movement_type,
    quantity_delta, reference_type, reference_id, notes
  )
  VALUES (v_sale.brand_id, v_sale.incubator_id, v_sale.variant_id, 'sale_reversal',
    v_sale.quantity, 'sale', p_sale_id, p_reason);
END;
$function$;

NOTIFY pgrst, 'reload schema';
