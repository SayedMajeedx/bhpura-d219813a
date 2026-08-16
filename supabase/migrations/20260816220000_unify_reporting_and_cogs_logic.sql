-- Migration: Unify Reporting, COGS, and OpEx Logic across Dashboard, Reports, and Accounting
-- Created At: 2026-08-16

CREATE OR REPLACE FUNCTION public.reporting_brand_id(p_brand_slug text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_brand_id uuid;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  
  -- Guard: If user is authenticated, ensure profile exists and is active
  IF auth.uid() IS NOT NULL THEN
    IF v_profile.id IS NULL OR lower(COALESCE(v_profile.status, 'active')) NOT IN ('active', 'approved') THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
    IF NOT public.has_permission('view_financials') THEN
      RAISE EXCEPTION 'Denied: view_financials permission required';
    END IF;
  END IF;

  -- 1. If p_brand_slug is provided, look up brand by slug
  IF NULLIF(btrim(p_brand_slug), '') IS NOT NULL THEN
    SELECT id INTO v_brand_id
    FROM public.brands
    WHERE lower(slug) = lower(btrim(p_brand_slug))
      AND is_active = true
    LIMIT 1;
  END IF;

  -- 2. If no brand slug provided or not found by slug, fallback to user's assigned brand_id
  IF v_brand_id IS NULL AND v_profile.brand_id IS NOT NULL THEN
    v_brand_id := v_profile.brand_id;
  END IF;

  -- 3. Fallback: single active store brand if v_brand_id still null
  IF v_brand_id IS NULL THEN
    SELECT id INTO v_brand_id
    FROM public.brands
    WHERE is_active = true
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- Verify access if authenticated user
  IF auth.uid() IS NOT NULL AND v_brand_id IS NOT NULL THEN
    IF v_profile.role <> 'super_admin' AND NOT public.can_access_brand(v_brand_id) THEN
      RAISE EXCEPTION 'BRAND_NOT_FOUND_OR_FORBIDDEN';
    END IF;
  END IF;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'BRAND_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  RETURN v_brand_id;
END;
$$;

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
    WHERE lower(status) IN ('confirmed', 'paid', 'shipped', 'completed')
      AND lower(status) NOT IN ('cancelled', 'canceled', 'draft', 'pending_verification', 'benefit_rejected')
      AND (p_include_historical OR lower(status) <> 'archived_historical')
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
    WHERE lower(payment_status) IN ('partial', 'partially_paid')
      AND lower(status) NOT IN ('cancelled', 'canceled')
      AND (p_include_historical OR lower(status) <> 'archived_historical')
    GROUP BY currency
  ),
  refunded_orders AS (
    SELECT currency, round(sum(total)::numeric, 3) AS refunded_total
    FROM period_orders
    WHERE lower(payment_status) = 'refunded'
      AND (p_include_historical OR lower(status) <> 'archived_historical')
    GROUP BY currency
  ),
  cogs_data AS (
    SELECT o.currency,
      round(sum(oi.quantity * (COALESCE(oi.unit_cost, 0) + CASE WHEN lower(COALESCE(o.fulfillment_status, o.status, '')) IN ('fulfilled', 'delivered', 'completed', 'shipped') THEN COALESCE(p.direct_packaging_cost, 0) ELSE 0 END))::numeric, 3) AS known_cogs,
      count(oi.id) FILTER (WHERE oi.unit_cost IS NULL) AS missing_cost_count,
      round((sum(oi.line_total) FILTER (WHERE oi.unit_cost IS NULL))::numeric, 3) AS missing_cost_value
    FROM qualifying_paid o
    JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
    LEFT JOIN public.products p ON p.id = oi.product_id
    GROUP BY o.currency
  ),
  expenses_data AS (
    SELECT currency, round(sum(amount)::numeric, 3) AS total_expenses
    FROM public.expenses
    WHERE brand_id = v_brand_id
      AND lower(COALESCE(expense_type, 'opex')) = 'opex'
      AND expense_date >= (p_start_date AT TIME ZONE p_tz)::date
      AND expense_date < (p_end_date AT TIME ZONE p_tz)::date
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
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_interval text DEFAULT 'day',
  p_tz text DEFAULT 'UTC',
  p_include_historical boolean DEFAULT false,
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
  v_trunc text;
  v_result jsonb;
BEGIN
  IF p_interval NOT IN ('day', 'week', 'month', 'year') THEN RAISE EXCEPTION 'INVALID_INTERVAL'; END IF;
  v_trunc := p_interval;
  WITH paid_orders AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.brand_id = v_brand_id
      AND o.created_at >= p_start_date AND o.created_at < p_end_date
      AND lower(o.status) IN ('confirmed', 'paid', 'shipped', 'completed')
      AND lower(o.status) NOT IN ('cancelled', 'canceled', 'draft', 'pending_verification', 'benefit_rejected')
      AND (p_include_historical OR lower(o.status) <> 'archived_historical')
  ),
  timeseries AS (
    SELECT date_trunc(v_trunc, o.created_at AT TIME ZONE p_tz) AS time_bucket,
      o.currency, COUNT(*)::bigint AS paid_order_count,
      SUM(o.total)::numeric AS pov,
      SUM(o.subtotal - o.discount)::numeric AS net_merch,
      SUM(o.discount)::numeric AS discounts,
      SUM(o.shipping)::numeric AS shipping_collected,
      SUM(o.tax_amount)::numeric AS vat_collected
    FROM paid_orders o GROUP BY 1, o.currency
  ),
  payment AS (
    SELECT COALESCE(NULLIF(o.payment_method, ''), 'unknown') AS payment_method,
      o.currency, COUNT(*)::bigint AS order_count, SUM(o.total)::numeric AS pov
    FROM paid_orders o GROUP BY 1, o.currency
  ),
  fulfillment AS (
    SELECT COALESCE(NULLIF(o.fulfillment_method, ''), 'unknown') AS fulfillment_method,
      o.currency, COUNT(*)::bigint AS order_count, SUM(o.total)::numeric AS pov
    FROM paid_orders o GROUP BY 1, o.currency
  )
  SELECT jsonb_build_object(
    'timeseries', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.time_bucket, t.currency) FROM timeseries t), '[]'::jsonb),
    'payment', COALESCE((SELECT jsonb_agg(to_jsonb(pm) ORDER BY pm.payment_method, pm.currency) FROM payment pm), '[]'::jsonb),
    'fulfillment', COALESCE((SELECT jsonb_agg(to_jsonb(fm) ORDER BY fm.fulfillment_method, fm.currency) FROM fulfillment fm), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_processing_fees(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_include_historical boolean DEFAULT false,
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(result) ORDER BY result.currency), '[]'::jsonb)
  FROM (
    SELECT o.currency,
      COALESCE(SUM(CASE
        WHEN lower(COALESCE(o.payment_method, '')) = 'card'
          THEN o.total * COALESCE(bs.card_processing_fee, 0) / 100
        WHEN lower(COALESCE(o.payment_method, '')) IN ('benefit', 'benefitpay', 'benefit_pay')
          THEN o.total * COALESCE(bs.benefit_processing_fee, 0) / 100
        ELSE 0 END), 0)::numeric AS processing_fees
    FROM public.orders o
    LEFT JOIN public.business_settings bs ON bs.brand_id = o.brand_id
    WHERE o.brand_id = public.reporting_brand_id(p_brand_slug)
      AND o.created_at >= p_start_date AND o.created_at < p_end_date
      AND lower(COALESCE(o.status, '')) IN ('confirmed', 'paid', 'shipped', 'completed')
      AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'draft', 'pending_verification', 'benefit_rejected')
      AND (p_include_historical OR lower(COALESCE(o.status, '')) <> 'archived_historical')
    GROUP BY o.currency
  ) result;
$$;
