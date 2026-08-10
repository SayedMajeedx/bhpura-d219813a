-- Repair routines that currently fail schema validation in production.
-- The vendor routines are orphaned: their backing tables/functions do not
-- exist and no application code calls them. Drop only these exact names and
-- deliberately avoid CASCADE so an unexpected dependency aborts the rollout.
DO $$
DECLARE
  v_function regprocedure;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'process_rent_auto_deduction',
        'get_vendor_dashboard_stats',
        'get_contract_by_signing_token',
        'sign_vendor_contract_by_token',
        'create_vendor_contract'
      )
  LOOP
    EXECUTE format('DROP FUNCTION %s', v_function);
  END LOOP;
END;
$$;

-- reporting_brand_id performs authorization through functions that PostgreSQL
-- correctly treats as volatile. Match that volatility instead of allowing the
-- planner to cache permission-sensitive results.
ALTER FUNCTION public.reporting_brand_id(text) VOLATILE;
ALTER FUNCTION public.rpc_reporting_sales(timestamptz,timestamptz,text,text,boolean,text) VOLATILE;
ALTER FUNCTION public.rpc_reporting_products_inventory(timestamptz,timestamptz,text,boolean,integer,integer,text,text) VOLATILE;
ALTER FUNCTION public.rpc_reporting_customers(timestamptz,timestamptz,text,boolean,integer,integer,text) VOLATILE;

CREATE OR REPLACE FUNCTION public.rpc_reporting_overview(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_tz text DEFAULT 'UTC',
  p_include_historical boolean DEFAULT false,
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
  v_result jsonb;
BEGIN
  WITH period_orders AS (
    SELECT * FROM public.orders
    WHERE brand_id = v_brand_id
      AND created_at >= p_start_date AND created_at < p_end_date
  ),
  qualifying_paid AS (
    SELECT * FROM period_orders
    WHERE lower(COALESCE(payment_status, '')) = 'paid'
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
      round(sum(oi.quantity * COALESCE(pv.cost_price, 0))::numeric, 3) AS known_cogs,
      count(oi.id) FILTER (WHERE pv.cost_price IS NULL OR pv.id IS NULL) AS missing_cost_count,
      round((sum(oi.line_total) FILTER (
        WHERE pv.cost_price IS NULL OR pv.id IS NULL
      ))::numeric, 3) AS missing_cost_value
    FROM qualifying_paid o
    JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id AND pv.brand_id = v_brand_id
    GROUP BY o.currency
  ),
  expenses_data AS (
    SELECT currency, round(sum(amount)::numeric, 3) AS total_expenses
    FROM public.expenses
    WHERE brand_id = v_brand_id
      AND expense_date >= (p_start_date AT TIME ZONE p_tz)::date
      AND expense_date < (p_end_date AT TIME ZONE p_tz)::date
    GROUP BY currency
  ),
  currencies AS (
    SELECT currency FROM paid_aggregates
    UNION SELECT currency FROM partial_orders
    UNION SELECT currency FROM refunded_orders
    UNION SELECT currency FROM cogs_data
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
  ) ORDER BY c.currency), '[]'::jsonb) INTO v_result
  FROM currencies c
  LEFT JOIN paid_aggregates pa USING (currency)
  LEFT JOIN partial_orders po USING (currency)
  LEFT JOIN refunded_orders ro USING (currency)
  LEFT JOIN cogs_data cd USING (currency)
  LEFT JOIN expenses_data ed USING (currency);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_expenses(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_tz text DEFAULT 'UTC',
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC)
    FROM (
      SELECT category, currency, count(*)::bigint AS expense_count,
        sum(amount)::numeric AS amount
      FROM public.expenses
      WHERE brand_id = v_brand_id
        AND expense_date >= (p_start_date AT TIME ZONE p_tz)::date
        AND expense_date < (p_end_date AT TIME ZONE p_tz)::date
      GROUP BY category, currency
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_export(
  p_report_type text,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_tz text DEFAULT 'UTC',
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
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
          'shipping', o.shipping, 'tax_amount', o.tax_amount, 'total', o.total
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
          AND lower(COALESCE(o.payment_status, '')) = 'paid'
          AND lower(o.status) NOT IN ('cancelled', 'canceled')
        GROUP BY c.id, c.name, o.currency
      ) x
    ), '[]'::jsonb);
  END IF;
  RAISE EXCEPTION 'INVALID_REPORT_TYPE';
END;
$$;

-- brand_pages was removed, but onboarding still referenced it. Recreate the
-- supported provisioning function without the obsolete page seed.
CREATE OR REPLACE FUNCTION public.create_tenant_with_defaults(
  p_slug text,
  p_name_en text,
  p_name_ar text,
  p_primary_color text,
  p_owner_id uuid,
  p_business_type text DEFAULT 'Fashion'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_brand_id uuid;
BEGIN
  p_slug := lower(trim(p_slug));
  INSERT INTO public.brands (
    slug, name_en, name_ar, primary_color, created_by, business_type, is_active
  ) VALUES (
    p_slug, p_name_en, p_name_ar, p_primary_color, p_owner_id, p_business_type, true
  ) RETURNING id INTO v_brand_id;

  INSERT INTO public.business_settings (
    brand_id, business_name, primary_color, background_color, text_color,
    currency, delivery_fee, cod_enabled, card_enabled, benefit_enabled,
    delivery_enabled, pickup_enabled, vat_inclusive, default_tax_rate
  ) VALUES (
    v_brand_id, p_name_en, p_primary_color, '#ffffff', '#1c1917',
    'BHD', 1.500, true, false, false,
    p_business_type <> 'Digital store', true, false, 10.0
  );

  INSERT INTO public.categories (brand_id, name_en, name_ar, slug)
  VALUES (
    v_brand_id,
    CASE WHEN p_business_type = 'Cafe / Restaurant' THEN 'Beverages'
         WHEN p_business_type = 'Digital store' THEN 'Digital Assets'
         ELSE 'New Arrivals' END,
    CASE WHEN p_business_type = 'Cafe / Restaurant' THEN 'المشروبات'
         WHEN p_business_type = 'Digital store' THEN 'المنتجات الرقمية'
         ELSE 'وصلنا حديثاً' END,
    CASE WHEN p_business_type = 'Cafe / Restaurant' THEN 'beverages'
         WHEN p_business_type = 'Digital store' THEN 'digital-assets'
         ELSE 'new-arrivals' END
  );
  RETURN v_brand_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_with_defaults(text,text,text,text,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_defaults(text,text,text,text,uuid,text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
