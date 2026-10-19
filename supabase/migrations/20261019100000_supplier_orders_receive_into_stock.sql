-- ==============================================================================
-- Supplier orders (a tailor's order): what was ordered, what arrived, what it cost.
--
-- A store orders abayas from a tailor and forgets, by the time they arrive, what each one cost:
-- the purchase orders were an accounting note (a total and what was paid), not linked to a
-- product, a size or the stock, so nothing reached the inventory or the cost of goods.
--
-- Now:
--   * a line names the product and its size (`variant_id`), or is a cost of the whole order
--     with no piece (fabric the store bought, delivery): such a line is spread over the pieces
--     in proportion to their cost (by count when the pieces carry no cost of their own), so a
--     piece's cost is what it really cost (`purchase_order_landed_unit_cost`);
--   * `receive_purchase_order` takes what arrived (all of it or part), adds the pieces to the
--     store's stock through the ledger (`apply_inventory_movement`, reference
--     `purchase_order`), and sets each size's cost to the average of what was on the shelf and
--     what arrived (the cost of the product too while it has none), in one transaction, once
--     per request; each arrival is kept in `purchase_order_receipts`;
--   * the order's state says where the goods are (ordered, partly received, received), apart
--     from its payment (`paid_amount` against `total_amount`), and is written by the database;
--     the total is the sum of the lines, and a line's total its quantity at its cost.
-- The rules for a person's browser session are told apart from the database's own functions
-- by `current_user` (the reading of the cost guards, migration 20261013150000).
-- What arrived cannot be undone by editing the order: a received line keeps its size and cost,
-- its quantity cannot fall below what arrived, and it cannot be removed, nor its order.
-- Payments to a supplier are not expenses: the cost of goods is counted when a piece is sold.
-- ==============================================================================

-- 1. The order -----------------------------------------------------------------------------------

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS expected_at date,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled'));
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_paid_amount_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_paid_amount_check
  CHECK (paid_amount >= 0);
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_notes_length;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_notes_length
  CHECK (notes IS NULL OR length(notes) <= 2000);

CREATE INDEX IF NOT EXISTS purchase_orders_brand_created_idx
  ON public.purchase_orders (brand_id, created_at DESC);

-- 2. Its lines -----------------------------------------------------------------------------------

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS received_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_amounts_check;
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_amounts_check
  CHECK (quantity > 0 AND quantity <= 100000 AND unit_cost >= 0
         AND received_quantity >= 0 AND received_quantity <= quantity);
ALTER TABLE public.purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_description_length;
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_description_length
  CHECK (length(description) <= 300);

CREATE INDEX IF NOT EXISTS purchase_order_items_po_idx ON public.purchase_order_items (po_id);
CREATE INDEX IF NOT EXISTS purchase_order_items_variant_idx
  ON public.purchase_order_items (variant_id) WHERE variant_id IS NOT NULL;

-- 3. What arrived --------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.purchase_order_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  -- One press of "Receive": its lines share it, and a second send of the same press does nothing.
  request_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  -- What one piece cost, with its share of the order's other costs.
  unit_cost numeric(12,3) NOT NULL,
  stock_before integer NOT NULL,
  cost_before numeric(12,3) NOT NULL,
  cost_after numeric(12,3) NOT NULL,
  note text,
  received_by uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, item_id)
);

CREATE INDEX IF NOT EXISTS purchase_order_receipts_po_idx
  ON public.purchase_order_receipts (po_id, received_at);

ALTER TABLE public.purchase_order_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff who see finances" ON public.purchase_order_receipts;
CREATE POLICY "staff who see finances" ON public.purchase_order_receipts
  FOR SELECT TO authenticated
  USING (public.can_view_brand_costs(brand_id));
REVOKE ALL ON public.purchase_order_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.purchase_order_receipts TO authenticated;
GRANT ALL ON public.purchase_order_receipts TO service_role;

-- 4. The rules the screens cannot get round ------------------------------------------------------

-- An order's number, when none is given: PO-0001, PO-0002, ... per store.
CREATE OR REPLACE FUNCTION public.purchase_orders_fill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF TG_OP = 'INSERT' AND COALESCE(trim(NEW.po_number), '') = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('purchase_order_number:' || NEW.brand_id::text));
    SELECT COALESCE(max(substring(po_number FROM '^PO-(\d+)$')::integer), 0) + 1
      INTO v_next
      FROM public.purchase_orders
     WHERE brand_id = NEW.brand_id;
    NEW.po_number := 'PO-' || lpad(v_next::text, 4, '0');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_orders_fill ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_fill
  BEFORE INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.purchase_orders_fill();

