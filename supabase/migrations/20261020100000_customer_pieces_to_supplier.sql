-- ==============================================================================
-- A customer's made-to-order piece, sent to the tailor on a supplier order.
--
-- A customer's piece made to order went to the workshop as a stage of its order and nothing
-- more: which tailor, what that piece cost and what was owed for it were kept nowhere, and a
-- supplier order could only list the store's own stock (receiving one adds pieces to the shelf,
-- which a piece already sold to a customer must not). Now:
--
--   * `purchase_order_items.order_item_id` links a supplier order's line to the customer's order
--     line it makes. Such a line is a piece like any other (it takes its share of the order's
--     other costs and counts in what is still to come), but it is never stock;
--   * `send_order_to_supplier` sends a customer's workshop lines to a supplier in one
--     transaction: on an open order of that supplier or a new one, each at the price the tailor
--     asked this time, and moves the customer's order to "sent to the workshop". The job sheet
--     is the customer's order itself: nothing is typed twice;
--   * receiving such a line adds nothing to the stock: the customer's order line takes the cost
--     the piece really had (its profit is then right), and once every piece of that order sent to
--     a supplier has arrived, the order moves to "received from the workshop".
--
-- What a piece is, everywhere (the order's state, its share of costs, receiving): a line naming
-- a size (`variant_id`) or a customer's order line (`order_item_id`).
-- ==============================================================================

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS purchase_order_items_order_item_idx
  ON public.purchase_order_items (order_item_id) WHERE order_item_id IS NOT NULL;

-- 1. A line ------------------------------------------------------------------------------------
-- The guard of migration 20261019100000, with the customer's line added: it names its product
-- (from the order line when it has no size), and a person's browser session neither links a line
-- to a customer's order (only `send_order_to_supplier` does) nor changes what a linked line
-- makes (its order line, size and quantity); its price, before it arrives, may change.
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

-- 2. The order's state counts a customer's piece as a piece -------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_order_refresh(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(12,3);
  v_pieces integer;
  v_received integer;
  v_status text;
  v_next text;
BEGIN
  SELECT status INTO v_status FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(sum(line_total), 0),
         COALESCE(sum(quantity) FILTER (WHERE variant_id IS NOT NULL OR order_item_id IS NOT NULL), 0),
         COALESCE(sum(received_quantity) FILTER (WHERE variant_id IS NOT NULL OR order_item_id IS NOT NULL), 0)
    INTO v_total, v_pieces, v_received
    FROM public.purchase_order_items
   WHERE po_id = p_po_id;

  v_next := v_status;
  IF v_status NOT IN ('draft', 'cancelled') THEN
    v_next := CASE
      WHEN v_received = 0 THEN 'ordered'
      WHEN v_received >= v_pieces THEN 'received'
      ELSE 'partially_received'
    END;
  END IF;

  UPDATE public.purchase_orders
     SET total_amount = v_total,
         status = v_next,
         received_at = CASE
           WHEN v_next = 'received' THEN COALESCE(received_at, now())
           ELSE NULL
         END
   WHERE id = p_po_id
     AND (total_amount, status, received_at IS NULL)
         IS DISTINCT FROM (v_total, v_next, v_next <> 'received');
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_order_refresh(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_order_refresh(uuid) TO service_role;

-- 3. ...and gives it its share of the order's other costs --------------------------------------
-- `src/features/supplier-orders/lib/landed-cost.ts` is its twin for the screens.
CREATE OR REPLACE FUNCTION public.purchase_order_landed_unit_cost(p_item_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH line AS (
    SELECT po_id, unit_cost FROM public.purchase_order_items WHERE id = p_item_id
  ), sums AS (
    SELECT
      COALESCE(sum(i.line_total) FILTER (WHERE i.variant_id IS NULL AND i.order_item_id IS NULL), 0) AS extras,
      COALESCE(sum(i.line_total) FILTER (WHERE i.variant_id IS NOT NULL OR i.order_item_id IS NOT NULL), 0) AS pieces_value,
      COALESCE(sum(i.quantity) FILTER (WHERE i.variant_id IS NOT NULL OR i.order_item_id IS NOT NULL), 0) AS pieces
    FROM public.purchase_order_items i, line
    WHERE i.po_id = line.po_id
  )
  SELECT round(
    line.unit_cost + CASE
      WHEN sums.extras = 0 OR sums.pieces = 0 THEN 0
      WHEN sums.pieces_value > 0 THEN sums.extras * line.unit_cost / sums.pieces_value
      ELSE sums.extras / sums.pieces
    END, 3)
  FROM line, sums;
$$;

REVOKE ALL ON FUNCTION public.purchase_order_landed_unit_cost(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_order_landed_unit_cost(uuid) TO service_role;

-- 4. Sending a customer's pieces to a supplier --------------------------------------------------
-- `p_lines`: [{ "order_item_id": uuid, "unit_cost": number }], the customer's workshop lines to
-- send, each at the price the tailor asked. `p_po_id`: one of this supplier's open orders to add
-- them to, or null for a new order (due `p_expected_at`). Staff who handle orders and see the
-- store's finances. A line already with a supplier (on an order that is not cancelled) is not
-- sent again; sent again on the same order, nothing changes. Returns the supplier order's id.
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

    -- Already with a supplier: on this order, nothing to do; on another one, not sent twice.
    SELECT i.po_id INTO v_existing
      FROM public.purchase_order_items i
      JOIN public.purchase_orders po ON po.id = i.po_id
     WHERE i.order_item_id = v_line.id AND po.status <> 'cancelled'
     LIMIT 1;
    IF v_existing = v_po.id THEN
      CONTINUE;
    ELSIF v_existing IS NOT NULL THEN
      RAISE EXCEPTION 'ORDER_LINE_ALREADY_WITH_SUPPLIER';
    END IF;

    INSERT INTO public.purchase_order_items (
      po_id, variant_id, product_id, order_item_id, description, quantity, unit_cost, sort_order
    ) VALUES (
      v_po.id, v_line.variant_id, v_line.product_id, v_line.id,
      left(COALESCE(NULLIF(trim(v_line.description), ''), 'Customer piece'), 300),
      GREATEST(v_line.quantity, 1), v_cost, v_sort
    );
    v_sort := v_sort + 1;
  END LOOP;

  -- The customer's order is at the workshop now (unless it is already past that stage).
  IF upper(COALESCE(v_order.fulfillment_status, '')) IN ('', 'PENDING', 'NEEDS_PACKING', 'ON_HOLD', 'PACKING', 'AWAITING_TAILOR') THEN
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

-- 5. Receiving -----------------------------------------------------------------------------------
-- The function of migration 20261019100000, with a customer's piece added: it adds nothing to
-- the stock; its order line takes the cost the piece really had; and the customer's order moves
-- to "received from the workshop" once every piece of it with a supplier has arrived. Receiving
-- stock still needs `manage_inventory`; a customer's piece needs the finances alone.
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
      UPDATE public.order_items SET unit_cost = v_unit WHERE id = v_item.order_item_id;
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
