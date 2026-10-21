-- ==============================================================================
-- What customers and partner shops owe the store today, and since when.
--
-- The overview says what customers still owe on a period's sales, in one figure. A finance head
-- needs the list: who owes, on which order, how much, and for how long, as of today. This
-- returns every order that counts as sold (`order_counts_as_sold`, as the statement) with money
-- still to collect (its total less what was collected, `advance_paid`; a refunded payment owes
-- nothing), with when the piece was handed over (delivered or completed: a balance falls due on
-- hand-over, so the screens age it from then), and what each partner shop owes by the partners'
-- own summary (`incubator_summaries`: due, overdue past its settlement day, next settlement).
--
-- Same caller check as every report (`reporting_brand_id`: signed in, `view_financials`).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_reporting_receivables(
  p_today date,
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
BEGIN
  RETURN jsonb_build_object(
    'customers', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at, x.invoice_number)
      FROM (
        SELECT o.id, o.invoice_number, o.public_invoice_token, o.created_at, o.currency,
          o.status, o.fulfillment_status, o.payment_method,
          COALESCE(o.delivered_at, o.completed_at,
            CASE WHEN upper(COALESCE(o.fulfillment_status, '')) IN
              ('DELIVERED', 'COMPLETED', 'PICKED_UP', 'FULFILLED') THEN o.updated_at END
          ) AS handed_over_at,
          round(o.total::numeric, 3) AS total,
          round(LEAST(GREATEST(COALESCE(o.advance_paid, 0), 0), o.total)::numeric, 3) AS collected,
          round(GREATEST(o.total - COALESCE(o.advance_paid, 0), 0)::numeric, 3) AS balance,
          o.customer_id,
          COALESCE(NULLIF(btrim(c.name), ''), o.customer_name_snapshot) AS customer_name,
          COALESCE(NULLIF(btrim(c.phone), ''), o.customer_phone_snapshot) AS customer_phone
        FROM public.orders o
        LEFT JOIN public.customers c ON c.id = o.customer_id
        WHERE o.brand_id = v_brand_id
          AND public.order_counts_as_sold(o.status)
          AND lower(COALESCE(o.payment_status, '')) <> 'refunded'
          AND o.total - COALESCE(o.advance_paid, 0) > 0.0005
      ) x
    ), '[]'::jsonb),
    'partners', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name', i.name,
        'currency', i.currency,
        'due', round(s.due, 3),
        'overdue', round(s.overdue, 3),
        'next_settlement', s.next_settlement
      ) ORDER BY s.overdue DESC, s.due DESC)
      FROM public.incubator_summaries(v_brand_id, p_today, p_tz) s
      JOIN public.incubators i ON i.id = s.incubator_id
      WHERE s.due > 0.0005
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_reporting_receivables(date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_receivables(date, text, text)
  TO authenticated, service_role;
