-- ==============================================================================
-- A customer's piece after it was sent: a cancel, a fault, an alteration.
--
-- Migration 20261020100000 sent a customer's made-to-order piece to a tailor on a supplier
-- order. What happens next was not written anywhere:
--
--   * the customer cancels while the piece is with the tailor (or after it arrived). The store
--     decides each time (`release_customer_piece`): stop it with the tailor (not arrived yet:
--     the line goes and nothing is owed for it), or keep it for sale: the line becomes a size of
--     the store's like any other (`released_order_item_id` remembers whose it was), so it joins
--     the stock when it arrives, or now if it already has, at what it cost;
--   * a piece comes back with a fault: it goes back to the tailor to be fixed, free
--     (`purpose = 'fix'`), and the order goes back to the workshop until it returns;
--   * the customer asks for an alteration: the piece goes to a tailor again with what to change
--     (`purpose = 'alteration'`, `work_note`) at the tailor's charge, which goes on the tailor's
--     account and onto the piece's cost when it comes back; the order stays where it is.
--
-- `send_order_to_supplier` takes each line's `purpose` and `note`; receiving a fix or an
-- alteration adds its cost to the piece's (made: the cost is the piece's). A cancelled order's
-- pieces are not sent. "Cancelled" is the stock engine's own reading of an order
-- (`order_inventory_desired_state` = released): cancelled, refunded, voided, failed.
-- ==============================================================================

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'make',
  ADD COLUMN IF NOT EXISTS work_note text,
  ADD COLUMN IF NOT EXISTS released_order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_purpose_check') THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT purchase_order_items_purpose_check CHECK (purpose IN ('make', 'fix', 'alteration'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_work_note_check') THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT purchase_order_items_work_note_check CHECK (work_note IS NULL OR length(work_note) <= 500);
  END IF;
END $$;

-- 1. A line ------------------------------------------------------------------------------------
-- The guard of migration 20261020100000; a person's browser session also neither sets what a line
-- is for nor which cancelled piece it was.
CREATE OR REPLACE FUNCTION public.purchase_order_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_brand uuid;
  v_variant_brand uuid;
  v_product uuid;
  v_person boolean := current_user IN ('authenticated', 'anon');
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_person AND OLD.received_quantity > 0 THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_LINE_ALREADY_RECEIVED';
    END IF;
    RETURN OLD;
  END IF;

  SELECT brand_id INTO v_brand FROM public.purchase_orders WHERE id = NEW.po_id;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'PURCHASE_ORDER_NOT_FOUND';
  END IF;

  IF v_person AND (
       (TG_OP = 'INSERT' AND NEW.order_item_id IS NOT NULL)
    OR (TG_OP = 'UPDATE' AND (
          NEW.order_item_id IS DISTINCT FROM OLD.order_item_id
       OR (OLD.order_item_id IS NOT NULL AND (
             NEW.variant_id IS DISTINCT FROM OLD.variant_id
          OR NEW.quantity IS DISTINCT FROM OLD.quantity))))) THEN
    RAISE EXCEPTION 'CUSTOMER_PIECE_IS_SENT_FROM_ITS_ORDER';
  END IF;

  -- What a line is for, and which cancelled customer's piece it once was, are the database's.
  IF v_person AND (
       (TG_OP = 'INSERT' AND (NEW.purpose IS DISTINCT FROM 'make' OR NEW.released_order_item_id IS NOT NULL))
    OR (TG_OP = 'UPDATE' AND (
          NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.released_order_item_id IS DISTINCT FROM OLD.released_order_item_id))) THEN
    RAISE EXCEPTION 'CUSTOMER_PIECE_IS_SENT_FROM_ITS_ORDER';
  END IF;

  IF NEW.variant_id IS NOT NULL THEN
    SELECT brand_id, product_id INTO v_variant_brand, v_product
      FROM public.product_variants WHERE id = NEW.variant_id;
    IF v_variant_brand IS DISTINCT FROM v_brand THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CROSS_BRAND_PURCHASE_ORDER_VARIANT';
    END IF;
    NEW.product_id := v_product;
  ELSIF NEW.order_item_id IS NULL THEN
    -- A cost of the whole order names no product.
    NEW.product_id := NULL;
  END IF;

  IF v_person THEN
    IF TG_OP = 'INSERT' THEN
      NEW.received_quantity := 0;
    ELSE
      NEW.received_quantity := OLD.received_quantity;
      IF OLD.received_quantity > 0 AND (
           NEW.variant_id IS DISTINCT FROM OLD.variant_id
        OR NEW.unit_cost IS DISTINCT FROM OLD.unit_cost
        OR NEW.po_id IS DISTINCT FROM OLD.po_id) THEN
        RAISE EXCEPTION 'PURCHASE_ORDER_LINE_ALREADY_RECEIVED';
      END IF;
      IF NEW.quantity < OLD.received_quantity THEN
        RAISE EXCEPTION 'PURCHASE_ORDER_LINE_BELOW_RECEIVED';
      END IF;
    END IF;
  END IF;

  NEW.line_total := round(NEW.quantity * NEW.unit_cost, 3);
  RETURN NEW;
