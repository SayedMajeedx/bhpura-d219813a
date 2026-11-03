-- ==============================================================================
-- Alterations, for ready-made and custom pieces (step 3 of docs/workshop-flow-plan.md).
--
-- An alteration was a line on a supplier's order and nothing else: the customer's price was on
-- no order, a free fix and a paid alteration looked alike, a piece altered in the store's own
-- workshop left no trace, and its cost landed on the piece's own line, so last month's sale
-- moved. Now an alteration is one record on the order (`order_alterations`), from the piece's
-- line, with its own sheet and status:
--
--   * Where the customer pays for it (the owner's decision of 2026-11-03): on an order still
--     open, a new priced line on that order; on one already handed over, a new order linked to
--     it (`orders.related_order_id`, `relation = 'alteration'`), with its own invoice, so the
--     original sale stays in its month. A fix is free: no line, no order.
--   * Who does it: a supplier (the piece goes on their order through `send_order_to_supplier`,
--     purpose `alteration` or `fix`, with the changes as its work note), or the store's own
--     workshop.
--   * Receiving the piece puts the supplier's cost on the line that charges it
--     (`receive_purchase_order`, the live one with one branch added) and marks it back; so does
--     a price added later by finance staff (`purchase_order_items_price_added`).
--   * The Margins report shows those lines as "Alterations" (`rpc_reporting_margins`, the live
--     one with the line's kind added), never "not linked to a product".
--   * A store says whether it does alterations (`business_settings.offers_alterations`, the
--     owner's decision 3): on for the fashion family, off for the rest, its own to change.
--
-- Order staff (`manage_orders`) do everything; only staff who may see costs price the
-- supplier's work (the owner's decision 4: anyone else's goes on the supplier's order with its
-- price to add). The customer's price is not a cost: order staff see it.
-- ==============================================================================

-- 1. The store's setting ---------------------------------------------------------------------
-- The fashion family is `fashion` and its children (`src/lib/verticals/registry.ts`; the
-- migration test keeps this list equal to the registry's).
ALTER TABLE public.business_settings ADD COLUMN IF NOT EXISTS offers_alterations boolean;

UPDATE public.business_settings
   SET offers_alterations = COALESCE(lower(store_vertical) IN ('fashion', 'abayas'), false)
 WHERE offers_alterations IS NULL;

CREATE OR REPLACE FUNCTION public.business_settings_alterations_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.offers_alterations IS NULL THEN
    NEW.offers_alterations := COALESCE(lower(NEW.store_vertical) IN ('fashion', 'abayas'), false);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.business_settings_alterations_default() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_business_settings_alterations_default ON public.business_settings;
CREATE TRIGGER trg_business_settings_alterations_default
  BEFORE INSERT OR UPDATE OF offers_alterations ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.business_settings_alterations_default();

ALTER TABLE public.business_settings ALTER COLUMN offers_alterations SET NOT NULL;

-- 2. An order made for an alteration --------------------------------------------------------
-- Written only by the database: a browser's write of either column is ignored.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS related_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relation text;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_relation_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_relation_check
  CHECK (relation IS NULL OR relation IN ('alteration'));
CREATE INDEX IF NOT EXISTS orders_related_order_idx
  ON public.orders (related_order_id) WHERE related_order_id IS NOT NULL;
GRANT SELECT (related_order_id, relation) ON public.orders TO authenticated;

CREATE OR REPLACE FUNCTION public.orders_relation_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.related_order_id := NULL;
      NEW.relation := NULL;
    ELSE
      NEW.related_order_id := OLD.related_order_id;
      NEW.relation := OLD.relation;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.orders_relation_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_relation_guard ON public.orders;
CREATE TRIGGER trg_orders_relation_guard
  BEFORE INSERT OR UPDATE OF related_order_id, relation ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_relation_guard();

-- 3. The alterations ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_alterations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  -- The order the customer pays on: the piece's own while it is open, else the linked one.
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  source_order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  source_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('alteration', 'fix')),
  -- [{ key, label_ar, label_en, from, to }]: what changes, from the product's measurements.
  changes jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(changes) = 'array' AND jsonb_array_length(changes) <= 30
           AND octet_length(changes::text) <= 8000),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  made_by text NOT NULL CHECK (made_by IN ('supplier', 'in_house')),
  -- The supplier's line (its cost is there, for finance staff only).
  purchase_order_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  customer_charge numeric(12,3) NOT NULL DEFAULT 0 CHECK (customer_charge >= 0),
  charge_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  due_at date,
  status text NOT NULL DEFAULT 'at_workshop'
    CHECK (status IN ('open', 'at_workshop', 'back', 'handed_over', 'cancelled')),
  request_id uuid UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  back_at timestamptz,
  handed_over_at timestamptz,
  cancelled_at timestamptz,
  CONSTRAINT order_alterations_fix_is_free CHECK (kind = 'alteration' OR customer_charge = 0)
);

