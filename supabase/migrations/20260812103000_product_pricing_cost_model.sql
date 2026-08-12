-- Normalize catalog pricing: variants store final prices, while products own defaults.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price numeric(14,3) NOT NULL DEFAULT 0;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_cost_price_nonnegative;
ALTER TABLE public.products ADD CONSTRAINT products_cost_price_nonnegative CHECK (cost_price >= 0);

COMMENT ON COLUMN public.products.cost_price IS
  'Default unit inventory cost inherited by newly created variants; recognized as COGS only when sold.';
COMMENT ON COLUMN public.product_variants.selling_price IS
  'Final selling price. When lower than original_price, the storefront displays a sale.';
COMMENT ON COLUMN public.product_variants.original_price IS
  'Regular pre-discount price; normally inherited from products.base_price.';

-- Snapshot cost on each order line so later catalog cost edits never rewrite historical profit.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric(14,3) CHECK (unit_cost IS NULL OR unit_cost >= 0);

UPDATE public.order_items oi
SET unit_cost = pv.cost_price
FROM public.product_variants pv
WHERE pv.id = oi.variant_id AND oi.unit_cost IS NULL;

CREATE OR REPLACE FUNCTION public.snapshot_order_item_unit_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.variant_id IS NOT NULL AND NEW.unit_cost IS NULL THEN
    SELECT pv.cost_price INTO NEW.unit_cost
    FROM public.product_variants pv
    WHERE pv.id = NEW.variant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_order_item_unit_cost_trigger ON public.order_items;
CREATE TRIGGER snapshot_order_item_unit_cost_trigger
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_item_unit_cost();

GRANT SELECT (cost_price) ON public.products TO authenticated;
GRANT SELECT (unit_cost) ON public.order_items TO authenticated;

-- Reporting overview must use the immutable order-line snapshot, not today's catalog cost.
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
      round(sum(oi.quantity * COALESCE(oi.unit_cost, 0))::numeric, 3) AS known_cogs,
      count(oi.id) FILTER (WHERE oi.unit_cost IS NULL) AS missing_cost_count,
      round((sum(oi.line_total) FILTER (WHERE oi.unit_cost IS NULL))::numeric, 3) AS missing_cost_value
    FROM qualifying_paid o
    JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
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