END;
$$;

-- 2. Sending ------------------------------------------------------------------------------------
-- The function of migration 20261020100000, with each line's purpose (made, fixed, altered) and
-- what to do; a cancelled order's pieces are not sent.
CREATE OR REPLACE FUNCTION public.send_order_to_supplier(
  p_order_id uuid,
  p_vendor_id uuid,
  p_po_id uuid,
  p_lines jsonb,
  p_expected_at date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_po public.purchase_orders%ROWTYPE;
  v_entry jsonb;
  v_line public.order_items%ROWTYPE;
  v_cost numeric;
  v_existing uuid;
  v_sort integer;
  v_purpose text;
  v_work_note text;
  v_made boolean := false;
  v_fixed boolean := false;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_order.brand_id)
     OR NOT public.has_permission('manage_orders')
     OR NOT public.has_permission('view_financials') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- A cancelled order's pieces are not sent (one already sent waits for the store's choice).
  IF public.order_inventory_desired_state(v_order.status, v_order.payment_status, v_order.payment_method) = 'released' THEN
    RAISE EXCEPTION 'ORDER_CANCELLED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id AND brand_id = v_order.brand_id) THEN
    RAISE EXCEPTION 'SUPPLIER_NOT_FOUND';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'NOTHING_TO_SEND';
  END IF;

  IF p_po_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
    IF NOT FOUND OR v_po.brand_id <> v_order.brand_id OR v_po.vendor_id <> p_vendor_id THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_NOT_FOUND';
    END IF;
    IF v_po.status NOT IN ('draft', 'ordered', 'partially_received') THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_NOT_OPEN';
    END IF;
  ELSE
    INSERT INTO public.purchase_orders (brand_id, vendor_id, po_number, status, expected_at, created_by)
    VALUES (v_order.brand_id, p_vendor_id, '', 'ordered', p_expected_at, auth.uid())
    RETURNING * INTO v_po;
  END IF;

  SELECT COALESCE(max(sort_order), -1) + 1 INTO v_sort
    FROM public.purchase_order_items WHERE po_id = v_po.id;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_line FROM public.order_items
     WHERE id = (v_entry ->> 'order_item_id')::uuid AND order_id = v_order.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ORDER_LINE_NOT_FOUND';
    END IF;

    v_cost := CASE WHEN jsonb_typeof(v_entry -> 'unit_cost') = 'number'
                   THEN (v_entry ->> 'unit_cost')::numeric END;
    IF v_cost IS NULL OR v_cost < 0 OR round(v_cost, 3) <> v_cost THEN
      RAISE EXCEPTION 'INVALID_PIECE_COST';
    END IF;

    v_purpose := COALESCE(v_entry ->> 'purpose', 'make');
    IF v_purpose NOT IN ('make', 'fix', 'alteration') THEN
      RAISE EXCEPTION 'INVALID_PURPOSE';
    END IF;
    v_work_note := NULLIF(left(trim(COALESCE(v_entry ->> 'note', '')), 500), '');

    -- Made once: sent again on this order, nothing to do; on another one, not sent twice. Back
    -- for a fix or an alteration: only while it is with no supplier, and once (as for making).
    SELECT i.po_id INTO v_existing
      FROM public.purchase_order_items i
      JOIN public.purchase_orders po ON po.id = i.po_id
     WHERE i.order_item_id = v_line.id AND po.status <> 'cancelled'
       AND CASE WHEN v_purpose = 'make' THEN i.purpose = 'make'
                ELSE i.received_quantity < i.quantity END
     ORDER BY (i.po_id = v_po.id AND i.purpose = v_purpose) DESC
     LIMIT 1;
    IF v_existing = v_po.id AND EXISTS (
      SELECT 1 FROM public.purchase_order_items
       WHERE po_id = v_po.id AND order_item_id = v_line.id AND purpose = v_purpose
         AND (v_purpose = 'make' OR received_quantity < quantity)
    ) THEN
      CONTINUE;
    ELSIF v_existing IS NOT NULL THEN
      RAISE EXCEPTION 'ORDER_LINE_ALREADY_WITH_SUPPLIER';
    END IF;

    INSERT INTO public.purchase_order_items (
      po_id, variant_id, product_id, order_item_id, description, quantity, unit_cost, sort_order,
      purpose, work_note
    ) VALUES (
      v_po.id, v_line.variant_id, v_line.product_id, v_line.id,
      left(COALESCE(NULLIF(trim(v_line.description), ''), 'Customer piece'), 300),
      GREATEST(v_line.quantity, 1), v_cost, v_sort, v_purpose, v_work_note
    );
    v_made := v_made OR v_purpose = 'make';
    v_fixed := v_fixed OR v_purpose = 'fix';
    v_sort := v_sort + 1;
  END LOOP;

  -- The customer's order is at the workshop now (unless it is already past that stage). A piece
  -- back for a fix takes it back to the workshop from "received"; an alteration of a piece the
  -- customer has leaves the order where it is.
  IF (v_made AND upper(COALESCE(v_order.fulfillment_status, '')) IN ('', 'PENDING', 'NEEDS_PACKING', 'ON_HOLD', 'PACKING', 'AWAITING_TAILOR'))
     OR (v_fixed AND upper(COALESCE(v_order.fulfillment_status, '')) = 'RECEIVED_FROM_TAILOR') THEN
    UPDATE public.orders
       SET status = 'sent_to_tailor', fulfillment_status = 'SENT_TO_TAILOR', updated_at = now()
     WHERE id = v_order.id;
  END IF;

  RETURN v_po.id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_order_to_supplier(uuid, uuid, uuid, jsonb, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_order_to_supplier(uuid, uuid, uuid, jsonb, date)
  TO authenticated, service_role;

-- 3. Receiving ----------------------------------------------------------------------------------
-- The function of migration 20261020100000; a fix or an alteration adds its cost to the piece's.
CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_po_id uuid,
  p_lines jsonb,
  p_request_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_vendor text;
  v_entry jsonb;
  v_item public.purchase_order_items%ROWTYPE;
  v_qty integer;
  v_on_hand integer;
  v_cost_before numeric(12,3);
  v_unit numeric(12,3);
  v_cost_after numeric(12,3);
  v_note text;
  v_seen uuid[] := '{}';
  v_orders uuid[] := '{}';
  v_order uuid;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_ID_REQUIRED';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PURCHASE_ORDER_NOT_FOUND';
  END IF;

  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_po.brand_id)
     OR NOT public.has_permission('view_financials') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- The same press, sent twice.
  IF EXISTS (SELECT 1 FROM public.purchase_order_receipts WHERE request_id = p_request_id) THEN
    RETURN jsonb_build_object('status', v_po.status, 'repeated', true);
  END IF;

  IF v_po.status NOT IN ('ordered', 'partially_received') THEN
    RAISE EXCEPTION 'PURCHASE_ORDER_NOT_OPEN';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'NOTHING_TO_RECEIVE';
  END IF;

  SELECT name INTO v_vendor FROM public.vendors WHERE id = v_po.vendor_id;
  v_note := left(concat_ws(' · ', v_po.po_number, v_vendor, NULLIF(trim(p_note), '')), 300);

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_qty := CASE WHEN jsonb_typeof(v_entry -> 'quantity') = 'number'
                  THEN (v_entry ->> 'quantity')::numeric::integer END;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty::numeric <> (v_entry ->> 'quantity')::numeric THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    SELECT * INTO v_item FROM public.purchase_order_items
     WHERE id = (v_entry ->> 'item_id')::uuid AND po_id = p_po_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_LINE_NOT_FOUND';
    END IF;
    IF v_item.id = ANY (v_seen) THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_LINE_TWICE:%', v_item.id;
    END IF;
    v_seen := v_seen || v_item.id;
    IF v_item.variant_id IS NULL AND v_item.order_item_id IS NULL THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_LINE_HAS_NO_PIECE:%', v_item.id;
    END IF;
    IF v_item.received_quantity + v_qty > v_item.quantity THEN
      RAISE EXCEPTION 'RECEIVE_MORE_THAN_ORDERED:%', v_item.id;
    END IF;

    v_unit := public.purchase_order_landed_unit_cost(v_item.id);

    IF v_item.order_item_id IS NOT NULL THEN
      -- A customer's piece: sold already, so never stock. Its order line takes its real cost.
      SELECT COALESCE(unit_cost, 0), order_id INTO v_cost_before, v_order
        FROM public.order_items WHERE id = v_item.order_item_id FOR UPDATE;
      v_on_hand := 0;
      v_cost_after := v_unit;
      -- Made: the piece's cost. A fix or an alteration adds its cost once, at its first arrival.
      IF v_item.purpose = 'make' THEN
        UPDATE public.order_items SET unit_cost = v_unit WHERE id = v_item.order_item_id;
      ELSIF v_item.received_quantity = 0 THEN
        UPDATE public.order_items SET unit_cost = round(COALESCE(unit_cost, 0) + v_unit, 3)
         WHERE id = v_item.order_item_id;
      END IF;
      IF v_order IS NOT NULL AND NOT v_order = ANY (v_orders) THEN
        v_orders := v_orders || v_order;
      END IF;
    ELSE
      IF NOT public.has_permission('manage_inventory') THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
      END IF;

      -- What was on the shelf (the store's and the partners') and what it cost, before.
      PERFORM pg_advisory_xact_lock(hashtext(v_item.variant_id::text));
      SELECT GREATEST(COALESCE(stock_main, 0) + COALESCE(stock_incubator, 0), 0)
        INTO v_on_hand FROM public.product_variants WHERE id = v_item.variant_id;
      SELECT COALESCE(cost_price, 0) INTO v_cost_before
        FROM public.variant_costs WHERE variant_id = v_item.variant_id;
      v_cost_before := COALESCE(v_cost_before, 0);

      -- `src/features/supplier-orders/lib/landed-cost.ts` (`averageCost`) is its twin.
      v_cost_after := CASE
        WHEN v_cost_before <= 0 OR v_on_hand <= 0 THEN v_unit
        ELSE round((v_on_hand * v_cost_before + v_qty * v_unit) / (v_on_hand + v_qty), 3)
      END;

      PERFORM public.apply_inventory_movement(
        p_brand_id => v_po.brand_id,
        p_variant_id => v_item.variant_id,
        p_location => 'main',
        p_delta => v_qty,
        p_reason => 'manual_adjust',
        p_reference_type => 'purchase_order',
        p_reference_id => v_po.id,
        p_idempotency_key => 'po_receipt:' || p_request_id::text || ':' || v_item.id::text,
        p_actor_id => auth.uid(),
        p_note => v_note
      );

      INSERT INTO public.variant_costs (variant_id, brand_id, cost_price)
      VALUES (v_item.variant_id, v_po.brand_id, v_cost_after)
      ON CONFLICT (variant_id) DO UPDATE SET cost_price = EXCLUDED.cost_price, updated_at = now();

      -- A product with no cost yet takes this one (a new size starts from the product's cost).
      IF v_item.product_id IS NOT NULL THEN
        INSERT INTO public.product_costs (product_id, brand_id, cost_price)
        VALUES (v_item.product_id, v_po.brand_id, v_unit)
        ON CONFLICT (product_id) DO UPDATE SET cost_price = EXCLUDED.cost_price, updated_at = now()
          WHERE public.product_costs.cost_price <= 0;
      END IF;
    END IF;

    UPDATE public.purchase_order_items
       SET received_quantity = received_quantity + v_qty
     WHERE id = v_item.id;

    INSERT INTO public.purchase_order_receipts (
      brand_id, po_id, item_id, variant_id, request_id, quantity, unit_cost,
      stock_before, cost_before, cost_after, note, received_by
    ) VALUES (
      v_po.brand_id, v_po.id, v_item.id, v_item.variant_id, p_request_id, v_qty, v_unit,
      v_on_hand, v_cost_before, v_cost_after, NULLIF(left(trim(p_note), 300), ''), auth.uid()
    );
  END LOOP;

  -- A customer's order whose pieces with suppliers have all arrived is back from the workshop.
  FOREACH v_order IN ARRAY v_orders LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM public.purchase_order_items i
        JOIN public.purchase_orders po ON po.id = i.po_id
        JOIN public.order_items oi ON oi.id = i.order_item_id
       WHERE oi.order_id = v_order
         AND po.status <> 'cancelled'
         AND i.received_quantity < i.quantity
    ) THEN
      UPDATE public.orders
         SET status = 'received_from_tailor',
             fulfillment_status = 'RECEIVED_FROM_TAILOR',
             updated_at = now()
       WHERE id = v_order
         AND upper(COALESCE(fulfillment_status, '')) IN ('SENT_TO_TAILOR', 'SENT_TO_WORKSHOP');
    END IF;
  END LOOP;

  SELECT status INTO v_po.status FROM public.purchase_orders WHERE id = p_po_id;
  RETURN jsonb_build_object('status', v_po.status, 'repeated', false);
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, jsonb, uuid, text)
  TO authenticated, service_role;

