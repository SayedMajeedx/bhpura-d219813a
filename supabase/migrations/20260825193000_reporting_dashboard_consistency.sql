-- Keep dashboard and all reporting surfaces on the same paid-sale, COGS, and
-- 30-day semantics. Revenue is recognized from payment_status, while packaging
-- COGS includes both direct cost and the product BOM once fulfillment occurred.

CREATE OR REPLACE FUNCTION public.rpc_reporting_overview(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_tz text DEFAULT 'UTC',
  p_include_historical boolean DEFAULT false,
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
  v_result jsonb;
BEGIN
  WITH period_orders AS (
    SELECT * FROM public.orders
    WHERE brand_id = v_brand_id AND created_at >= p_start_date AND created_at < p_end_date
  ),
  qualifying_paid AS (
    SELECT * FROM period_orders
    WHERE lower(COALESCE(payment_status, '')) = 'paid'
      AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'canceled', 'refunded')
      AND lower(COALESCE(fulfillment_status, '')) NOT IN ('cancelled', 'canceled', 'refunded')
      AND (p_include_historical OR lower(COALESCE(status, '')) <> 'archived_historical')
  ),
  paid_aggregates AS (
    SELECT currency,
      round(sum(total)::numeric, 3) AS pov,
      round(sum(subtotal)::numeric, 3) AS gross_merch,
      round(sum(discount)::numeric, 3) AS discounts,
      round(sum(subtotal - discount)::numeric, 3) AS net_merch,
      round(sum(shipping)::numeric, 3) AS shipping_collected,
      round(sum(tax_amount)::numeric, 3) AS vat_collected,
      count(*) FILTER (WHERE total > 0) AS paid_order_count,
      count(*) FILTER (WHERE total = 0) AS free_completed_order_count
    FROM qualifying_paid GROUP BY currency
  ),
  partial_orders AS (
    SELECT currency, round(sum(advance_paid)::numeric, 3) AS partial_amount
    FROM period_orders
    WHERE lower(COALESCE(payment_status, '')) IN ('partial', 'partially_paid')
      AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'canceled')
      AND (p_include_historical OR lower(COALESCE(status, '')) <> 'archived_historical')
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
        THEN COALESCE(pp.unit_packaging_cost, 0) ELSE 0 END))::numeric, 3) AS known_cogs,
      count(oi.id) FILTER (WHERE oi.unit_cost IS NULL) AS missing_cost_count,
      round(COALESCE(sum(oi.line_total) FILTER (WHERE oi.unit_cost IS NULL), 0)::numeric, 3) AS missing_cost_value
    FROM qualifying_paid o
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
    SELECT currency FROM paid_aggregates UNION SELECT currency FROM partial_orders
    UNION SELECT currency FROM refunded_orders UNION SELECT currency FROM cogs_data
    UNION SELECT currency FROM expenses_data
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'currency', c.currency,
    'paid_order_value', COALESCE(pa.pov, 0),
    'gross_merch_sales', COALESCE(pa.gross_merch, 0),
    'discounts', COALESCE(pa.discounts, 0),
    'net_merch_sales', COALESCE(pa.net_merch, 0),
    'shipping_collected', COALESCE(pa.shipping_collected, 0),
    'vat_collected', COALESCE(pa.vat_collected, 0),
    'paid_order_count', COALESCE(pa.paid_order_count, 0),
    'free_completed_order_count', COALESCE(pa.free_completed_order_count, 0),
    'partial_amount', COALESCE(po.partial_amount, 0),
    'refunded_total', COALESCE(ro.refunded_total, 0),
    'known_cogs', COALESCE(cd.known_cogs, 0),
    'missing_cost_item_count', COALESCE(cd.missing_cost_count, 0),
    'missing_cost_exposure', COALESCE(cd.missing_cost_value, 0),
    'expenses', COALESCE(ed.total_expenses, 0)
  )), '[]'::jsonb) INTO v_result
  FROM currencies c
  LEFT JOIN paid_aggregates pa ON pa.currency = c.currency
  LEFT JOIN partial_orders po ON po.currency = c.currency
  LEFT JOIN refunded_orders ro ON ro.currency = c.currency
  LEFT JOIN cogs_data cd ON cd.currency = c.currency
  LEFT JOIN expenses_data ed ON ed.currency = c.currency;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_sales(
  p_start_date timestamptz, p_end_date timestamptz,
  p_interval text DEFAULT 'day', p_tz text DEFAULT 'UTC',
  p_include_historical boolean DEFAULT false, p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_brand_id uuid := public.reporting_brand_id(p_brand_slug); v_result jsonb;
BEGIN
  IF p_interval NOT IN ('day', 'week', 'month', 'year') THEN RAISE EXCEPTION 'INVALID_INTERVAL'; END IF;
  WITH paid_orders AS (
    SELECT o.* FROM public.orders o
    WHERE o.brand_id = v_brand_id AND o.created_at >= p_start_date AND o.created_at < p_end_date
      AND lower(COALESCE(o.payment_status, '')) = 'paid'
      AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'refunded')
      AND lower(COALESCE(o.fulfillment_status, '')) NOT IN ('cancelled', 'canceled', 'refunded')
      AND (p_include_historical OR lower(COALESCE(o.status, '')) <> 'archived_historical')
  ), timeseries AS (
    SELECT date_trunc(p_interval, o.created_at AT TIME ZONE p_tz) AS time_bucket,
      o.currency, count(*)::bigint AS paid_order_count, sum(o.total)::numeric AS pov,
      sum(o.subtotal - o.discount)::numeric AS net_merch,
      sum(o.discount)::numeric AS discounts, sum(o.shipping)::numeric AS shipping_collected,
      sum(o.tax_amount)::numeric AS vat_collected
    FROM paid_orders o GROUP BY 1, o.currency
  ), payment AS (
    SELECT COALESCE(NULLIF(o.payment_method, ''), 'unknown') AS payment_method,
      o.currency, count(*)::bigint AS order_count, sum(o.total)::numeric AS pov
    FROM paid_orders o GROUP BY 1, o.currency
  ), fulfillment AS (
    SELECT COALESCE(NULLIF(o.fulfillment_method, ''), 'unknown') AS fulfillment_method,
      o.currency, count(*)::bigint AS order_count, sum(o.total)::numeric AS pov
    FROM paid_orders o GROUP BY 1, o.currency
  )
  SELECT jsonb_build_object(
    'timeseries', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.time_bucket, t.currency) FROM timeseries t), '[]'::jsonb),
    'payment', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.payment_method, p.currency) FROM payment p), '[]'::jsonb),
    'fulfillment', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.fulfillment_method, f.currency) FROM fulfillment f), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_processing_fees(
  p_start_date timestamptz, p_end_date timestamptz,
  p_include_historical boolean DEFAULT false, p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(result) ORDER BY result.currency), '[]'::jsonb)
  FROM (
    SELECT o.currency, COALESCE(sum(CASE
      WHEN lower(COALESCE(o.payment_method, '')) = 'card'
        THEN o.total * COALESCE(bs.card_processing_fee, 0) / 100
      WHEN lower(COALESCE(o.payment_method, '')) IN ('benefit', 'benefitpay', 'benefit_pay')
        THEN o.total * COALESCE(bs.benefit_processing_fee, 0) / 100
      ELSE 0 END), 0)::numeric AS processing_fees
    FROM public.orders o
    LEFT JOIN public.business_settings bs ON bs.brand_id = o.brand_id
    WHERE o.brand_id = public.reporting_brand_id(p_brand_slug)
      AND o.created_at >= p_start_date AND o.created_at < p_end_date
      AND lower(COALESCE(o.payment_status, '')) = 'paid'
      AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'refunded')
      AND lower(COALESCE(o.fulfillment_status, '')) NOT IN ('cancelled', 'canceled', 'refunded')
      AND (p_include_historical OR lower(COALESCE(o.status, '')) <> 'archived_historical')
    GROUP BY o.currency
  ) result;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_products_inventory(
  p_start_date timestamptz, p_end_date timestamptz, p_tz text DEFAULT 'UTC',
  p_include_historical boolean DEFAULT false, p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0, p_sort_by text DEFAULT 'units_sold_desc',
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
    SELECT COALESCE(p.name, oi.description) AS product_name, pv.id AS variant_id,
      pv.sku, pv.size, pv.color, pv.fabric, o.currency,
      sum(oi.quantity)::bigint AS units_sold, sum(oi.line_total)::numeric AS net_merch_sales,
      sum(oi.quantity * (COALESCE(oi.unit_cost, 0) + CASE
        WHEN lower(COALESCE(o.fulfillment_status, o.status, '')) IN
          ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up')
        THEN COALESCE(pp.unit_packaging_cost, 0) ELSE 0 END))::numeric AS known_cogs,
      bool_or(oi.unit_cost IS NULL) AS is_missing_cost,
      COALESCE(pv.stock_main, pv.stock, 0)::integer AS current_stock,
      COALESCE(pv.stock_main, pv.stock, 0) <= 0 AS is_out_of_stock,
      COALESCE(pv.stock_main, pv.stock, 0) BETWEEN 1 AND 5 AS is_low_stock
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
    LEFT JOIN public.products p ON p.id = oi.product_id AND p.brand_id = v_brand_id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id AND pv.brand_id = v_brand_id
    LEFT JOIN product_packaging pp ON pp.product_id = oi.product_id
    WHERE o.brand_id = v_brand_id AND o.created_at >= p_start_date AND o.created_at < p_end_date
      AND lower(COALESCE(o.payment_status, '')) = 'paid'
      AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'refunded')
      AND lower(COALESCE(o.fulfillment_status, '')) NOT IN ('cancelled', 'canceled', 'refunded')
      AND (p_include_historical OR lower(COALESCE(o.status, '')) <> 'archived_historical')
    GROUP BY p.id, p.name, oi.description, pv.id, pv.sku, pv.size, pv.color, pv.fabric,
      pv.stock_main, pv.stock, o.currency
  ), paged AS (
    SELECT * FROM rows ORDER BY
      CASE WHEN p_sort_by = 'units_sold_desc' THEN units_sold END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'net_merch_desc' THEN net_merch_sales END DESC NULLS LAST,
      product_name, size, color, fabric LIMIT p_limit OFFSET p_offset
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(paged)), '[]'::jsonb) INTO v_result FROM paged;
  RETURN v_result;
END;
$$;
