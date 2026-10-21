-- ==============================================================================
-- The accountant's month pack: the month's detail behind the statement, in one request.
--
-- The month pack is one Excel workbook a store hands its accountant: the statement for the
-- month (beside the month before and the same month a year earlier, from
-- `rpc_reporting_periods`), margins (`rpc_reporting_margins`), customer balances
-- (`rpc_reporting_receivables`), and the lists this function returns for the month:
--
--   * sales: every order that counts as sold, placed in the month (as the statement counts it),
--     with its customer, how it was paid, what it charged and what is still owed;
--   * partner shops' sales and the payments partners made;
--   * returns processed in the month, and whether they were deducted (an order still sold);
--   * expenses by their date, with the VAT paid on them and whether the statement counts them
--     (running costs: `expense_type` 'opex', as the overview);
--   * payments made to suppliers in the month (voided ones left out), and what is owed to each
--     supplier today;
--   * stock on hand now (the store's and at partners) at cost, product by product: there is no
--     record of stock at a month's end, so the pack says it is today's.
--
-- Same caller check as every report (`reporting_brand_id`: signed in, `view_financials`).
-- ==============================================================================

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
        'paid_on', pay.paid_on,
        'po_number', po.po_number,
        'supplier', ve.name,
        'amount', pay.amount,
        'note', pay.note
      ) ORDER BY pay.paid_on, pay.created_at)
      FROM public.purchase_order_payments pay
      JOIN public.purchase_orders po ON po.id = pay.po_id
      LEFT JOIN public.vendors ve ON ve.id = po.vendor_id
      WHERE pay.brand_id = v_brand_id AND pay.voided_at IS NULL
        AND pay.paid_on >= v_first AND pay.paid_on <= v_last
    ), '[]'::jsonb),

    'supplier_owed', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('supplier', x.supplier, 'owed', x.owed) ORDER BY x.owed DESC)
      FROM (
        SELECT ve.name AS supplier, sum(po.total_amount - po.paid_amount) AS owed
        FROM public.purchase_orders po
        LEFT JOIN public.vendors ve ON ve.id = po.vendor_id
        WHERE po.brand_id = v_brand_id AND po.status <> 'cancelled'
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
