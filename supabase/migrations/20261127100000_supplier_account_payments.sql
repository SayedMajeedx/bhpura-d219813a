-- ==============================================================================
-- A payment goes to the supplier, not to one order (the owner's report of 2026-11-09).
--
-- A payment was tied to one supplier order and never more than that order still owed, so one
-- transfer to a tailor covering five orders had to be typed as five payments (Pura's 114 BHD of
-- 9 November), money paid ahead of prices could not be recorded at all, and when were the
-- payments, by what means, could only be read order by order.
--
-- Now a payment is the supplier's (`supplier_payments`: the day, the amount, how it was paid,
-- its reference and a note), and what it paid is spread over that supplier's orders as the rows
-- of `purchase_order_payments` (each now names its payment, `supplier_payment_id`), so an
-- order's `paid_amount` is still the sum of what stands on it, written by the database alone.
-- A payment is spread on the orders the store chose, then on the oldest that still owe; what is
-- left is the supplier's credit with the store, and the database spends it on the next order
-- that owes (`supplier_account_rebalance`, run after every payment, taking back, and change of an
-- order's total, state or supplier). An order cancelled, put back to a draft or given to another
-- supplier gives what it held back to the payments that paid it; an order whose total fell
-- below what it holds gives back the excess, the latest first.
--
-- Every payment recorded before stays as it was: each becomes a payment of its own, spread on
-- its order, with no method (it was not asked). `record_supplier_payment` and
-- `void_supplier_payment` keep their names for pages still open across the release: the first
-- records a payment on one order, the second takes back the whole payment the row belongs to.
--
-- A payment to a supplier is still not an expense and moves no cash box: the cost of goods is
-- counted when a piece sells. The month pack's supplier sheet now lists payments, with the
-- orders each paid, how it was paid and its reference, and leaves drafts out of what is owed.
-- ==============================================================================

-- 1. The supplier's payments --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  -- One press of "Record payment": sent again, it records nothing more.
  request_id uuid NOT NULL UNIQUE,
  amount numeric(12,3) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL DEFAULT current_date,
  -- How it was paid; null for a payment recorded before it was asked.
  method text CHECK (method IS NULL OR method IN ('cash', 'benefit', 'bank', 'card')),
  reference text CHECK (reference IS NULL OR length(reference) <= 100),
  note text CHECK (note IS NULL OR length(note) <= 300),
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text CHECK (void_reason IS NULL OR length(void_reason) <= 300),
  CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);

CREATE INDEX IF NOT EXISTS supplier_payments_vendor_idx
  ON public.supplier_payments (vendor_id, paid_on);
CREATE INDEX IF NOT EXISTS supplier_payments_brand_idx
  ON public.supplier_payments (brand_id, paid_on);

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff who see finances" ON public.supplier_payments;
CREATE POLICY "staff who see finances" ON public.supplier_payments
  FOR SELECT TO authenticated
  USING (public.can_view_brand_costs(brand_id));
REVOKE ALL ON public.supplier_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;

-- 2. What a payment paid on each order ------------------------------------------------------------

ALTER TABLE public.purchase_order_payments
  ADD COLUMN IF NOT EXISTS supplier_payment_id uuid
    REFERENCES public.supplier_payments(id) ON DELETE CASCADE;

-- Every payment recorded before becomes a payment of its own (same id, request, day, note and
-- record of taking back), spread entirely on its order.
INSERT INTO public.supplier_payments (
  id, brand_id, vendor_id, request_id, amount, paid_on, method, note, recorded_by, created_at,
  voided_at, voided_by, void_reason
)
SELECT p.id, p.brand_id, po.vendor_id, p.request_id, p.amount, p.paid_on, NULL, p.note,
       p.recorded_by, p.created_at, p.voided_at, p.voided_by, p.void_reason
  FROM public.purchase_order_payments p
  JOIN public.purchase_orders po ON po.id = p.po_id
 WHERE p.supplier_payment_id IS NULL
ON CONFLICT (id) DO NOTHING;

UPDATE public.purchase_order_payments
   SET supplier_payment_id = id
 WHERE supplier_payment_id IS NULL;

