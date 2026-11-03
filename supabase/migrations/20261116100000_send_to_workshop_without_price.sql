-- ==============================================================================
-- One "Send to workshop" step, for every member of order staff (step 2 of
-- docs/workshop-flow-plan.md; the owner's decision of 2026-11-03).
--
-- Staff with `manage_orders` who may not see the store's costs (`view_financials`) could not put
-- a customer's piece on a supplier's order at all: the send moved the stage and the tailor's
-- account never heard of the piece. Now:
--
--   * `send_order_to_supplier` (the live function, read on 2026-11-03, with this change only)
--     takes their pieces at no price, marked `purchase_order_items.price_pending`, whatever cost
--     was sent; staff who see costs keep today's rule (`INVALID_PIECE_COST`). It returns the
--     supplier order's id and nothing else.
--   * `purchase_order_items_guard` (the live trigger, with this change only): only the database
--     marks a price as still to add; finance staff writing the line's price (or confirming it)
--     clear it, also after the piece arrived. When they do on an arrived piece, its order line
--     takes the cost (`purchase_order_items_price_added`), as receiving would have.
--   * `workshop_suppliers(brand)`: the store's suppliers, their language and phone, and their open
--     orders' numbers and due days, with no amount: what the send reads for staff who cannot read
--     `vendors` and `purchase_orders`.
--   * `order_workshop_pieces(order)`: where an order's pieces are (which supplier, which order,
--     due when, back yet, price still to add), with no amount, for the job sheet's header and
--     the order page, for every member of order staff.
-- ==============================================================================

ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS price_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.purchase_order_items.price_pending IS
  'A customer''s piece put on a supplier''s order by staff who cannot see costs: its price is still for finance staff to add.';