-- One alteration at a time per piece.
CREATE UNIQUE INDEX IF NOT EXISTS order_alterations_one_out
  ON public.order_alterations (source_item_id) WHERE status IN ('open', 'at_workshop');
CREATE INDEX IF NOT EXISTS order_alterations_order_idx ON public.order_alterations (order_id);
CREATE INDEX IF NOT EXISTS order_alterations_source_idx ON public.order_alterations (source_order_id);
CREATE INDEX IF NOT EXISTS order_alterations_po_item_idx
  ON public.order_alterations (purchase_order_item_id) WHERE purchase_order_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_alterations_charge_idx
  ON public.order_alterations (charge_item_id) WHERE charge_item_id IS NOT NULL;

ALTER TABLE public.order_alterations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_alterations_staff_read ON public.order_alterations;
CREATE POLICY order_alterations_staff_read ON public.order_alterations
  FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id)
         AND (public.has_permission('manage_orders') OR public.has_permission('view_financials')));
-- Written only through the functions below.
REVOKE ALL ON public.order_alterations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_alterations TO authenticated;
GRANT ALL ON public.order_alterations TO service_role;

-- An order line an alteration points to (the piece, or the line that charges it) stays while the
-- alteration stands: the order editor saves by replacing every line with new ones
-- (`replace_order_items`), which would erase the alteration with its piece and leave its price
-- on a line nothing knows. Refused with ORDER_LINE_HAS_ALTERATION until it is cancelled; deleting
-- the whole order still takes its lines and alterations with it.
CREATE OR REPLACE FUNCTION public.order_items_keep_alteration_lines()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM public.order_alterations
        WHERE (source_item_id = OLD.id OR charge_item_id = OLD.id) AND status <> 'cancelled')
     AND EXISTS (SELECT 1 FROM public.orders WHERE id = OLD.order_id) THEN
    RAISE EXCEPTION 'ORDER_LINE_HAS_ALTERATION' USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.order_items_keep_alteration_lines() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_items_keep_alteration_lines ON public.order_items;
CREATE TRIGGER trg_order_items_keep_alteration_lines
  BEFORE DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_keep_alteration_lines();

-- 4. Where the customer pays -------------------------------------------------------------------
-- An order handed over (or returned) takes no new line: its alteration is a new order linked to
-- it. The stages are `orderDeletable`'s (`src/lib/order-deletion.ts`); `alterationTarget` in
-- `src/features/orders/lib/alterations.ts` is the twin, run against this one by the test.
CREATE OR REPLACE FUNCTION public.order_alteration_target(p_status text, p_fulfillment text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_status, '')) IN ('completed', 'delivered', 'picked_up', 'returned')
      OR lower(COALESCE(p_fulfillment, '')) IN ('completed', 'delivered', 'picked_up', 'returned')
      THEN 'linked_order'
    ELSE 'same_order'
  END
$$;