ALTER TABLE public.purchase_order_payments ALTER COLUMN supplier_payment_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS purchase_order_payments_payment_idx
  ON public.purchase_order_payments (supplier_payment_id);

-- 3. Spreading a supplier's payments over their orders --------------------------------------------

-- Gives back what an order may not hold, then spends every payment's credit on the oldest orders
-- that still owe. The database's own work: no browser calls it.
CREATE OR REPLACE FUNCTION public.supplier_account_rebalance(p_vendor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po record;
  v_row record;
  v_pay record;
  v_excess numeric(12,3);
  v_free numeric(12,3);
  v_take numeric(12,3);
BEGIN
  IF p_vendor_id IS NULL THEN RETURN; END IF;
  -- One rebalance at a time per supplier.
  PERFORM 1 FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;

  -- An order that may hold nothing (a draft, a cancelled order, or one now another supplier's)
  -- gives back what this supplier's payments put on it, and what it holds of this supplier's.
  DELETE FROM public.purchase_order_payments a
   USING public.purchase_orders po, public.supplier_payments sp
   WHERE a.po_id = po.id
     AND a.supplier_payment_id = sp.id
     AND a.voided_at IS NULL
     AND (sp.vendor_id = p_vendor_id OR po.vendor_id = p_vendor_id)
     AND (po.status IN ('draft', 'cancelled') OR po.vendor_id <> sp.vendor_id);

  -- An order holding more than its total gives back the excess, the latest payment first.
  FOR v_po IN
    SELECT id, total_amount, paid_amount
      FROM public.purchase_orders
     WHERE vendor_id = p_vendor_id
       AND status NOT IN ('draft', 'cancelled')
       AND paid_amount > total_amount
  LOOP
    v_excess := v_po.paid_amount - v_po.total_amount;
    FOR v_row IN
      SELECT id, amount
        FROM public.purchase_order_payments
       WHERE po_id = v_po.id AND voided_at IS NULL
       ORDER BY paid_on DESC, created_at DESC, id DESC
    LOOP
      EXIT WHEN v_excess <= 0;
      IF v_row.amount <= v_excess THEN
        DELETE FROM public.purchase_order_payments WHERE id = v_row.id;
        v_excess := v_excess - v_row.amount;
      ELSE
        UPDATE public.purchase_order_payments SET amount = amount - v_excess WHERE id = v_row.id;
        v_excess := 0;
      END IF;
    END LOOP;
  END LOOP;

  -- Each payment's credit, the earliest payment first, on the oldest orders that still owe.
  FOR v_pay IN
    SELECT sp.id, sp.brand_id, sp.paid_on,
           sp.amount - COALESCE((
             SELECT sum(a.amount) FROM public.purchase_order_payments a
              WHERE a.supplier_payment_id = sp.id AND a.voided_at IS NULL
           ), 0) AS free
      FROM public.supplier_payments sp
     WHERE sp.vendor_id = p_vendor_id AND sp.voided_at IS NULL
     ORDER BY sp.paid_on, sp.created_at, sp.id
  LOOP
    CONTINUE WHEN v_pay.free <= 0;
    v_free := v_pay.free;
    FOR v_po IN
      SELECT id, total_amount - paid_amount AS owed
        FROM public.purchase_orders
       WHERE vendor_id = p_vendor_id
         AND brand_id = v_pay.brand_id
         AND status NOT IN ('draft', 'cancelled')
         AND total_amount > paid_amount
       ORDER BY created_at, po_number, id
    LOOP
      EXIT WHEN v_free <= 0;
      v_take := least(v_free, v_po.owed);
      INSERT INTO public.purchase_order_payments (
        brand_id, po_id, request_id, amount, paid_on, supplier_payment_id
      ) VALUES (
        v_pay.brand_id, v_po.id, gen_random_uuid(), v_take, v_pay.paid_on, v_pay.id
      );
      v_free := v_free - v_take;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_account_rebalance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_account_rebalance(uuid) TO service_role;

-- An order's total, state or supplier changed: its supplier's money is spread again.
CREATE OR REPLACE FUNCTION public.purchase_orders_supplier_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.vendor_id IS DISTINCT FROM NEW.vendor_id THEN
    PERFORM public.supplier_account_rebalance(OLD.vendor_id);
  END IF;
  PERFORM public.supplier_account_rebalance(NEW.vendor_id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.purchase_orders_supplier_balance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_purchase_orders_z_supplier_balance ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_z_supplier_balance
  AFTER UPDATE ON public.purchase_orders
  FOR EACH ROW
  WHEN (OLD.total_amount IS DISTINCT FROM NEW.total_amount
     OR OLD.status IS DISTINCT FROM NEW.status
     OR OLD.vendor_id IS DISTINCT FROM NEW.vendor_id)
  EXECUTE FUNCTION public.purchase_orders_supplier_balance();

-- 4. Recording and taking back -------------------------------------------------------------------

-- A payment to a supplier: spread on the orders given (each at most what it owes), then on the
-- oldest that owe; the rest is credit. The checks are the callers'.
CREATE OR REPLACE FUNCTION public.supplier_payment_record_internal(
  p_vendor_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_method text,
  p_reference text,
  p_note text,
  p_allocations jsonb,
  p_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor public.vendors%ROWTYPE;
  v_id uuid;
  v_item jsonb;
  v_po public.purchase_orders%ROWTYPE;
  v_part numeric;
  v_given numeric := 0;
  v_seen uuid[] := '{}';
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_ID_REQUIRED';
  END IF;
  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPLIER_NOT_FOUND';
  END IF;

  SELECT id INTO v_id FROM public.supplier_payments WHERE request_id = p_request_id;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 3) <> p_amount THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT';
  END IF;
  IF p_paid_on IS NULL OR p_paid_on > current_date + 1 THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_DATE';
  END IF;
  IF p_method IS NOT NULL AND p_method NOT IN ('cash', 'benefit', 'bank', 'card') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD';
  END IF;
  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_ALLOCATIONS';
  END IF;

  INSERT INTO public.supplier_payments (
    brand_id, vendor_id, request_id, amount, paid_on, method, reference, note, recorded_by
  ) VALUES (
    v_vendor.brand_id, v_vendor.id, p_request_id, p_amount, p_paid_on, p_method,
    NULLIF(left(trim(p_reference), 100), ''), NULLIF(left(trim(p_note), 300), ''), auth.uid()
  )
  RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) LOOP
    BEGIN
      v_part := (v_item->>'amount')::numeric;
      SELECT * INTO v_po FROM public.purchase_orders
       WHERE id = (v_item->>'po_id')::uuid FOR UPDATE;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'INVALID_ALLOCATIONS';
    END;
    IF NOT FOUND OR v_po.vendor_id <> v_vendor.id OR v_po.brand_id <> v_vendor.brand_id THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_NOT_FOUND';
    END IF;
    IF v_po.status IN ('draft', 'cancelled') THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_NOT_OPEN';
    END IF;
    IF v_po.id = ANY (v_seen) THEN
      RAISE EXCEPTION 'INVALID_ALLOCATIONS';
    END IF;
    v_seen := v_seen || v_po.id;
    IF v_part IS NULL OR v_part <= 0 OR round(v_part, 3) <> v_part THEN
      RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT';
    END IF;
    IF v_part > v_po.total_amount - v_po.paid_amount THEN
      RAISE EXCEPTION 'PAYMENT_MORE_THAN_OWED';
    END IF;
    v_given := v_given + v_part;
    IF v_given > p_amount THEN
      RAISE EXCEPTION 'ALLOCATIONS_MORE_THAN_PAYMENT';
    END IF;
    INSERT INTO public.purchase_order_payments (
      brand_id, po_id, request_id, amount, paid_on, recorded_by, supplier_payment_id
    ) VALUES (
      v_po.brand_id, v_po.id, gen_random_uuid(), v_part, p_paid_on, auth.uid(), v_id
    );
  END LOOP;

  PERFORM public.supplier_account_rebalance(v_vendor.id);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_payment_record_internal(uuid, numeric, date, text, text, text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_payment_record_internal(uuid, numeric, date, text, text, text, jsonb, uuid)
  TO service_role;

-- A payment to a supplier, by staff who see the store's finances; once per press.
CREATE OR REPLACE FUNCTION public.record_supplier_account_payment(
  p_vendor_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_method text,
  p_reference text,
  p_note text,
  p_allocations jsonb,
  p_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand uuid;
BEGIN
  SELECT brand_id INTO v_brand FROM public.vendors WHERE id = p_vendor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUPPLIER_NOT_FOUND';
  END IF;
  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_brand)
     OR NOT public.has_permission('view_financials') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF p_method IS NULL THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD';
  END IF;
  RETURN public.supplier_payment_record_internal(
    p_vendor_id, p_amount, p_paid_on, p_method, p_reference, p_note, p_allocations, p_request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_supplier_account_payment(uuid, numeric, date, text, text, text, jsonb, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_account_payment(uuid, numeric, date, text, text, text, jsonb, uuid)
  TO authenticated, service_role;

-- The order page's payment, kept for pages open across the release: a payment on this order,
-- never more than it owes.
CREATE OR REPLACE FUNCTION public.record_supplier_payment(
  p_po_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_request_id uuid,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_ID_REQUIRED';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PURCHASE_ORDER_NOT_FOUND';
  END IF;
  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_po.brand_id)
     OR NOT public.has_permission('view_financials') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  SELECT id INTO v_id FROM public.supplier_payments WHERE request_id = p_request_id;
  IF FOUND THEN
    RETURN v_id;
  END IF;
  IF v_po.status IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'PURCHASE_ORDER_NOT_OPEN';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 3) <> p_amount THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT';
  END IF;
  IF p_amount > v_po.total_amount - v_po.paid_amount THEN
    RAISE EXCEPTION 'PAYMENT_MORE_THAN_OWED';
  END IF;
  RETURN public.supplier_payment_record_internal(
    v_po.vendor_id, p_amount, p_paid_on, NULL, NULL, p_note,
    jsonb_build_array(jsonb_build_object('po_id', v_po.id, 'amount', p_amount)), p_request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_supplier_payment(uuid, numeric, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(uuid, numeric, date, uuid, text)
  TO authenticated, service_role;

-- Takes a payment back: it and what it paid on each order stay on record with who and why, and
-- count nowhere; the supplier's other credit fills what it leaves owed.
CREATE OR REPLACE FUNCTION public.void_supplier_account_payment(p_payment_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.supplier_payments%ROWTYPE;
  v_reason text;
BEGIN
  SELECT * INTO v_payment FROM public.supplier_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;
  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_payment.brand_id)
     OR NOT public.has_permission('view_financials') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF v_payment.voided_at IS NOT NULL THEN
    RETURN;
  END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'VOID_REASON_REQUIRED';
  END IF;
  v_reason := left(trim(p_reason), 300);

  UPDATE public.supplier_payments
     SET voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
   WHERE id = p_payment_id;
  UPDATE public.purchase_order_payments
     SET voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
   WHERE supplier_payment_id = p_payment_id AND voided_at IS NULL;

  PERFORM public.supplier_account_rebalance(v_payment.vendor_id);
END;
$$;

REVOKE ALL ON FUNCTION public.void_supplier_account_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_supplier_account_payment(uuid, text) TO authenticated, service_role;

-- The order page's "take back", kept for pages open across the release: takes back the whole
-- payment the row belongs to.
CREATE OR REPLACE FUNCTION public.void_supplier_payment(p_payment_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment uuid;
BEGIN
  SELECT supplier_payment_id INTO v_payment
    FROM public.purchase_order_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    SELECT id INTO v_payment FROM public.supplier_payments WHERE id = p_payment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
    END IF;
  END IF;
  PERFORM public.void_supplier_account_payment(v_payment, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.void_supplier_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_supplier_payment(uuid, text) TO authenticated, service_role;

-- Every supplier's money spread once, by the rule above (the payments before were already spread
-- on their own orders; a cancelled order's payment becomes credit).
DO $$
DECLARE v uuid;
BEGIN
  FOR v IN SELECT DISTINCT vendor_id FROM public.supplier_payments LOOP
    PERFORM public.supplier_account_rebalance(v);
  END LOOP;
END $$;

-- 5. The month pack's supplier sheet ----------------------------------------------------------

-- The month's payments to suppliers, one row a payment with the orders it paid, how it was paid
-- and its reference (a payment's credit not yet spent is still a payment of the month); what is
-- owed leaves drafts out. The rest of the function is the live one, unchanged.
CREATE OR REPLACE FUNCTION public.rpc_reporting_month_pack(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_tz text DEFAULT 'UTC',
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
  v_first date := (p_start_date AT TIME ZONE p_tz)::date;
  v_last date := (p_end_date AT TIME ZONE p_tz)::date;
BEGIN
  RETURN jsonb_build_object(
    'sales', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'invoice_number', o.invoice_number,
        'created_at', o.created_at,
        'channel', o.channel,
        'customer_name', COALESCE(NULLIF(btrim(c.name), ''), o.customer_name_snapshot),
        'status', o.status,
        'payment_status', o.payment_status,
        'payment_method', o.payment_method,
        'fulfillment_method', o.fulfillment_method,
        'currency', o.currency,
        'subtotal', COALESCE(o.subtotal, 0),
        'discount', COALESCE(o.discount, 0),
        'shipping', COALESCE(o.shipping, 0),
        'tax', COALESCE(o.tax_amount, 0),
        'total', COALESCE(o.total, 0),
        'collected', LEAST(GREATEST(COALESCE(o.advance_paid, 0), 0), o.total),
        'owed', CASE WHEN lower(COALESCE(o.payment_status, '')) = 'refunded' THEN 0
          ELSE GREATEST(o.total - COALESCE(o.advance_paid, 0), 0) END
      ) ORDER BY o.created_at, o.invoice_number)
      FROM public.orders o
      LEFT JOIN public.customers c ON c.id = o.customer_id
      WHERE o.brand_id = v_brand_id
        AND o.created_at >= p_start_date AND o.created_at < p_end_date
        AND public.reporting_counts_order(o.status, false)
    ), '[]'::jsonb),

    'partner_sales', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sold_at', s.sold_at,
        'partner', i.name,
        'currency', i.currency,
        'product', p.name,
        'sku', v.sku,
        'quantity', s.quantity,
        'unit_price', s.unit_price,
        'gross', s.gross_amount,
        'commission', s.commission_amount,
        'net_due', s.net_due,
        'paid', s.paid_amount,
        'cost', s.product_cost_snapshot + s.packaging_cost_snapshot
      ) ORDER BY s.sold_at)
      FROM public.incubator_sales s
      JOIN public.incubators i ON i.id = s.incubator_id
      JOIN public.product_variants v ON v.id = s.variant_id
      LEFT JOIN public.products p ON p.id = v.product_id
      WHERE s.brand_id = v_brand_id AND s.status = 'confirmed'
        AND s.sold_at >= p_start_date AND s.sold_at < p_end_date
    ), '[]'::jsonb),

    'partner_payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'payment_date', pay.payment_date,
        'partner', i.name,
        'currency', i.currency,
        'amount', pay.amount,
        'method', pay.payment_method,
        'reference', pay.reference
      ) ORDER BY pay.payment_date)
      FROM public.incubator_payments pay
      JOIN public.incubators i ON i.id = pay.incubator_id
      WHERE pay.brand_id = v_brand_id AND pay.voided_at IS NULL
        AND pay.payment_date >= v_first AND pay.payment_date <= v_last
    ), '[]'::jsonb),

    'returns', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'processed_at', rr.refund_processed_at,
        'return_number', rr.return_number,
        'invoice_number', o.invoice_number,
        'currency', o.currency,
        'items', rr.total_item_refund,
        'discount_back', rr.pro_rated_discount_deduction,
        'tax_back', rr.tax_refund,
        'fee', rr.return_fee,
        'refunded', rr.net_refund_amount,
        'method', rr.refund_method,
        'deducted', public.order_counts_as_sold(o.status)
      ) ORDER BY rr.refund_processed_at)
      FROM public.return_requests rr
      JOIN public.orders o ON o.id = rr.order_id AND o.brand_id = rr.brand_id
      WHERE rr.brand_id = v_brand_id AND rr.refund_status = 'processed'
        AND rr.refund_processed_at >= p_start_date AND rr.refund_processed_at < p_end_date
    ), '[]'::jsonb),

    'expenses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'expense_date', e.expense_date,
        'category', e.category,
        'description', e.description,
        'supplier', COALESCE(ve.name, e.store_name),
        'currency', e.currency,
        'amount', e.amount,
        'tax', COALESCE(e.tax_amount, 0),
        'running_cost', lower(COALESCE(e.expense_type, 'opex')) = 'opex'
      ) ORDER BY e.expense_date, e.created_at)
      FROM public.expenses e
      LEFT JOIN public.vendors ve ON ve.id = e.vendor_id
      WHERE e.brand_id = v_brand_id
        AND e.expense_date >= v_first AND e.expense_date <= v_last
    ), '[]'::jsonb),

    'supplier_payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'paid_on', sp.paid_on,
        'po_number', COALESCE((
          SELECT string_agg(DISTINCT po.po_number, ', ')
            FROM public.purchase_order_payments a
            JOIN public.purchase_orders po ON po.id = a.po_id
           WHERE a.supplier_payment_id = sp.id AND a.voided_at IS NULL
        ), ''),
        'supplier', ve.name,
        'amount', sp.amount,
        'method', sp.method,
        'reference', sp.reference,
        'note', sp.note
      ) ORDER BY sp.paid_on, sp.created_at)
      FROM public.supplier_payments sp
      LEFT JOIN public.vendors ve ON ve.id = sp.vendor_id
      WHERE sp.brand_id = v_brand_id AND sp.voided_at IS NULL
        AND sp.paid_on >= v_first AND sp.paid_on <= v_last
    ), '[]'::jsonb),

    'supplier_owed', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('supplier', x.supplier, 'owed', x.owed) ORDER BY x.owed DESC)
      FROM (
        SELECT ve.name AS supplier, sum(po.total_amount - po.paid_amount) AS owed
        FROM public.purchase_orders po
        LEFT JOIN public.vendors ve ON ve.id = po.vendor_id
        WHERE po.brand_id = v_brand_id AND po.status NOT IN ('cancelled', 'draft')
        GROUP BY ve.name
        HAVING sum(po.total_amount - po.paid_amount) > 0.0005
      ) x
    ), '[]'::jsonb),

    'stock', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'product', x.product, 'units', x.units, 'value', x.value, 'units_without_cost', x.no_cost
      ) ORDER BY x.value DESC, x.product)
      FROM (
        SELECT p.name AS product,
          sum(GREATEST(COALESCE(v.stock_main, 0), 0) + GREATEST(COALESCE(v.stock_incubator, 0), 0)) AS units,
          sum((GREATEST(COALESCE(v.stock_main, 0), 0) + GREATEST(COALESCE(v.stock_incubator, 0), 0))
            * COALESCE(NULLIF(vc.cost_price, 0), pc.cost_price, 0)) AS value,
          sum(GREATEST(COALESCE(v.stock_main, 0), 0) + GREATEST(COALESCE(v.stock_incubator, 0), 0))
            FILTER (WHERE COALESCE(NULLIF(vc.cost_price, 0), pc.cost_price, 0) = 0) AS no_cost
        FROM public.product_variants v
        JOIN public.products p ON p.id = v.product_id
        LEFT JOIN public.variant_costs vc ON vc.variant_id = v.id
        LEFT JOIN public.product_costs pc ON pc.product_id = p.id
        WHERE p.brand_id = v_brand_id AND COALESCE(p.item_kind, '') <> 'service'
        GROUP BY p.id, p.name
        HAVING sum(GREATEST(COALESCE(v.stock_main, 0), 0) + GREATEST(COALESCE(v.stock_incubator, 0), 0)) > 0
      ) x
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_reporting_month_pack(timestamptz, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_month_pack(timestamptz, timestamptz, text, text)
  TO authenticated, service_role;
