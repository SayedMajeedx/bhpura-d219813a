-- Undo a supplier order's receiving.
--
-- Once one piece of a supplier order was received, nothing could change the order again: no edit,
-- no cancel, no delete (`purchase_orders_guard_state`: PURCHASE_ORDER_ALREADY_RECEIVED), and no way
-- to take a receipt back. A mistake or a test stayed for good (the owner's report of 2026-11-03:
-- Pura's PO-0001, five pieces received and counted out again).
--
-- * `undo_purchase_order_receipts(order, receipts, mode, request)`: takes back the receipts given
--   (null: every receipt of the order still standing), the latest first, in one transaction. Each
--   receipt's pieces leave the store's stock through the ledger (`correction`, reference
--   `purchase_order`: the stock history reads "Receiving undone" with a link), its line's received
--   count goes down by them, and the order's state follows (`purchase_order_refresh`: ordered once
--   nothing is received, so it can be edited, cancelled or deleted again). A size's cost goes back
--   to what it was before the receipt when nothing changed it since (its cost is still the
--   receipt's `cost_after`); otherwise it is left and the answer says so. A product's cost is
--   left as it is.
-- * Pieces already gone (sold, counted out, moved to a partner) cannot leave the store's stock.
--   `mode` says what to do: `take_out` (the default) refuses when the store holds fewer
--   (RECEIPT_PIECES_GONE); `what_is_left` takes out what the store still holds of them; `leave`
--   moves no stock and undoes the record only.
-- * A customer's piece (a line for a customer's order) is not undone here (RECEIPT_IS_A_CUSTOMER_PIECE):
--   its order's stage and cost moved with it.
-- * A receipt stays on record, marked undone (`undone_at`, `undone_by`, `undo_mode`,
--   `undo_taken_out`), until its order is deleted. Staff with `manage_inventory` and
--   `view_financials`, as for receiving; one request id writes once.

