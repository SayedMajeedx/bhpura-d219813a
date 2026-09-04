-- Financial reporting must recognize processed partial returns on their actual
-- refund date and avoid deducting fully-refunded orders twice.

CREATE OR REPLACE FUNCTION public.rpc_reporting_processed_returns(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_tz text DEFAULT 'UTC',
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
BEGIN
  RETURN COALESCE((
    WITH processed AS (
      SELECT o.currency,
        SUM(rr.net_refund_amount)::numeric AS processed_refunds,
        SUM(GREATEST(rr.total_item_refund - rr.pro_rated_discount_deduction, 0))::numeric AS refunded_merchandise,
        SUM(CASE WHEN lower(COALESCE(o.payment_status, '')) <> 'refunded'
          THEN rr.net_refund_amount ELSE 0 END)::numeric AS revenue_deduction,
        SUM(CASE WHEN lower(COALESCE(o.payment_status, '')) <> 'refunded'
          THEN GREATEST(rr.total_item_refund - rr.pro_rated_discount_deduction, 0) ELSE 0 END)::numeric AS merchandise_deduction
      FROM public.return_requests rr
      JOIN public.orders o ON o.id = rr.order_id AND o.brand_id = rr.brand_id
      WHERE rr.brand_id = v_brand_id
        AND rr.refund_status = 'processed'
        AND rr.refund_processed_at >= p_start_date
        AND rr.refund_processed_at < p_end_date
      GROUP BY o.currency
    ), cogs_reversals AS (
      SELECT o.currency,
        SUM(ri.restocked_quantity * COALESCE(oi.unit_cost, 0))::numeric AS returned_cogs_reversal
      FROM public.return_requests rr
      JOIN public.orders o ON o.id = rr.order_id AND o.brand_id = rr.brand_id
      JOIN public.return_items ri ON ri.return_id = rr.id AND ri.brand_id = rr.brand_id
      JOIN public.order_items oi ON oi.id = ri.order_item_id
      WHERE rr.brand_id = v_brand_id
        AND rr.refund_status = 'processed'
        AND rr.refund_processed_at >= p_start_date
        AND rr.refund_processed_at < p_end_date
        AND ri.restocked = true
      GROUP BY o.currency
    ), legacy AS (
      SELECT o.currency, SUM(o.total)::numeric AS legacy_refunds
      FROM public.orders o
      WHERE o.brand_id = v_brand_id
        AND lower(COALESCE(o.payment_status, '')) = 'refunded'
        AND o.created_at >= p_start_date AND o.created_at < p_end_date
        AND NOT EXISTS (
          SELECT 1 FROM public.return_requests rr
          WHERE rr.order_id = o.id AND rr.refund_status = 'processed'
        )
      GROUP BY o.currency
    ), currencies AS (
      SELECT currency FROM processed UNION SELECT currency FROM cogs_reversals UNION SELECT currency FROM legacy
    )
    SELECT jsonb_agg(jsonb_build_object(
      'currency', c.currency,
      'refunded_total', COALESCE(p.processed_refunds, 0) + COALESCE(l.legacy_refunds, 0),
      'refunded_merchandise', COALESCE(p.refunded_merchandise, 0) + COALESCE(l.legacy_refunds, 0),
      'revenue_deduction', COALESCE(p.revenue_deduction, 0),
      'merchandise_deduction', COALESCE(p.merchandise_deduction, 0),
      'returned_cogs_reversal', COALESCE(cr.returned_cogs_reversal, 0)
    ) ORDER BY c.currency)
    FROM currencies c
    LEFT JOIN processed p USING (currency)
    LEFT JOIN cogs_reversals cr USING (currency)
    LEFT JOIN legacy l USING (currency)
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_reporting_processed_returns(timestamptz,timestamptz,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_processed_returns(timestamptz,timestamptz,text,text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_reporting_returns_brand_processed
  ON public.return_requests (brand_id, refund_processed_at, order_id)
  WHERE refund_status = 'processed';

NOTIFY pgrst, 'reload schema';