-- 1. A line --------------------------------------------------------------------------------------
-- The live guard (migration 20261021100000); a person sets no price as still to add, and finance
-- staff clear it by writing the price.
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
  v_prices boolean := false;
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
      -- A price still to add is set only by the database (a piece sent by staff who cannot see costs).
      NEW.price_pending := false;
    ELSE
      NEW.received_quantity := OLD.received_quantity;
      -- Finance staff writing the price of a piece sent without one (or confirming it as it
      -- stands) add the price; nobody else changes whether it is still to add. Such a piece may
      -- have arrived already: its price is still the store's to add.
      v_prices := OLD.price_pending AND public.has_permission('view_financials')
        AND (NEW.unit_cost IS DISTINCT FROM OLD.unit_cost OR NEW.price_pending IS FALSE);
      NEW.price_pending := CASE WHEN v_prices THEN false ELSE OLD.price_pending END;
      IF OLD.received_quantity > 0 AND (
           NEW.variant_id IS DISTINCT FROM OLD.variant_id
        OR (NEW.unit_cost IS DISTINCT FROM OLD.unit_cost AND NOT v_prices)
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

-- 2. A price added to a piece that has arrived ----------------------------------------------------
-- Receiving gave its order line the cost the line had then (none); the price added now gives the
-- line what receiving would have: a made piece its whole cost, a fix or an alteration its own cost
-- added once (what receiving added is taken off first).
CREATE OR REPLACE FUNCTION public.purchase_order_items_price_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit numeric(12,3);
  v_received numeric(12,3);
BEGIN
  IF NOT (OLD.price_pending AND NOT NEW.price_pending)
     OR NEW.order_item_id IS NULL OR NEW.received_quantity <= 0 THEN
    RETURN NULL;
  END IF;
  v_unit := public.purchase_order_landed_unit_cost(NEW.id);
  IF NEW.purpose = 'make' THEN
    UPDATE public.order_items SET unit_cost = v_unit WHERE id = NEW.order_item_id;
  ELSE
    SELECT r.unit_cost INTO v_received
      FROM public.purchase_order_receipts r
     WHERE r.item_id = NEW.id AND r.undone_at IS NULL
     ORDER BY r.received_at, r.id
     LIMIT 1;
    UPDATE public.order_items
       SET unit_cost = round(COALESCE(unit_cost, 0) - COALESCE(v_received, 0) + v_unit, 3)
     WHERE id = NEW.order_item_id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_order_items_price_added() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_purchase_order_items_price_added ON public.purchase_order_items;
-- On any update: the screen writes the price, and the guard clears the mark.
CREATE TRIGGER trg_purchase_order_items_price_added
  AFTER UPDATE ON public.purchase_order_items
  FOR EACH ROW
  WHEN (OLD.price_pending AND NOT NEW.price_pending)
  EXECUTE FUNCTION public.purchase_order_items_price_added();

-- 3. Sending --------------------------------------------------------------------------------------
-- The live function (migration 20261021100000), for order staff who cannot see costs too.
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
  v_finance boolean;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Order staff send pieces; only those who may see the store's costs price them. Anyone else's
  -- piece goes on the supplier's order with no price, for finance staff to add (the owner's
  -- decision of 2026-11-03), and no money figure is read back to them: this returns an id.
  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_order.brand_id)
     OR NOT public.has_permission('manage_orders') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  v_finance := public.has_permission('view_financials');

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

    IF v_finance THEN
      v_cost := CASE WHEN jsonb_typeof(v_entry -> 'unit_cost') = 'number'
                     THEN (v_entry ->> 'unit_cost')::numeric END;
      IF v_cost IS NULL OR v_cost < 0 OR round(v_cost, 3) <> v_cost THEN
        RAISE EXCEPTION 'INVALID_PIECE_COST';
      END IF;
    ELSE
      -- Whatever was sent: the price is for finance staff to add.
      v_cost := 0;
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
      purpose, work_note, price_pending
    ) VALUES (
      v_po.id, v_line.variant_id, v_line.product_id, v_line.id,
      left(COALESCE(NULLIF(trim(v_line.description), ''), 'Customer piece'), 300),
      GREATEST(v_line.quantity, 1), v_cost, v_sort, v_purpose, v_work_note, NOT v_finance
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

-- 4. The suppliers, for the send ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workshop_suppliers(p_brand uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(p_brand)
     OR NOT (public.has_permission('manage_orders') OR public.has_permission('view_financials')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', v.id,
             'name', v.name,
             'phone', v.phone,
             'preferred_language', v.preferred_language,
             'open_orders', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'id', po.id, 'po_number', po.po_number, 'expected_at', po.expected_at)
                      ORDER BY po.created_at DESC)
                 FROM public.purchase_orders po
                WHERE po.vendor_id = v.id AND po.brand_id = p_brand
                  AND po.status IN ('draft', 'ordered', 'partially_received')
             ), '[]'::jsonb))
           ORDER BY v.name)
      FROM public.vendors v
     WHERE v.brand_id = p_brand
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.workshop_suppliers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workshop_suppliers(uuid) TO authenticated, service_role;

-- 5. Where an order's pieces are ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_workshop_pieces(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand uuid;
BEGIN
  SELECT brand_id INTO v_brand FROM public.orders WHERE id = p_order_id;
  IF v_brand IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_brand)
     OR NOT (public.has_permission('manage_orders') OR public.has_permission('view_financials')) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'order_item_id', i.order_item_id,
             'item_id', i.id,
             'purpose', i.purpose,
             'quantity', i.quantity,
             'received_quantity', i.received_quantity,
             'price_pending', i.price_pending,
             'po_id', po.id,
             'po_number', po.po_number,
             'expected_at', po.expected_at,
             'vendor_id', v.id,
             'vendor_name', v.name,
             'vendor_phone', v.phone,
             'preferred_language', v.preferred_language)
           ORDER BY po.created_at, i.sort_order)
      FROM public.purchase_order_items i
      JOIN public.purchase_orders po ON po.id = i.po_id
      JOIN public.vendors v ON v.id = po.vendor_id
      JOIN public.order_items oi ON oi.id = i.order_item_id
     WHERE oi.order_id = p_order_id
       AND po.brand_id = v_brand
       AND po.status <> 'cancelled'
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.order_workshop_pieces(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_workshop_pieces(uuid) TO authenticated, service_role;