ALTER TABLE public.purchase_order_receipts
  ADD COLUMN IF NOT EXISTS undone_at timestamptz,
  ADD COLUMN IF NOT EXISTS undone_by uuid,
  ADD COLUMN IF NOT EXISTS undo_mode text,
  ADD COLUMN IF NOT EXISTS undo_taken_out integer,
  ADD COLUMN IF NOT EXISTS undo_request_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_receipts_undo_mode_check'
  ) THEN
    ALTER TABLE public.purchase_order_receipts
      ADD CONSTRAINT purchase_order_receipts_undo_mode_check
      CHECK (undo_mode IS NULL OR undo_mode IN ('take_out', 'what_is_left', 'leave'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_order_receipts_undo_request
  ON public.purchase_order_receipts (undo_request_id) WHERE undo_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.undo_purchase_order_receipts(
  p_po_id uuid,
  p_receipt_ids uuid[],
  p_mode text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_vendor text;
  v_note text;
  v_mode text := COALESCE(NULLIF(trim(p_mode), ''), 'take_out');
  v_receipt record;
  v_on_hand integer;
  v_out integer;
  v_cost numeric(12,3);
  v_undone integer := 0;
  v_pieces integer := 0;
  v_taken integer := 0;
  v_costs_kept integer := 0;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_ID_REQUIRED';
  END IF;
  IF v_mode NOT IN ('take_out', 'what_is_left', 'leave') THEN
    RAISE EXCEPTION 'INVALID_UNDO_MODE';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PURCHASE_ORDER_NOT_FOUND';
  END IF;

  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_po.brand_id)
     OR NOT public.has_permission('view_financials')
     OR NOT public.has_permission('manage_inventory') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  -- The same press, sent twice.
  IF EXISTS (SELECT 1 FROM public.purchase_order_receipts WHERE undo_request_id = p_request_id) THEN
    SELECT status INTO v_po.status FROM public.purchase_orders WHERE id = p_po_id;
    RETURN jsonb_build_object('status', v_po.status, 'repeated', true);
  END IF;

  SELECT name INTO v_vendor FROM public.vendors WHERE id = v_po.vendor_id;
  v_note := left(concat_ws(' · ', v_po.po_number, v_vendor), 300);

  IF p_receipt_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_receipt_ids) AS asked(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.purchase_order_receipts r
        WHERE r.id = asked.id AND r.po_id = p_po_id AND r.undone_at IS NULL)
  ) THEN
    RAISE EXCEPTION 'RECEIPT_NOT_FOUND';
  END IF;

  FOR v_receipt IN
    SELECT r.*, i.order_item_id, i.received_quantity AS line_received
      FROM public.purchase_order_receipts r
      JOIN public.purchase_order_items i ON i.id = r.item_id
     WHERE r.po_id = p_po_id
       AND r.undone_at IS NULL
       AND (p_receipt_ids IS NULL OR r.id = ANY (p_receipt_ids))
     ORDER BY r.received_at DESC, r.id DESC
     FOR UPDATE OF r
  LOOP
    IF v_receipt.order_item_id IS NOT NULL THEN
      RAISE EXCEPTION 'RECEIPT_IS_A_CUSTOMER_PIECE:%', v_receipt.id;
    END IF;

    v_out := 0;
    IF v_receipt.variant_id IS NOT NULL AND v_mode <> 'leave' THEN
      PERFORM pg_advisory_xact_lock(hashtext(v_receipt.variant_id::text));
      SELECT GREATEST(COALESCE(stock_main, 0), 0) INTO v_on_hand
        FROM public.product_variants WHERE id = v_receipt.variant_id FOR UPDATE;
      v_on_hand := COALESCE(v_on_hand, 0);
      IF v_on_hand < v_receipt.quantity AND v_mode = 'take_out' THEN
        RAISE EXCEPTION 'RECEIPT_PIECES_GONE:%:%', v_receipt.id, v_on_hand;
      END IF;
      v_out := LEAST(v_on_hand, v_receipt.quantity);
      IF v_out > 0 THEN
        PERFORM public.apply_inventory_movement(
          p_brand_id => v_po.brand_id,
          p_variant_id => v_receipt.variant_id,
          p_location => 'main',
          p_delta => -v_out,
          p_reason => 'correction',
          p_reference_type => 'purchase_order',
          p_reference_id => v_po.id,
          p_idempotency_key => 'po_receipt_undo:' || v_receipt.id::text,
          p_actor_id => auth.uid(),
          p_note => v_note
        );
      END IF;
    END IF;

    -- The size's cost back to before the receipt, when nothing changed it since.
    IF v_receipt.variant_id IS NOT NULL THEN
      SELECT cost_price INTO v_cost FROM public.variant_costs
       WHERE variant_id = v_receipt.variant_id FOR UPDATE;
      IF FOUND AND v_cost = v_receipt.cost_after THEN
        IF v_cost IS DISTINCT FROM v_receipt.cost_before THEN
          UPDATE public.variant_costs
             SET cost_price = COALESCE(v_receipt.cost_before, 0), updated_at = now()
           WHERE variant_id = v_receipt.variant_id;
        END IF;
      ELSIF v_cost IS DISTINCT FROM v_receipt.cost_before THEN
        v_costs_kept := v_costs_kept + 1;
      END IF;
    END IF;

    UPDATE public.purchase_order_items
       SET received_quantity = GREATEST(received_quantity - v_receipt.quantity, 0)
     WHERE id = v_receipt.item_id;

    UPDATE public.purchase_order_receipts
       SET undone_at = now(),
           undone_by = auth.uid(),
           undo_mode = v_mode,
           undo_taken_out = v_out,
           undo_request_id = p_request_id
     WHERE id = v_receipt.id;

    v_undone := v_undone + 1;
    v_pieces := v_pieces + v_receipt.quantity;
    v_taken := v_taken + v_out;
  END LOOP;

  IF v_undone = 0 THEN
    RAISE EXCEPTION 'NOTHING_TO_UNDO';
  END IF;

  PERFORM public.purchase_order_refresh(p_po_id);
  SELECT status INTO v_po.status FROM public.purchase_orders WHERE id = p_po_id;

  RETURN jsonb_build_object(
    'status', v_po.status,
    'repeated', false,
    'receipts', v_undone,
    'pieces', v_pieces,
    'taken_out', v_taken,
    'costs_kept', v_costs_kept
  );
END;
$$;

REVOKE ALL ON FUNCTION public.undo_purchase_order_receipts(uuid, uuid[], text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_purchase_order_receipts(uuid, uuid[], text, uuid) TO authenticated;