-- The changes in a few words, for the supplier's work note.
CREATE OR REPLACE FUNCTION public.order_alteration_work_note(p_changes jsonb, p_note text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(left(concat_ws(' · ',
    NULLIF((
      SELECT string_agg(
        concat_ws(': ', NULLIF(COALESCE(c ->> 'label_en', c ->> 'label_ar', c ->> 'key'), ''),
          concat_ws(' → ', NULLIF(c ->> 'from', ''), NULLIF(c ->> 'to', ''))), '; ')
        FROM jsonb_array_elements(COALESCE(p_changes, '[]'::jsonb)) AS c
    ), ''),
    NULLIF(btrim(COALESCE(p_note, '')), '')), 500), '')
$$;

-- The piece is back: the alteration, and its own order when it has one (from the workshop).
CREATE OR REPLACE FUNCTION public.order_alteration_back(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alteration public.order_alterations%ROWTYPE;
BEGIN
  UPDATE public.order_alterations SET status = 'back', back_at = now()
   WHERE id = p_id AND status IN ('open', 'at_workshop')
   RETURNING * INTO v_alteration;
  IF FOUND AND v_alteration.order_id <> v_alteration.source_order_id THEN
    UPDATE public.orders
       SET status = 'received_from_tailor', fulfillment_status = 'RECEIVED_FROM_TAILOR',
           updated_at = now()
     WHERE id = v_alteration.order_id
       AND upper(COALESCE(fulfillment_status, '')) IN ('SENT_TO_TAILOR', 'SENT_TO_WORKSHOP');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.order_alteration_back(uuid) FROM PUBLIC, anon, authenticated;

-- An order's own price changed by a line added or taken away. The tax follows the order's own
-- rate (`reprice_order_totals`); what was collected stays what it was, so a paid order with a new
-- line owes it (part paid) and one that gave a line back may be paid again
-- (`trg_orders_payment_amounts` settles it).
CREATE OR REPLACE FUNCTION public.order_alteration_reprice(p_order_id uuid, p_delta numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  UPDATE public.orders SET subtotal = GREATEST(COALESCE(subtotal, 0) + p_delta, 0)
   WHERE id = p_order_id;
  PERFORM public.reprice_order_totals(p_order_id);
  IF lower(COALESCE(v_order.payment_status, '')) = 'paid' AND p_delta > 0 THEN
    UPDATE public.orders
       SET payment_status = 'partially_paid', advance_paid = COALESCE(v_order.advance_paid, 0)
     WHERE id = p_order_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.order_alteration_reprice(uuid, numeric) FROM PUBLIC, anon, authenticated;

-- 5. Sending a piece for an alteration or a fix ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_alteration(
  p_source_item_id uuid,
  p_kind text,
  p_changes jsonb,
  p_note text,
  p_made_by text,
  p_vendor_id uuid,
  p_po_id uuid,
  p_expected_at date,
  p_supplier_cost numeric,
  p_customer_charge numeric,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_done public.order_alterations%ROWTYPE;
  v_finance boolean;
  v_offers boolean;
  v_kind_of_product text;
  v_made boolean;
  v_changes jsonb := '[]'::jsonb;
  v_change jsonb;
  v_note text := NULLIF(left(btrim(COALESCE(p_note, '')), 500), '');
  v_charge numeric(12,3) := 0;
  v_cost numeric;
  v_target text;
  v_charged_on uuid;
  v_charge_item uuid;
  v_po uuid;
  v_po_item uuid;
  v_name_en text;
  v_name_ar text;
  v_tax numeric;
  v_alteration public.order_alterations%ROWTYPE;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_ID_REQUIRED';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_source_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_LINE_NOT_FOUND';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id FOR UPDATE;

  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_order.brand_id)
     OR NOT public.has_permission('manage_orders') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  v_finance := public.has_permission('view_financials');

  -- The same press, sent twice.
  SELECT * INTO v_done FROM public.order_alterations WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_done.brand_id <> v_order.brand_id THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
    RETURN jsonb_build_object('id', v_done.id, 'order_id', v_done.order_id,
      'po_id', (SELECT po_id FROM public.purchase_order_items WHERE id = v_done.purchase_order_item_id),
      'linked', v_done.order_id <> v_done.source_order_id, 'repeated', true);
  END IF;

  IF public.order_inventory_desired_state(v_order.status, v_order.payment_status, v_order.payment_method) = 'released' THEN
    RAISE EXCEPTION 'ORDER_CANCELLED';
  END IF;
  IF p_kind NOT IN ('alteration', 'fix') THEN
    RAISE EXCEPTION 'INVALID_KIND';
  END IF;
  IF p_made_by NOT IN ('supplier', 'in_house') THEN
    RAISE EXCEPTION 'INVALID_MAKER';
  END IF;

  -- A piece of the customer's: not a service, and not an alteration's own charge.
  SELECT item_kind INTO v_kind_of_product FROM public.products WHERE id = v_item.product_id;
  IF COALESCE(v_kind_of_product, 'product') = 'service'
     OR EXISTS (SELECT 1 FROM public.order_alterations WHERE charge_item_id = v_item.id) THEN
    RAISE EXCEPTION 'NOT_A_PIECE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_alterations
     WHERE source_item_id = v_item.id AND status IN ('open', 'at_workshop')
  ) THEN
    RAISE EXCEPTION 'ALTERATION_ALREADY_OUT';
  END IF;

  -- An alteration is a service the store sells; a fix is of a piece the store had made.
  IF p_kind = 'alteration' THEN
    SELECT offers_alterations INTO v_offers
      FROM public.business_settings WHERE brand_id = v_order.brand_id;
    IF NOT COALESCE(v_offers, false) THEN
      RAISE EXCEPTION 'ALTERATIONS_OFF';
    END IF;
  ELSE
    v_made := COALESCE(v_item.location, '') = 'custom' OR EXISTS (
      SELECT 1 FROM public.purchase_order_items
       WHERE order_item_id = v_item.id AND purpose = 'make');
    IF NOT v_made THEN
      RAISE EXCEPTION 'NOTHING_TO_FIX';
    END IF;
  END IF;

  -- What changes: kept to the shape the screens write, every field plain text.
  IF p_changes IS NOT NULL AND jsonb_typeof(p_changes) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_CHANGES';
  END IF;
  FOR v_change IN SELECT value FROM jsonb_array_elements(COALESCE(p_changes, '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_change) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_CHANGES';
    END IF;
    v_changes := v_changes || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'key', NULLIF(left(btrim(COALESCE(v_change ->> 'key', '')), 80), ''),
      'label_ar', NULLIF(left(btrim(COALESCE(v_change ->> 'label_ar', '')), 120), ''),
      'label_en', NULLIF(left(btrim(COALESCE(v_change ->> 'label_en', '')), 120), ''),
      'from', NULLIF(left(btrim(COALESCE(v_change ->> 'from', '')), 120), ''),
      'to', NULLIF(left(btrim(COALESCE(v_change ->> 'to', '')), 120), ''))));
  END LOOP;
  IF jsonb_array_length(v_changes) > 30 THEN
    RAISE EXCEPTION 'INVALID_CHANGES';
  END IF;
  IF jsonb_array_length(v_changes) = 0 AND v_note IS NULL THEN
    RAISE EXCEPTION 'NOTHING_TO_CHANGE';
  END IF;

  IF p_kind = 'alteration' THEN
    IF p_customer_charge IS NULL OR p_customer_charge < 0 OR round(p_customer_charge, 3) <> p_customer_charge THEN
      RAISE EXCEPTION 'INVALID_CHARGE';
    END IF;
    v_charge := p_customer_charge;
  END IF;

  IF p_made_by = 'supplier' THEN
    IF v_finance THEN
      v_cost := p_supplier_cost;
      IF v_cost IS NULL OR v_cost < 0 OR round(v_cost, 3) <> v_cost THEN
        RAISE EXCEPTION 'INVALID_PIECE_COST';
      END IF;
    ELSE
      v_cost := 0;
    END IF;
  END IF;

  -- Where the customer pays (decision 2).
  v_target := public.order_alteration_target(v_order.status, v_order.fulfillment_status);
  v_charged_on := v_order.id;
  IF v_charge > 0 THEN
    IF v_target = 'linked_order' THEN
      SELECT CASE WHEN NULLIF(btrim(COALESCE(vat_number, '')), '') IS NULL THEN 0
                  ELSE COALESCE(default_tax_rate, 0) END
        INTO v_tax FROM public.business_settings WHERE brand_id = v_order.brand_id;
      INSERT INTO public.orders (
        brand_id, user_id, invoice_number, channel, customer_id, customer_name_snapshot,
        customer_phone_snapshot, customer_email_snapshot, currency, language, tax_rate,
        subtotal, discount, shipping, tax_amount, total, status, fulfillment_status,
        payment_status, payment_method, fulfillment_method, branch_id, related_order_id, relation
      ) VALUES (
        v_order.brand_id, auth.uid(), 0, 'admin', v_order.customer_id, v_order.customer_name_snapshot,
        v_order.customer_phone_snapshot, v_order.customer_email_snapshot, v_order.currency,
        v_order.language, COALESCE(v_tax, 0), 0, 0, 0, 0, 0, 'sent_to_tailor', 'SENT_TO_TAILOR',
        'unpaid', COALESCE(v_order.payment_method, 'cod'), 'pickup', v_order.branch_id,
        v_order.id, 'alteration'
      )
      RETURNING id INTO v_charged_on;
    END IF;

    v_name_en := 'Alteration: ' || COALESCE(NULLIF(btrim(v_item.name_en), ''), NULLIF(btrim(v_item.description), ''), 'piece');
    v_name_ar := 'تعديل: ' || COALESCE(NULLIF(btrim(v_item.name_ar), ''), NULLIF(btrim(v_item.description), ''), 'قطعة');
    INSERT INTO public.order_items (
      order_id, brand_id, user_id, description, name_en, name_ar, quantity, unit_price, location,
      unit_cost
    ) VALUES (
      v_charged_on, v_order.brand_id, auth.uid(), left(v_name_en, 300), left(v_name_en, 300),
      left(v_name_ar, 300), 1, v_charge, 'main', CASE WHEN p_made_by = 'in_house' THEN 0 END
    )
    RETURNING id INTO v_charge_item;
    PERFORM public.order_alteration_reprice(v_charged_on, v_charge);
  END IF;

  -- Who does it: the supplier's line, as any piece sent back to a supplier.
  IF p_made_by = 'supplier' THEN
    v_po := public.send_order_to_supplier(
      v_order.id, p_vendor_id, p_po_id,
      jsonb_build_array(jsonb_build_object(
        'order_item_id', v_item.id, 'unit_cost', v_cost, 'purpose', p_kind,
        'note', public.order_alteration_work_note(v_changes, v_note))),
      p_expected_at);
    SELECT id INTO v_po_item FROM public.purchase_order_items
     WHERE po_id = v_po AND order_item_id = v_item.id AND purpose = p_kind
       AND received_quantity < quantity
     ORDER BY sort_order DESC
     LIMIT 1;
  END IF;

  INSERT INTO public.order_alterations (
    brand_id, order_id, source_order_id, source_item_id, kind, changes, note, made_by,
    purchase_order_item_id, customer_charge, charge_item_id, due_at, status, request_id, created_by
  ) VALUES (
    v_order.brand_id, v_charged_on, v_order.id, v_item.id, p_kind, v_changes, v_note, p_made_by,
    v_po_item, v_charge, v_charge_item, p_expected_at, 'at_workshop', p_request_id, auth.uid()
  )
  RETURNING * INTO v_alteration;

  RETURN jsonb_build_object('id', v_alteration.id, 'order_id', v_charged_on, 'po_id', v_po,
    'linked', v_charged_on <> v_order.id, 'repeated', false);
END;
$$;
REVOKE ALL ON FUNCTION public.create_order_alteration(uuid, text, jsonb, text, text, uuid, uuid, date, numeric, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_alteration(uuid, text, jsonb, text, text, uuid, uuid, date, numeric, numeric, uuid)
  TO authenticated, service_role;

-- 6. Back, handed over, cancelled ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_order_alteration_status(p_id uuid, p_status text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alteration public.order_alterations%ROWTYPE;
  v_line public.purchase_order_items%ROWTYPE;
BEGIN
  SELECT * INTO v_alteration FROM public.order_alterations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALTERATION_NOT_FOUND';
  END IF;
  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_alteration.brand_id)
     OR NOT public.has_permission('manage_orders') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF v_alteration.status = p_status THEN
    RETURN p_status;
  END IF;
  IF v_alteration.purchase_order_item_id IS NOT NULL THEN
    SELECT * INTO v_line FROM public.purchase_order_items
     WHERE id = v_alteration.purchase_order_item_id FOR UPDATE;
  END IF;

  IF p_status = 'back' THEN
    -- A supplier's piece is back when it is received on their order.
    IF v_alteration.made_by = 'supplier' THEN
      RAISE EXCEPTION 'RECEIVE_ON_SUPPLIER_ORDER';
    END IF;
    IF v_alteration.status NOT IN ('open', 'at_workshop') THEN
      RAISE EXCEPTION 'ALTERATION_TRANSITION_INVALID';
    END IF;
    PERFORM public.order_alteration_back(v_alteration.id);

  ELSIF p_status = 'handed_over' THEN
    IF v_alteration.status <> 'back' THEN
      RAISE EXCEPTION 'ALTERATION_TRANSITION_INVALID';
    END IF;
    UPDATE public.order_alterations SET status = 'handed_over', handed_over_at = now()
     WHERE id = v_alteration.id;

  ELSIF p_status = 'cancelled' THEN
    -- Before the work is back: the supplier's line goes (nothing is owed for it), and so does
    -- the customer's price (a line taken off the open order, or the alteration's own order
    -- cancelled; money it took is returned by the store, as for any cancelled order).
    IF v_alteration.status NOT IN ('open', 'at_workshop') THEN
      RAISE EXCEPTION 'ALTERATION_ALREADY_BACK';
    END IF;
    IF v_line.id IS NOT NULL THEN
      IF v_line.received_quantity > 0 THEN
        RAISE EXCEPTION 'ALTERATION_ALREADY_BACK';
      END IF;
      DELETE FROM public.purchase_order_items WHERE id = v_line.id;
    END IF;
    -- Cancelled first: its charge line may go then (`order_items_keep_alteration_lines`).
    UPDATE public.order_alterations SET status = 'cancelled', cancelled_at = now()
     WHERE id = v_alteration.id;
    IF v_alteration.charge_item_id IS NOT NULL THEN
      IF v_alteration.order_id = v_alteration.source_order_id THEN
        DELETE FROM public.order_items WHERE id = v_alteration.charge_item_id;
        PERFORM public.order_alteration_reprice(v_alteration.order_id, -v_alteration.customer_charge);
      ELSE
        UPDATE public.orders
           SET status = 'cancelled', fulfillment_status = 'CANCELLED', updated_at = now()
         WHERE id = v_alteration.order_id;
      END IF;
    END IF;

  ELSE
    RAISE EXCEPTION 'ALTERATION_TRANSITION_INVALID';
  END IF;

  RETURN p_status;
END;
$$;
REVOKE ALL ON FUNCTION public.set_order_alteration_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_alteration_status(uuid, text) TO authenticated, service_role;

-- 7. A price added after the piece arrived --------------------------------------------------------
-- The live function (migration 20261116100000): an alteration's cost goes on its own line.
CREATE OR REPLACE FUNCTION public.purchase_order_items_price_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit numeric(12,3);
  v_received numeric(12,3);
  v_charge_item uuid;
BEGIN
  IF NOT (OLD.price_pending AND NOT NEW.price_pending)
     OR NEW.order_item_id IS NULL OR NEW.received_quantity <= 0 THEN
    RETURN NULL;
  END IF;
  v_unit := public.purchase_order_landed_unit_cost(NEW.id);
  SELECT charge_item_id INTO v_charge_item FROM public.order_alterations
   WHERE purchase_order_item_id = NEW.id AND status <> 'cancelled' AND charge_item_id IS NOT NULL
   LIMIT 1;
  IF v_charge_item IS NOT NULL THEN
    UPDATE public.order_items SET unit_cost = round(v_unit * GREATEST(NEW.quantity, 1), 3)
     WHERE id = v_charge_item;
  ELSIF NEW.purpose = 'make' THEN
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

-- 8. Receiving -------------------------------------------------------------------------------------
-- The live function (migration 20261021100000), with an alteration's cost on its own line.
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
  v_alteration public.order_alterations%ROWTYPE;
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
      -- An alteration the customer pays for: its cost sits on the line that charges it (so its
      -- price and cost are together, and the piece's own sale, perhaps last month's, never
      -- moves). Otherwise, made: the piece's cost; a fix or an alteration adds its cost once, at
      -- its first arrival.
      SELECT * INTO v_alteration FROM public.order_alterations
       WHERE purchase_order_item_id = v_item.id AND status <> 'cancelled'
       LIMIT 1;
      IF v_alteration.charge_item_id IS NOT NULL THEN
        UPDATE public.order_items SET unit_cost = round(v_unit * GREATEST(v_item.quantity, 1), 3)
         WHERE id = v_alteration.charge_item_id;
      ELSIF v_item.purpose = 'make' THEN
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

    -- An alteration whose piece is all back is back; its own order, when it has one, is back
    -- from the workshop.
    IF v_alteration.id IS NOT NULL AND v_item.received_quantity + v_qty >= v_item.quantity THEN
      PERFORM public.order_alteration_back(v_alteration.id);
    END IF;
    v_alteration := NULL;

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

-- 9. Margins -----------------------------------------------------------------------------------
-- The live function (migration 20261021160000), with each line's kind: an alteration's charge
-- is its own row ("Alterations"), apart from the lines not linked to a product.
CREATE OR REPLACE FUNCTION public.rpc_reporting_margins(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_include_historical boolean DEFAULT false,
  p_brand_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
BEGIN
  RETURN COALESCE((
    WITH sold AS (
      SELECT o.* FROM public.orders o
      WHERE o.brand_id = v_brand_id
        AND o.created_at >= p_start_date AND o.created_at < p_end_date
        AND public.reporting_counts_order(o.status, p_include_historical)
    ),
    lines AS (
      SELECT o.id AS order_id, o.currency, oi.product_id, CASE WHEN EXISTS (
          SELECT 1 FROM public.order_alterations a WHERE a.charge_item_id = oi.id
        ) THEN 'alteration' END AS kind,
        oi.quantity, oi.unit_cost,
        COALESCE(o.subtotal, 0) AS order_subtotal, COALESCE(o.discount, 0) AS order_discount,
        lower(COALESCE(o.fulfillment_status, o.status, '')) IN
          ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up') AS has_left,
        COALESCE(oi.packaging_cost_snapshot, 0) AS packaging,
        GREATEST(COALESCE(oi.line_total, 0), 0) AS value,
        sum(GREATEST(COALESCE(oi.line_total, 0), 0)) OVER (PARTITION BY o.id) AS order_value,
        oi.quantity::numeric / NULLIF(sum(oi.quantity) OVER (PARTITION BY o.id), 0) AS quantity_share
      FROM sold o
      JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
    ),
    store_lines AS (
      SELECT currency, product_id, kind,
        sum(quantity)::numeric AS units,
        sum(order_subtotal * CASE WHEN order_value > 0 THEN value / order_value
          ELSE COALESCE(quantity_share, 0) END) AS gross_sales,
        sum(order_discount * CASE WHEN order_value > 0 THEN value / order_value
          ELSE COALESCE(quantity_share, 0) END) AS discounts,
        sum(quantity * (COALESCE(unit_cost, 0) + CASE WHEN has_left THEN packaging ELSE 0 END)) AS cost,
        sum(quantity) FILTER (WHERE unit_cost IS NULL)::numeric AS missing_cost_units
      FROM lines GROUP BY currency, product_id, kind
    ),
    returned AS (
      -- A processed return's merchandise refund, shared over the pieces it returned.
      SELECT o.currency, COALESCE(ri.product_id, oi.product_id) AS product_id,
        CASE WHEN EXISTS (
          SELECT 1 FROM public.order_alterations a WHERE a.charge_item_id = oi.id
        ) THEN 'alteration' END AS kind,
        GREATEST(rr.total_item_refund - rr.pro_rated_discount_deduction, 0) *
          CASE WHEN sum(GREATEST(COALESCE(ri.total_price, 0), 0)) OVER (PARTITION BY rr.id) > 0
            THEN GREATEST(COALESCE(ri.total_price, 0), 0)
              / sum(GREATEST(COALESCE(ri.total_price, 0), 0)) OVER (PARTITION BY rr.id)
            ELSE 1.0 / count(*) OVER (PARTITION BY rr.id) END AS deduction,
        CASE WHEN ri.restocked THEN COALESCE(ri.restocked_quantity, 0) * COALESCE(oi.unit_cost, 0)
          ELSE 0 END AS cost_back
      FROM public.return_requests rr
      JOIN public.orders o ON o.id = rr.order_id AND o.brand_id = rr.brand_id
      JOIN public.return_items ri ON ri.return_id = rr.id AND ri.brand_id = rr.brand_id
      LEFT JOIN public.order_items oi ON oi.id = ri.order_item_id
      WHERE rr.brand_id = v_brand_id
        AND rr.refund_status = 'processed'
        AND rr.refund_processed_at >= p_start_date AND rr.refund_processed_at < p_end_date
        AND public.order_counts_as_sold(o.status)
    ),
    refunded_orders AS (
      -- A refund with no return record: the order's total, over its lines.
      SELECT o.currency, oi.product_id, CASE WHEN EXISTS (
          SELECT 1 FROM public.order_alterations a WHERE a.charge_item_id = oi.id
        ) THEN 'alteration' END AS kind,
        o.total * CASE
          WHEN sum(GREATEST(COALESCE(oi.line_total, 0), 0)) OVER (PARTITION BY o.id) > 0
            THEN GREATEST(COALESCE(oi.line_total, 0), 0)
              / sum(GREATEST(COALESCE(oi.line_total, 0), 0)) OVER (PARTITION BY o.id)
          ELSE 1.0 / count(*) OVER (PARTITION BY o.id) END AS deduction
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
      WHERE o.brand_id = v_brand_id
        AND lower(COALESCE(o.payment_status, '')) = 'refunded'
        AND o.created_at >= p_start_date AND o.created_at < p_end_date
        AND public.order_counts_as_sold(o.status)
        AND NOT EXISTS (
          SELECT 1 FROM public.return_requests r
          WHERE r.order_id = o.id AND r.refund_status = 'processed'
        )
    ),
    returns_by_product AS (
      SELECT currency, product_id, kind, sum(deduction) AS returns, sum(cost_back) AS cost_back
      FROM (
        SELECT currency, product_id, kind, deduction, cost_back FROM returned
        UNION ALL
        SELECT currency, product_id, kind, deduction, 0 FROM refunded_orders
      ) r
      GROUP BY currency, product_id, kind
    ),
    partner AS (
      SELECT i.currency, v.product_id, NULL::text AS kind,
        sum(s.quantity)::numeric AS units,
        sum(s.gross_amount) AS gross_sales,
        sum(s.product_cost_snapshot + s.packaging_cost_snapshot) AS cost
      FROM public.incubator_sales s
      JOIN public.incubators i ON i.id = s.incubator_id
      JOIN public.product_variants v ON v.id = s.variant_id
      WHERE s.brand_id = v_brand_id AND s.status = 'confirmed'
        AND s.sold_at >= p_start_date AND s.sold_at < p_end_date
      GROUP BY i.currency, v.product_id
    ),
    keys AS (
      SELECT currency, product_id, kind FROM store_lines
      UNION SELECT currency, product_id, kind FROM returns_by_product
      UNION SELECT currency, product_id, kind FROM partner
    )
    SELECT jsonb_agg(jsonb_build_object(
      'currency', k.currency,
      'product_id', k.product_id,
      'line_kind', k.kind,
      'product_name', p.name,
      'product_name_ar', p.name_ar,
      'category', cat.slug,
      'category_name', COALESCE(cat.name_en, p.category),
      'category_name_ar', cat.name_ar,
      'units', COALESCE(sl.units, 0) + COALESCE(pa.units, 0),
      'partner_units', COALESCE(pa.units, 0),
      -- Full precision: a product's share is rounded only where it is shown, so the products
      -- add up to the statement to the fils however many there are.
      'gross_sales', COALESCE(sl.gross_sales, 0) + COALESCE(pa.gross_sales, 0),
      'partner_sales', COALESCE(pa.gross_sales, 0),
      'discounts', COALESCE(sl.discounts, 0),
      'returns', COALESCE(rp.returns, 0),
      -- Not held at zero per product: a restocked return of an earlier sale gives its cost back
      -- in the period it was processed, as the statement counts it.
      'cost_of_goods', COALESCE(sl.cost, 0) + COALESCE(pa.cost, 0) - COALESCE(rp.cost_back, 0),
      'missing_cost_units', COALESCE(sl.missing_cost_units, 0)
    ) ORDER BY k.currency, p.name NULLS LAST)
    FROM keys k
    LEFT JOIN public.products p ON p.id = k.product_id
    LEFT JOIN LATERAL (
      SELECT c.slug, c.name_en, c.name_ar FROM public.categories c
      WHERE c.brand_id = v_brand_id AND p.category IS NOT NULL
        AND (c.slug = p.category OR lower(c.name_en) = lower(p.category))
      ORDER BY (c.slug = p.category) DESC
      LIMIT 1
    ) cat ON true
    LEFT JOIN store_lines sl ON sl.currency = k.currency AND sl.product_id IS NOT DISTINCT FROM k.product_id
      AND sl.kind IS NOT DISTINCT FROM k.kind
    LEFT JOIN returns_by_product rp ON rp.currency = k.currency AND rp.product_id IS NOT DISTINCT FROM k.product_id
      AND rp.kind IS NOT DISTINCT FROM k.kind
    LEFT JOIN partner pa ON pa.currency = k.currency AND pa.product_id IS NOT DISTINCT FROM k.product_id
      AND pa.kind IS NOT DISTINCT FROM k.kind
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_reporting_margins(timestamptz, timestamptz, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_margins(timestamptz, timestamptz, boolean, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
