-- ==============================================================================
-- Payments to a supplier, one by one.
--
-- A supplier order kept what was paid as one number the screen overwrote: a payment could not be
-- dated, explained or taken back, and two people paying at once could lose one. Now each payment
-- is a row (`purchase_order_payments`: amount, the day it was paid, a note, who recorded it),
-- written by `record_supplier_payment` and taken back by `void_supplier_payment` (it stays on
-- record with who and why, and counts nowhere). The order's `paid_amount` is the sum of the
-- payments that stand, written by the database alone: a person's browser session can no longer
-- set it. A payment is never more than is still owed; an order with payments that stand is not
-- deleted (cancel it, or take the payments back first).
--
-- A payment to a supplier is not an expense and does not move the cash box or the bank balance
-- (expenses do not either): the cost of goods is counted when a piece is sold.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.purchase_order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  -- One press of "Record payment": sent again, it records nothing more.
  request_id uuid NOT NULL UNIQUE,
  amount numeric(12,3) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL DEFAULT current_date,
  note text CHECK (note IS NULL OR length(note) <= 300),
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text CHECK (void_reason IS NULL OR length(void_reason) <= 300),
  CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);

CREATE INDEX IF NOT EXISTS purchase_order_payments_po_idx
  ON public.purchase_order_payments (po_id, paid_on);

ALTER TABLE public.purchase_order_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff who see finances" ON public.purchase_order_payments;
CREATE POLICY "staff who see finances" ON public.purchase_order_payments
  FOR SELECT TO authenticated
  USING (public.can_view_brand_costs(brand_id));
REVOKE ALL ON public.purchase_order_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.purchase_order_payments TO authenticated;
GRANT ALL ON public.purchase_order_payments TO service_role;

-- What was paid before payments were kept one by one stays paid, as one payment.
INSERT INTO public.purchase_order_payments (brand_id, po_id, request_id, amount, paid_on, note)
SELECT po.brand_id, po.id, gen_random_uuid(), po.paid_amount, po.created_at::date,
       'Paid before payments were recorded one by one'
  FROM public.purchase_orders po
 WHERE po.paid_amount > 0
   AND NOT EXISTS (SELECT 1 FROM public.purchase_order_payments p WHERE p.po_id = po.id);

-- The order's paid amount: the payments that stand.
CREATE OR REPLACE FUNCTION public.purchase_order_sync_paid(p_po_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.purchase_orders po
     SET paid_amount = paid.total
    FROM (SELECT COALESCE(sum(amount), 0)::numeric(12,3) AS total
            FROM public.purchase_order_payments
           WHERE po_id = p_po_id AND voided_at IS NULL) paid
   WHERE po.id = p_po_id
     AND po.paid_amount IS DISTINCT FROM paid.total;
$$;
REVOKE ALL ON FUNCTION public.purchase_order_sync_paid(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_order_sync_paid(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.purchase_order_payments_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.purchase_order_sync_paid(COALESCE(NEW.po_id, OLD.po_id));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.purchase_order_payments_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_purchase_order_payments_sync ON public.purchase_order_payments;
CREATE TRIGGER trg_purchase_order_payments_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_payments
  FOR EACH ROW EXECUTE FUNCTION public.purchase_order_payments_sync();

-- The state guard of migration 20261019100000, with the paid amount added: a person's browser
-- session starts an order at nothing paid and never writes the amount; an order with payments
-- that stand is not deleted.
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
    IF OLD.paid_amount > 0 THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_HAS_PAYMENTS';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'ordered') THEN
      RAISE EXCEPTION 'PURCHASE_ORDER_STATE_IS_THE_DATABASES';
    END IF;
    NEW.received_at := NULL;
    NEW.total_amount := 0;
    NEW.paid_amount := 0;
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
  -- The total is the lines', the arrival's moment the receiving's, the paid amount the
  -- payments'.
  NEW.total_amount := OLD.total_amount;
  NEW.received_at := OLD.received_at;
  NEW.paid_amount := OLD.paid_amount;
  RETURN NEW;
END;
$$;

-- A payment to the supplier of an order: by staff who see the store's finances, never more than
-- is still owed, once per press.
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

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PURCHASE_ORDER_NOT_FOUND';
  END IF;

  IF auth.uid() IS NULL
     OR NOT public.can_access_brand(v_po.brand_id)
     OR NOT public.has_permission('view_financials') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT id INTO v_id FROM public.purchase_order_payments WHERE request_id = p_request_id;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'PURCHASE_ORDER_NOT_OPEN';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR round(p_amount, 3) <> p_amount THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT';
  END IF;
  IF p_amount > v_po.total_amount - v_po.paid_amount THEN
    RAISE EXCEPTION 'PAYMENT_MORE_THAN_OWED';
  END IF;
  IF p_paid_on IS NULL OR p_paid_on > current_date + 1 THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_DATE';
  END IF;

  INSERT INTO public.purchase_order_payments (
    brand_id, po_id, request_id, amount, paid_on, note, recorded_by
  ) VALUES (
    v_po.brand_id, v_po.id, p_request_id, p_amount, p_paid_on,
    NULLIF(left(trim(p_note), 300), ''), auth.uid()
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_supplier_payment(uuid, numeric, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment(uuid, numeric, date, uuid, text)
  TO authenticated, service_role;

-- Takes a payment back: it stays on record with who and why, and is counted nowhere.
CREATE OR REPLACE FUNCTION public.void_supplier_payment(p_payment_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.purchase_order_payments%ROWTYPE;
BEGIN
  SELECT * INTO v_payment FROM public.purchase_order_payments WHERE id = p_payment_id FOR UPDATE;
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

  UPDATE public.purchase_order_payments
     SET voided_at = now(), voided_by = auth.uid(), void_reason = left(trim(p_reason), 300)
   WHERE id = p_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.void_supplier_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_supplier_payment(uuid, text) TO authenticated, service_role;