-- 4. A customer cancels after the piece was sent ---------------------------------------------
-- The store's choice, each time: 'stop' the piece with the tailor (not arrived: the line goes,
-- nothing is owed for it), or 'stock': keep it for sale as a size of the store's. Not arrived,
-- it joins the stock when it arrives; arrived already, it joins now at what it cost (the
-- average with what is on hand, as receiving does). Only for an order that is cancelled.
CREATE OR REPLACE FUNCTION public.release_customer_piece(p_item_id uuid, p_choice text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.purchase_order_items%ROWTYPE;
  v_po public.purchase_orders%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_on_hand integer;
  v_cost_before numeric(12,3);
  v_unit numeric(12,3);
  v_cost_after numeric(12,3);
BEGIN
  SELECT * INTO v_item FROM public.purchase_order_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.order_item_id IS NULL THEN
    RAISE EXCEPTION 'PURCHASE_ORDER_LINE_NOT_FOUND';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_item.po_id FOR UPDATE;

  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_po.brand_id)
     OR NOT public.has_permission('manage_orders')
     OR NOT public.has_permission('view_financials') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'PURCHASE_ORDER_NOT_OPEN';
  END IF;

  SELECT o.* INTO v_order
    FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
   WHERE oi.id = v_item.order_item_id;
  IF NOT FOUND
     OR public.order_inventory_desired_state(v_order.status, v_order.payment_status, v_order.payment_method) <> 'released' THEN
    RAISE EXCEPTION 'ORDER_NOT_CANCELLED';
  END IF;

  IF p_choice = 'stop' THEN
    IF v_item.received_quantity > 0 THEN
      RAISE EXCEPTION 'PIECE_ALREADY_ARRIVED';
    END IF;
    DELETE FROM public.purchase_order_items WHERE id = v_item.id;
    RETURN 'stopped';
  END IF;

  IF p_choice IS DISTINCT FROM 'stock' THEN
    RAISE EXCEPTION 'INVALID_CHOICE';
  END IF;
  IF NOT public.has_permission('manage_inventory') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF v_item.purpose <> 'make' OR v_item.variant_id IS NULL THEN
    RAISE EXCEPTION 'PIECE_HAS_NO_SIZE';
  END IF;

  UPDATE public.purchase_order_items
     SET released_order_item_id = order_item_id, order_item_id = NULL
   WHERE id = v_item.id;

  IF v_item.received_quantity > 0 THEN
    v_unit := public.purchase_order_landed_unit_cost(v_item.id);
    PERFORM pg_advisory_xact_lock(hashtext(v_item.variant_id::text));
    SELECT GREATEST(COALESCE(stock_main, 0) + COALESCE(stock_incubator, 0), 0)
      INTO v_on_hand FROM public.product_variants WHERE id = v_item.variant_id;
    SELECT COALESCE(cost_price, 0) INTO v_cost_before
      FROM public.variant_costs WHERE variant_id = v_item.variant_id;
    v_cost_before := COALESCE(v_cost_before, 0);
    -- `averageCost` (`src/features/supplier-orders/lib/landed-cost.ts`) is its twin.
    v_cost_after := CASE
      WHEN v_cost_before <= 0 OR v_on_hand <= 0 THEN v_unit
      ELSE round((v_on_hand * v_cost_before + v_item.received_quantity * v_unit)
                 / (v_on_hand + v_item.received_quantity), 3)
    END;

    PERFORM public.apply_inventory_movement(
      p_brand_id => v_po.brand_id,
      p_variant_id => v_item.variant_id,
      p_location => 'main',
      p_delta => v_item.received_quantity,
      p_reason => 'manual_adjust',
      p_reference_type => 'purchase_order',
      p_reference_id => v_po.id,
      p_idempotency_key => 'po_release:' || v_item.id::text,
      p_actor_id => auth.uid(),
      p_note => left(v_po.po_number || ' · customer cancelled, kept for sale', 300)
    );

    INSERT INTO public.variant_costs (variant_id, brand_id, cost_price)
    VALUES (v_item.variant_id, v_po.brand_id, v_cost_after)
    ON CONFLICT (variant_id) DO UPDATE SET cost_price = EXCLUDED.cost_price, updated_at = now();
  END IF;

  RETURN 'stocked';
END;
$$;

REVOKE ALL ON FUNCTION public.release_customer_piece(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_customer_piece(uuid, text) TO authenticated, service_role;