-- A person's browser session (`authenticated`) sets an order's state to draft, ordered or
-- cancelled only, and not once anything has arrived; the database writes the rest. The server and
-- the database's own functions are not held back (the same reading as the cost guards).
CREATE OR REPLACE FUNCTION public.purchase_orders_guard_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.purchase_order_items
                WHERE po_id = OLD.id AND received_quantity > 0) THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_ALREADY_RECEIVED';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'ordered') THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_STATE_IS_THE_DATABASES';
    END IF;
    NEW.received_at := NULL;
    NEW.total_amount := 0;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status NOT IN ('draft', 'ordered', 'cancelled') THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_STATE_IS_THE_DATABASES';
    END IF;
    IF EXISTS (SELECT 1 FROM public.purchase_order_items
                WHERE po_id = OLD.id AND received_quantity > 0) THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_ALREADY_RECEIVED';
    END IF;
  END IF;
  -- The total is the lines' (section 5) and the arrival's moment the receiving's.
  NEW.total_amount := OLD.total_amount;
  NEW.received_at := OLD.received_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_orders_guard_state ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_guard_state
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.purchase_orders_guard_state();

-- A line: its total is its quantity at its cost, and a size belongs to the order's store and
-- names its product. For a person's browser session: what arrived is written by the receiving
-- alone, and a line that has received pieces keeps its size and cost, keeps at least what
-- arrived, and is not removed.
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

  IF NEW.variant_id IS NOT NULL THEN
    SELECT brand_id, product_id INTO v_variant_brand, v_product
      FROM public.product_variants WHERE id = NEW.variant_id;
    IF v_variant_brand IS DISTINCT FROM v_brand THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CROSS_BRAND_PURCHASE_ORDER_VARIANT';
    END IF;
    NEW.product_id := v_product;
  ELSE
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

DROP TRIGGER IF EXISTS trg_purchase_order_items_guard ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_order_items_guard();

-- 5. The order's total and state -----------------------------------------------------------------

-- The total is its lines'; the state follows what arrived (a draft and a cancelled order keep
-- theirs). Written by the database alone.
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
         COALESCE(sum(quantity) FILTER (WHERE variant_id IS NOT NULL), 0),
         COALESCE(sum(received_quantity) FILTER (WHERE variant_id IS NOT NULL), 0)
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

CREATE OR REPLACE FUNCTION public.purchase_order_items_refresh_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.purchase_order_refresh(OLD.po_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.po_id IS DISTINCT FROM OLD.po_id) THEN
    PERFORM public.purchase_order_refresh(NEW.po_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_order_items_refresh_order ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_order_items_refresh_order
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION public.purchase_order_items_refresh_order();

-- A draft put back to ordered (or an order cancelled) reads its lines again.
CREATE OR REPLACE FUNCTION public.purchase_orders_refresh_on_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'ordered' THEN
    PERFORM public.purchase_order_refresh(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_orders_refresh_on_state ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_refresh_on_state
  AFTER UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.purchase_orders_refresh_on_state();

REVOKE ALL ON FUNCTION public.purchase_orders_fill() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_orders_guard_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_order_items_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_order_items_refresh_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_orders_refresh_on_state() FROM PUBLIC, anon, authenticated;

-- 6. What one piece cost -------------------------------------------------------------------------

-- A piece's own cost and its share of the order's costs that are not pieces (fabric, delivery):
-- in proportion to the pieces' cost, or by count when no piece carries a cost of its own.
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
      COALESCE(sum(i.line_total) FILTER (WHERE i.variant_id IS NULL), 0) AS extras,
      COALESCE(sum(i.line_total) FILTER (WHERE i.variant_id IS NOT NULL), 0) AS pieces_value,
      COALESCE(sum(i.quantity) FILTER (WHERE i.variant_id IS NOT NULL), 0) AS pieces
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

-- 7. Receiving -----------------------------------------------------------------------------------

-- `p_lines`: [{ "item_id": uuid, "quantity": n }], the pieces that arrived now. Called by a
-- signed-in member of the store's staff who manages the inventory and sees its finances (the
-- order and its costs are theirs to read). `p_request_id` is one press of the button: sent again,
-- it changes nothing and answers the same.
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
     OR NOT public.has_permission('manage_inventory')
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
    IF v_item.variant_id IS NULL THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_LINE_HAS_NO_PIECE:%', v_item.id;
    END IF;
    IF v_item.received_quantity + v_qty > v_item.quantity THEN
      RAISE EXCEPTION 'RECEIVE_MORE_THAN_ORDERED:%', v_item.id;
    END IF;

    -- What was on the shelf (the store's and the partners') and what it cost, before.
    PERFORM pg_advisory_xact_lock(hashtext(v_item.variant_id::text));
    SELECT GREATEST(COALESCE(stock_main, 0) + COALESCE(stock_incubator, 0), 0)
      INTO v_on_hand FROM public.product_variants WHERE id = v_item.variant_id;
    SELECT COALESCE(cost_price, 0) INTO v_cost_before
      FROM public.variant_costs WHERE variant_id = v_item.variant_id;
    v_cost_before := COALESCE(v_cost_before, 0);

    v_unit := public.purchase_order_landed_unit_cost(v_item.id);
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

  SELECT status INTO v_po.status FROM public.purchase_orders WHERE id = p_po_id;
  RETURN jsonb_build_object('status', v_po.status, 'repeated', false);
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid, jsonb, uuid, text)
  TO authenticated, service_role;
