-- The reports count what the rest of the app counts as sold, and returns are deducted again.
--
-- 1. One rule for "sold": order_counts_as_sold(status) is the twin of countsAsSold
--    (src/lib/data/orders/sold-orders.ts; tests/reports-sold-orders-migration.test.ts runs
--    both over every status). The report functions counted only payment_status = 'paid', so an
--    order paid by its advance (partially_paid) or delivered with its cash still to collect was
--    missing from revenue while the expenses page, the inventory and the advance report counted
--    it. Revenue is now every order sold in the period, in full; beside it the overview says
--    what was collected on those orders (advance_paid) and what customers still owe.
-- 2. rpc_reporting_processed_returns was changed by hand on the live database: it returned
--    `refunded_revenue_deduction` / `merchandise_revenue_deduction`, which the app does not
--    read (it reads `revenue_deduction` / `merchandise_deduction`, as the migration
--    20260904200000 wrote them), so no processed return ever lowered net revenue. Redefined
--    here with the names the app reads; a return is deducted only from an order that still
--    counts as sold (a fully returned order is no longer revenue, so it is not deducted twice),
--    and an order refunded by its payment with no return record is deducted the same way.
-- 3. Expenses by category included the period's last day only in the overview: both now
--    read the last day (the screens send its end, 23:59:59.999 on the reader's clock).
-- 4. The products report says how each size is sold and what is ready (store plus partners),
--    so the screen can apply productAvailability and the store's low-stock level; packaging
--    cost is the line's own snapshot, as in the overview.
-- 5. Card and BenefitPay fees are worked out on what was charged (advance_paid).

CREATE OR REPLACE FUNCTION public.order_counts_as_sold(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT lower(btrim(COALESCE(p_status, ''))) <> ''
     AND lower(btrim(COALESCE(p_status, ''))) NOT IN (
       'draft', 'pending', 'pending_verification', 'benefit_rejected', 'cancelled', 'canceled',
       'refunded', 'voided', 'failed', 'returned', 'archived_historical'
     );
$function$;

-- Whether a report counts an order: sold, or an archived historical order when asked for.
CREATE OR REPLACE FUNCTION public.reporting_counts_order(p_status text, p_include_historical boolean)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT public.order_counts_as_sold(p_status)
      OR (COALESCE(p_include_historical, false)
          AND lower(btrim(COALESCE(p_status, ''))) = 'archived_historical');
$function$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_overview(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tz text DEFAULT 'UTC'::text, p_include_historical boolean DEFAULT false, p_brand_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
  v_result jsonb;
BEGIN
  WITH period_orders AS (
    SELECT * FROM public.orders
    WHERE brand_id = v_brand_id AND created_at >= p_start_date AND created_at < p_end_date
  ),
  sold AS (
    SELECT * FROM period_orders
    WHERE public.reporting_counts_order(status, p_include_historical)
  ),
  sold_aggregates AS (
    SELECT currency,
      round(sum(total)::numeric, 3) AS pov,
      round(sum(subtotal)::numeric, 3) AS gross_merch,
      round(sum(discount)::numeric, 3) AS discounts,
      round(sum(subtotal - discount)::numeric, 3) AS net_merch,
      round(sum(shipping)::numeric, 3) AS shipping_collected,
      round(sum(tax_amount)::numeric, 3) AS vat_collected,
      round(sum(LEAST(GREATEST(COALESCE(advance_paid, 0), 0), total))::numeric, 3) AS collected,
      round(sum(CASE WHEN lower(COALESCE(payment_status, '')) = 'refunded' THEN 0
        ELSE GREATEST(total - COALESCE(advance_paid, 0), 0) END)::numeric, 3) AS owed_by_customers,
      count(*) FILTER (WHERE total > 0) AS paid_order_count,
      count(*) FILTER (WHERE total = 0) AS free_completed_order_count
    FROM sold GROUP BY currency
  ),
  partial_orders AS (
    SELECT currency, round(sum(advance_paid)::numeric, 3) AS partial_amount
    FROM sold
    WHERE lower(COALESCE(payment_status, '')) IN ('partial', 'partially_paid')
    GROUP BY currency
  ),
  refunded_orders AS (
    SELECT currency, round(sum(total)::numeric, 3) AS refunded_total
    FROM period_orders
    WHERE lower(COALESCE(payment_status, '')) = 'refunded'
      AND (p_include_historical OR lower(COALESCE(status, '')) <> 'archived_historical')
    GROUP BY currency
  ),
  product_packaging AS (
    SELECT p.id AS product_id,
      COALESCE(p.direct_packaging_cost, 0) + COALESCE(sum(pbi.quantity_per_unit * pm.unit_cost), 0) AS unit_packaging_cost
    FROM public.products p
    LEFT JOIN public.product_bom_items pbi ON pbi.product_id = p.id AND pbi.brand_id = v_brand_id
    LEFT JOIN public.packaging_materials pm ON pm.id = pbi.packaging_material_id AND pm.brand_id = v_brand_id
    WHERE p.brand_id = v_brand_id
    GROUP BY p.id, p.direct_packaging_cost
  ),
  cogs_data AS (
    SELECT o.currency,
      round(sum(oi.quantity * (COALESCE(oi.unit_cost, 0) +
        CASE WHEN lower(COALESCE(o.fulfillment_status, o.status, '')) IN
          ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up')
        THEN COALESCE(oi.packaging_cost_snapshot, pp.unit_packaging_cost, 0) ELSE 0 END))::numeric, 3) AS known_cogs,
      count(oi.id) FILTER (WHERE oi.unit_cost IS NULL) AS missing_cost_count,
      round(COALESCE(sum(oi.line_total) FILTER (WHERE oi.unit_cost IS NULL), 0)::numeric, 3) AS missing_cost_value
    FROM sold o
    JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
    LEFT JOIN product_packaging pp ON pp.product_id = oi.product_id
    GROUP BY o.currency
  ),
  expenses_data AS (
    SELECT currency, round(sum(amount)::numeric, 3) AS total_expenses
    FROM public.expenses
    WHERE brand_id = v_brand_id
      AND lower(COALESCE(expense_type, 'opex')) = 'opex'
      AND expense_date >= (p_start_date AT TIME ZONE p_tz)::date
      AND expense_date <= (p_end_date AT TIME ZONE p_tz)::date
    GROUP BY currency
  ),
  currencies AS (
    SELECT currency FROM sold_aggregates UNION SELECT currency FROM partial_orders
    UNION SELECT currency FROM refunded_orders UNION SELECT currency FROM cogs_data
    UNION SELECT currency FROM expenses_data
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'currency', c.currency,
    'paid_order_value', COALESCE(sa.pov, 0),
    'gross_merch_sales', COALESCE(sa.gross_merch, 0),
    'discounts', COALESCE(sa.discounts, 0),
    'net_merch_sales', COALESCE(sa.net_merch, 0),
    'shipping_collected', COALESCE(sa.shipping_collected, 0),
    'vat_collected', COALESCE(sa.vat_collected, 0),
    'collected', COALESCE(sa.collected, 0),
    'owed_by_customers', COALESCE(sa.owed_by_customers, 0),
    'paid_order_count', COALESCE(sa.paid_order_count, 0),
    'free_completed_order_count', COALESCE(sa.free_completed_order_count, 0),
    'partial_amount', COALESCE(po.partial_amount, 0),
    'refunded_total', COALESCE(ro.refunded_total, 0),
    'known_cogs', COALESCE(cd.known_cogs, 0),
    'missing_cost_item_count', COALESCE(cd.missing_cost_count, 0),
    'missing_cost_exposure', COALESCE(cd.missing_cost_value, 0),
    'expenses', COALESCE(ed.total_expenses, 0)
  )), '[]'::jsonb) INTO v_result
  FROM currencies c
  LEFT JOIN sold_aggregates sa ON sa.currency = c.currency
  LEFT JOIN partial_orders po ON po.currency = c.currency
  LEFT JOIN refunded_orders ro ON ro.currency = c.currency
  LEFT JOIN cogs_data cd ON cd.currency = c.currency
  LEFT JOIN expenses_data ed ON ed.currency = c.currency;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_order_cogs(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_include_historical boolean DEFAULT false, p_brand_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x) ORDER BY x.currency)
    FROM (
      SELECT o.currency,
        round(sum(oi.quantity * COALESCE(oi.unit_cost, 0))::numeric, 3) AS product_cogs,
        round(sum(oi.quantity * CASE
          WHEN lower(COALESCE(o.fulfillment_status, o.status, '')) IN
            ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up')
          THEN COALESCE(oi.packaging_cost_snapshot, 0) ELSE 0 END)::numeric, 3) AS packaging_cogs,
        round(sum(oi.quantity * (COALESCE(oi.unit_cost, 0) + CASE
          WHEN lower(COALESCE(o.fulfillment_status, o.status, '')) IN
            ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up')
          THEN COALESCE(oi.packaging_cost_snapshot, 0) ELSE 0 END))::numeric, 3) AS known_cogs,
        count(oi.id) FILTER (WHERE oi.unit_cost IS NULL) AS missing_cost_item_count,
        count(oi.id) FILTER (WHERE oi.product_id IS NULL) AS missing_product_link_count,
        count(oi.id) FILTER (
          WHERE lower(COALESCE(o.fulfillment_status, o.status, '')) IN
            ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up')
            AND COALESCE(oi.packaging_cost_snapshot, 0) = 0
        ) AS zero_packaging_item_count
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
      WHERE o.brand_id = v_brand_id
        AND o.created_at >= p_start_date AND o.created_at < p_end_date
        AND public.reporting_counts_order(o.status, p_include_historical)
      GROUP BY o.currency
    ) x
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_processing_fees(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_include_historical boolean DEFAULT false, p_brand_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
BEGIN
  -- A fee is charged on what the card or BenefitPay took: the order's advance, or all of it.
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(result) ORDER BY result.currency)
    FROM (
      SELECT o.currency, COALESCE(sum(
        LEAST(GREATEST(COALESCE(o.advance_paid, 0), 0), o.total) * CASE
          WHEN lower(COALESCE(o.payment_method, '')) = 'card'
            THEN COALESCE(bs.card_processing_fee, 0) / 100
          WHEN lower(COALESCE(o.payment_method, '')) IN ('benefit', 'benefitpay', 'benefit_pay')
            THEN COALESCE(bs.benefit_processing_fee, 0) / 100
          ELSE 0 END), 0)::numeric AS processing_fees
      FROM public.orders o
      LEFT JOIN public.business_settings bs ON bs.brand_id = o.brand_id
      WHERE o.brand_id = v_brand_id
        AND o.created_at >= p_start_date AND o.created_at < p_end_date
        AND public.reporting_counts_order(o.status, p_include_historical)
      GROUP BY o.currency
    ) result
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_processed_returns(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tz text DEFAULT 'UTC'::text, p_brand_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
BEGIN
  RETURN COALESCE((
    WITH processed AS (
      SELECT o.currency,
        SUM(rr.net_refund_amount)::numeric AS processed_refunds,
        SUM(GREATEST(rr.total_item_refund - rr.pro_rated_discount_deduction, 0))::numeric AS refunded_merchandise,
        -- Deducted only from an order that is still revenue: a fully returned or refunded
        -- order no longer counts as sold, so its revenue is already gone.
        SUM(CASE WHEN public.order_counts_as_sold(o.status)
          THEN rr.net_refund_amount ELSE 0 END)::numeric AS revenue_deduction,
        SUM(CASE WHEN public.order_counts_as_sold(o.status)
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
        AND public.order_counts_as_sold(o.status)
      GROUP BY o.currency
    ), legacy AS (
      -- An order whose payment was refunded with no return record.
      SELECT o.currency, SUM(o.total)::numeric AS legacy_refunds,
        SUM(o.total) FILTER (WHERE public.order_counts_as_sold(o.status))::numeric AS legacy_deduction
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
      'revenue_deduction', COALESCE(p.revenue_deduction, 0) + COALESCE(l.legacy_deduction, 0),
      'merchandise_deduction', COALESCE(p.merchandise_deduction, 0) + COALESCE(l.legacy_deduction, 0),
      'returned_cogs_reversal', COALESCE(r.returned_cogs_reversal, 0)
    ))
    FROM currencies c
    LEFT JOIN processed p ON p.currency = c.currency
    LEFT JOIN cogs_reversals r ON r.currency = c.currency
    LEFT JOIN legacy l ON l.currency = c.currency
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_sales(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_interval text DEFAULT 'day'::text, p_tz text DEFAULT 'UTC'::text, p_include_historical boolean DEFAULT false, p_brand_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_brand_id uuid := public.reporting_brand_id(p_brand_slug); v_result jsonb;
BEGIN
  IF p_interval NOT IN ('day', 'week', 'month', 'year') THEN RAISE EXCEPTION 'INVALID_INTERVAL'; END IF;
  WITH sold AS (
    SELECT o.* FROM public.orders o
    WHERE o.brand_id = v_brand_id AND o.created_at >= p_start_date AND o.created_at < p_end_date
      AND public.reporting_counts_order(o.status, p_include_historical)
  ), timeseries AS (
    SELECT date_trunc(p_interval, o.created_at AT TIME ZONE p_tz) AS time_bucket,
      o.currency, count(*)::bigint AS paid_order_count, sum(o.total)::numeric AS pov,
      sum(o.subtotal - o.discount)::numeric AS net_merch,
      sum(o.discount)::numeric AS discounts, sum(o.shipping)::numeric AS shipping_collected,
      sum(o.tax_amount)::numeric AS vat_collected,
      sum(LEAST(GREATEST(COALESCE(o.advance_paid, 0), 0), o.total))::numeric AS collected
    FROM sold o GROUP BY 1, o.currency
  ), payment AS (
    SELECT COALESCE(NULLIF(o.payment_method, ''), 'unknown') AS payment_method,
      o.currency, count(*)::bigint AS order_count, sum(o.total)::numeric AS pov
    FROM sold o GROUP BY 1, o.currency
  ), fulfillment AS (
    SELECT COALESCE(NULLIF(o.fulfillment_method, ''), 'unknown') AS fulfillment_method,
      o.currency, count(*)::bigint AS order_count, sum(o.total)::numeric AS pov
    FROM sold o GROUP BY 1, o.currency
  )
  SELECT jsonb_build_object(
    'timeseries', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.time_bucket, t.currency) FROM timeseries t), '[]'::jsonb),
    'payment', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.payment_method, p.currency) FROM payment p), '[]'::jsonb),
    'fulfillment', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.fulfillment_method, f.currency) FROM fulfillment f), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_products_inventory(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tz text DEFAULT 'UTC'::text, p_include_historical boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_sort_by text DEFAULT 'units_sold_desc'::text, p_brand_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_brand_id uuid := public.reporting_brand_id(p_brand_slug); v_result jsonb;
BEGIN
  IF p_limit < 1 OR p_limit > 200 OR p_offset < 0 THEN RAISE EXCEPTION 'INVALID_PAGINATION'; END IF;
  IF p_sort_by NOT IN ('units_sold_desc', 'net_merch_desc') THEN RAISE EXCEPTION 'INVALID_SORT'; END IF;
  WITH product_packaging AS (
    SELECT p.id AS product_id,
      COALESCE(p.direct_packaging_cost, 0) + COALESCE(sum(pbi.quantity_per_unit * pm.unit_cost), 0) AS unit_packaging_cost
    FROM public.products p
    LEFT JOIN public.product_bom_items pbi ON pbi.product_id = p.id AND pbi.brand_id = v_brand_id
    LEFT JOIN public.packaging_materials pm ON pm.id = pbi.packaging_material_id AND pm.brand_id = v_brand_id
    WHERE p.brand_id = v_brand_id GROUP BY p.id, p.direct_packaging_cost
  ), rows AS (
    SELECT p.id AS product_id, COALESCE(p.name, oi.description) AS product_name, pv.id AS variant_id,
      pv.sku, pv.size, pv.color, pv.fabric, o.currency,
      sum(oi.quantity)::bigint AS units_sold, sum(oi.line_total)::numeric AS net_merch_sales,
      sum(oi.quantity * (COALESCE(oi.unit_cost, 0) + CASE
        WHEN lower(COALESCE(o.fulfillment_status, o.status, '')) IN
          ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up')
        THEN COALESCE(oi.packaging_cost_snapshot, pp.unit_packaging_cost, 0) ELSE 0 END))::numeric AS known_cogs,
      bool_or(oi.unit_cost IS NULL) AS is_missing_cost,
      -- What is ready (the store plus partners) and how the product is sold: the screen reads
      -- them with productAvailability and the store's low-stock level.
      GREATEST(COALESCE(pv.stock_main, pv.stock, 0), 0)::integer AS stock_main,
      GREATEST(COALESCE(pv.stock_incubator, 0), 0)::integer AS stock_incubator,
      (GREATEST(COALESCE(pv.stock_main, pv.stock, 0), 0) + GREATEST(COALESCE(pv.stock_incubator, 0), 0))::integer AS current_stock,
      p.is_made_to_order, p.item_kind, p.made_to_order_available, p.made_to_order_paused_at
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
    LEFT JOIN public.products p ON p.id = oi.product_id AND p.brand_id = v_brand_id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id AND pv.brand_id = v_brand_id
    LEFT JOIN product_packaging pp ON pp.product_id = oi.product_id
    WHERE o.brand_id = v_brand_id AND o.created_at >= p_start_date AND o.created_at < p_end_date
      AND public.reporting_counts_order(o.status, p_include_historical)
    GROUP BY p.id, p.name, oi.description, pv.id, pv.sku, pv.size, pv.color, pv.fabric,
      pv.stock_main, pv.stock, pv.stock_incubator, p.is_made_to_order, p.item_kind,
      p.made_to_order_available, p.made_to_order_paused_at, o.currency
  ), paged AS (
    SELECT * FROM rows ORDER BY
      CASE WHEN p_sort_by = 'units_sold_desc' THEN units_sold END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'net_merch_desc' THEN net_merch_sales END DESC NULLS LAST,
      product_name, size, color, fabric LIMIT p_limit OFFSET p_offset
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(paged)), '[]'::jsonb) INTO v_result FROM paged;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_customers(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tz text DEFAULT 'UTC'::text, p_include_historical boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_brand_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
  v_result jsonb;
BEGIN
  WITH lifetime_first AS (
    SELECT customer_id, MIN(created_at) AS first_paid_at
    FROM public.orders
    WHERE brand_id = v_brand_id AND customer_id IS NOT NULL
      AND public.reporting_counts_order(status, true)
    GROUP BY customer_id
  ),
  period_orders AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.brand_id = v_brand_id AND o.customer_id IS NOT NULL
      AND o.created_at >= p_start_date AND o.created_at < p_end_date
      AND public.reporting_counts_order(o.status, p_include_historical)
  ),
  counts AS (
    SELECT
      COUNT(DISTINCT po.customer_id) FILTER (WHERE lf.first_paid_at >= p_start_date)::bigint AS new_count,
      COUNT(DISTINCT po.customer_id) FILTER (WHERE lf.first_paid_at < p_start_date)::bigint AS returning_count
    FROM period_orders po JOIN lifetime_first lf USING (customer_id)
  ),
  top_customers AS (
    SELECT c.id AS customer_id, c.name AS customer_name, po.currency,
      COUNT(*)::bigint AS paid_order_count, SUM(po.total)::numeric AS total_pov
    FROM period_orders po JOIN public.customers c ON c.id = po.customer_id AND c.brand_id = v_brand_id
    GROUP BY c.id, c.name, po.currency
    ORDER BY total_pov DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'new_customers_count', COALESCE((SELECT new_count FROM counts), 0),
    'returning_customers_count', COALESCE((SELECT returning_count FROM counts), 0),
    'top_customers', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM top_customers t), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_expenses(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tz text DEFAULT 'UTC'::text, p_brand_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
BEGIN
  -- The period's last day is included, as in the overview: the end is that day's last moment.
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC)
    FROM (
      SELECT category, currency, count(*)::bigint AS expense_count,
        sum(amount)::numeric AS amount
      FROM public.expenses
      WHERE brand_id = v_brand_id
        AND expense_date >= (p_start_date AT TIME ZONE p_tz)::date
        AND expense_date <= (p_end_date AT TIME ZONE p_tz)::date
      GROUP BY category, currency
    ) x
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_export(p_report_type text, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_tz text DEFAULT 'UTC'::text, p_brand_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
BEGIN
  IF p_report_type = 'sales' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_payload ORDER BY created_at DESC)
      FROM (
        SELECT o.created_at, jsonb_build_object(
          'invoice_number', o.invoice_number, 'order_date', o.order_date,
          'status', o.status, 'payment_status', o.payment_status,
          'payment_method', o.payment_method, 'fulfillment_method', o.fulfillment_method,
          'currency', o.currency, 'subtotal', o.subtotal, 'discount', o.discount,
          'shipping', o.shipping, 'tax_amount', o.tax_amount, 'total', o.total,
          'collected', LEAST(GREATEST(COALESCE(o.advance_paid, 0), 0), o.total),
          'counts_as_sold', public.order_counts_as_sold(o.status)
        ) AS row_payload
        FROM public.orders o
        WHERE o.brand_id = v_brand_id
          AND o.created_at >= p_start_date AND o.created_at < p_end_date
        ORDER BY o.created_at DESC
        LIMIT 50000
      ) sales_rows
    ), '[]'::jsonb);
  ELSIF p_report_type = 'products' THEN
    RETURN public.rpc_reporting_products_inventory(
      p_start_date, p_end_date, p_tz, true, 200, 0, 'net_merch_desc', p_brand_slug
    );
  ELSIF p_report_type = 'customers' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.total_spent DESC)
      FROM (
        SELECT c.name AS customer_name, o.currency, count(*)::bigint AS paid_order_count,
          sum(o.total)::numeric AS total_spent, max(o.created_at) AS last_order_at
        FROM public.customers c
        JOIN public.orders o ON o.customer_id = c.id AND o.brand_id = v_brand_id
        WHERE c.brand_id = v_brand_id
          AND o.created_at >= p_start_date AND o.created_at < p_end_date
          AND public.reporting_counts_order(o.status, true)
        GROUP BY c.id, c.name, o.currency
      ) x
    ), '[]'::jsonb);
  END IF;
  RAISE EXCEPTION 'INVALID_REPORT_TYPE';
END;
$function$;
