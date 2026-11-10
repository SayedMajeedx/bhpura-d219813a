-- ==============================================================================
-- Adjustments to a supplier's account (step 4 of the supplier account plan, 2026-11-10).
--
-- What a store owes a supplier could fall only by a payment. A discount the supplier gives after
-- the bill ("take 5 off"), or an amount the store and the supplier agree to write off, had to be
-- typed as a payment that never left the till, so the payments, the month pack and the cash
-- read more paid out than was.
--
-- Now a supplier's account entry says what it is (`supplier_payments.kind`): a `payment`, a
-- `discount` from the supplier, or a `write_off`. An adjustment is spread on the orders exactly as
-- a payment is (the same function, the same credit), so an order's paid amount, the statement and
-- what is owed read it; it has no method or reference and always a reason. It is recorded by
-- `record_supplier_adjustment` (staff who see the store's finances, once per press) and taken
-- back like a payment (`void_supplier_account_payment`). The month pack's supplier sheet lists
-- payments only: an adjustment moves no money.
-- ==============================================================================

ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'payment';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_kind_check') THEN
    ALTER TABLE public.supplier_payments
      ADD CONSTRAINT supplier_payments_kind_check
      CHECK (kind IN ('payment', 'discount', 'write_off'));
  END IF;
  -- How it was paid belongs to a payment; an adjustment moved no money.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payments_method_is_a_payments') THEN
    ALTER TABLE public.supplier_payments
      ADD CONSTRAINT supplier_payments_method_is_a_payments
      CHECK (kind = 'payment' OR (method IS NULL AND reference IS NULL));
  END IF;
END $$;

-- A discount from the supplier or an amount written off, on the orders given (each at most what
-- it owes) and then on the oldest that owe; what is left is the supplier's credit.
CREATE OR REPLACE FUNCTION public.record_supplier_adjustment(
  p_vendor_id uuid,
  p_amount numeric,
  p_on date,
  p_kind text,
  p_reason text,
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
  v_id uuid;
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
  IF p_kind IS NULL OR p_kind NOT IN ('discount', 'write_off') THEN
    RAISE EXCEPTION 'INVALID_ADJUSTMENT_KIND';
  END IF;
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'ADJUSTMENT_REASON_REQUIRED';
  END IF;

  v_id := public.supplier_payment_record_internal(
    p_vendor_id, p_amount, p_on, NULL, NULL, p_reason, p_allocations, p_request_id
  );
  -- Written as a payment by the shared step, then named for what it is (a repeated press finds
  -- it already named).
  UPDATE public.supplier_payments SET kind = p_kind WHERE id = v_id AND kind = 'payment' AND method IS NULL;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_supplier_adjustment(uuid, numeric, date, text, text, jsonb, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_adjustment(uuid, numeric, date, text, text, jsonb, uuid)
  TO authenticated, service_role;

-- The month pack's supplier sheet: payments only, as an adjustment moved no money. The rest of the
-- function is the live one (migration 20261127100000), unchanged.
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
      WHERE sp.brand_id = v_brand_id AND sp.voided_at IS NULL AND sp.kind = 'payment'
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
