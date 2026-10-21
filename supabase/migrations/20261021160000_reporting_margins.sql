-- ==============================================================================
-- Margin by product and category, adding up to the statement.
--
-- The products report counted sizes, stopped at its first page and had no margin. This gives
-- each product of the period its units, gross sales, discounts, returns, net sales and cost of
-- goods, with its category, made from the very figures the overview and the monthly statement
-- add up (migration 20261021140000), so the products' totals are the statement's:
--
--   * an order's own subtotal and discount are shared over its lines by their value (by their
--     quantity when none has one), so the lines' gross sales and discounts are the order's;
--   * a processed return is deducted in the period it was processed, from the products it
--     returned, shared by their value; a refund with no return record, over the order's lines;
--     only from an order that still counts as sold, as the statement does;
--   * cost of goods is the line's unit cost, with its packaging once the order has left; a
--     restocked piece gives its cost back; partner shops' sales count with their own figures;
--   * a line with no product is kept, as "not linked to a product", so nothing is lost.
--
-- Same caller check as every report (`reporting_brand_id`: signed in, `view_financials`).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_reporting_margins(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_include_historical boolean DEFAULT false,
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
  RETURN COALESCE((
    WITH sold AS (
      SELECT o.* FROM public.orders o
      WHERE o.brand_id = v_brand_id
        AND o.created_at >= p_start_date AND o.created_at < p_end_date
        AND public.reporting_counts_order(o.status, p_include_historical)
    ),
    lines AS (
      SELECT o.id AS order_id, o.currency, oi.product_id, oi.quantity, oi.unit_cost,
        COALESCE(o.subtotal, 0) AS order_subtotal, COALESCE(o.discount, 0) AS order_discount,
        lower(COALESCE(o.fulfillment_status, o.status, '')) IN
          ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up') AS has_left,
        COALESCE(oi.packaging_cost_snapshot, 0) AS packaging,
        GREATEST(COALESCE(oi.line_total, 0), 0) AS value,
        sum(GREATEST(COALESCE(oi.line_total, 0), 0)) OVER (PARTITION BY o.id) AS order_value,
        oi.quantity::numeric / NULLIF(sum(oi.quantity) OVER (PARTITION BY o.id), 0) AS quantity_share
      FROM sold o
      JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
    ),
    store_lines AS (
      SELECT currency, product_id,
        sum(quantity)::numeric AS units,
        sum(order_subtotal * CASE WHEN order_value > 0 THEN value / order_value
          ELSE COALESCE(quantity_share, 0) END) AS gross_sales,
        sum(order_discount * CASE WHEN order_value > 0 THEN value / order_value
          ELSE COALESCE(quantity_share, 0) END) AS discounts,
        sum(quantity * (COALESCE(unit_cost, 0) + CASE WHEN has_left THEN packaging ELSE 0 END)) AS cost,
        sum(quantity) FILTER (WHERE unit_cost IS NULL)::numeric AS missing_cost_units
      FROM lines GROUP BY currency, product_id
    ),
    returned AS (
      -- A processed return's merchandise refund, shared over the pieces it returned.
      SELECT o.currency, COALESCE(ri.product_id, oi.product_id) AS product_id,
        GREATEST(rr.total_item_refund - rr.pro_rated_discount_deduction, 0) *
          CASE WHEN sum(GREATEST(COALESCE(ri.total_price, 0), 0)) OVER (PARTITION BY rr.id) > 0
            THEN GREATEST(COALESCE(ri.total_price, 0), 0)
              / sum(GREATEST(COALESCE(ri.total_price, 0), 0)) OVER (PARTITION BY rr.id)
            ELSE 1.0 / count(*) OVER (PARTITION BY rr.id) END AS deduction,
        CASE WHEN ri.restocked THEN COALESCE(ri.restocked_quantity, 0) * COALESCE(oi.unit_cost, 0)
          ELSE 0 END AS cost_back
      FROM public.return_requests rr
      JOIN public.orders o ON o.id = rr.order_id AND o.brand_id = rr.brand_id
      JOIN public.return_items ri ON ri.return_id = rr.id AND ri.brand_id = rr.brand_id
      LEFT JOIN public.order_items oi ON oi.id = ri.order_item_id
      WHERE rr.brand_id = v_brand_id
        AND rr.refund_status = 'processed'
        AND rr.refund_processed_at >= p_start_date AND rr.refund_processed_at < p_end_date
        AND public.order_counts_as_sold(o.status)
    ),
    refunded_orders AS (
      -- A refund with no return record: the order's total, over its lines.
      SELECT o.currency, oi.product_id,
        o.total * CASE
          WHEN sum(GREATEST(COALESCE(oi.line_total, 0), 0)) OVER (PARTITION BY o.id) > 0
            THEN GREATEST(COALESCE(oi.line_total, 0), 0)
              / sum(GREATEST(COALESCE(oi.line_total, 0), 0)) OVER (PARTITION BY o.id)
          ELSE 1.0 / count(*) OVER (PARTITION BY o.id) END AS deduction
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
      WHERE o.brand_id = v_brand_id
        AND lower(COALESCE(o.payment_status, '')) = 'refunded'
        AND o.created_at >= p_start_date AND o.created_at < p_end_date
        AND public.order_counts_as_sold(o.status)
        AND NOT EXISTS (
          SELECT 1 FROM public.return_requests r
          WHERE r.order_id = o.id AND r.refund_status = 'processed'
        )
    ),
    returns_by_product AS (
      SELECT currency, product_id, sum(deduction) AS returns, sum(cost_back) AS cost_back
      FROM (
        SELECT currency, product_id, deduction, cost_back FROM returned
        UNION ALL
        SELECT currency, product_id, deduction, 0 FROM refunded_orders
      ) r
      GROUP BY currency, product_id
    ),
    partner AS (
      SELECT i.currency, v.product_id,
        sum(s.quantity)::numeric AS units,
        sum(s.gross_amount) AS gross_sales,
        sum(s.product_cost_snapshot + s.packaging_cost_snapshot) AS cost
      FROM public.incubator_sales s
      JOIN public.incubators i ON i.id = s.incubator_id
      JOIN public.product_variants v ON v.id = s.variant_id
      WHERE s.brand_id = v_brand_id AND s.status = 'confirmed'
        AND s.sold_at >= p_start_date AND s.sold_at < p_end_date
      GROUP BY i.currency, v.product_id
    ),
    keys AS (
      SELECT currency, product_id FROM store_lines
      UNION SELECT currency, product_id FROM returns_by_product
      UNION SELECT currency, product_id FROM partner
    )
    SELECT jsonb_agg(jsonb_build_object(
      'currency', k.currency,
      'product_id', k.product_id,
      'product_name', p.name,
      'product_name_ar', p.name_ar,
      'category', cat.slug,
      'category_name', COALESCE(cat.name_en, p.category),
      'category_name_ar', cat.name_ar,
      'units', COALESCE(sl.units, 0) + COALESCE(pa.units, 0),
      'partner_units', COALESCE(pa.units, 0),
      -- Full precision: a product's share is rounded only where it is shown, so the products
      -- add up to the statement to the fils however many there are.
      'gross_sales', COALESCE(sl.gross_sales, 0) + COALESCE(pa.gross_sales, 0),
      'partner_sales', COALESCE(pa.gross_sales, 0),
      'discounts', COALESCE(sl.discounts, 0),
      'returns', COALESCE(rp.returns, 0),
      -- Not held at zero per product: a restocked return of an earlier sale gives its cost back
      -- in the period it was processed, as the statement counts it.
      'cost_of_goods', COALESCE(sl.cost, 0) + COALESCE(pa.cost, 0) - COALESCE(rp.cost_back, 0),
      'missing_cost_units', COALESCE(sl.missing_cost_units, 0)
    ) ORDER BY k.currency, p.name NULLS LAST)
    FROM keys k
    LEFT JOIN public.products p ON p.id = k.product_id
    LEFT JOIN LATERAL (
      SELECT c.slug, c.name_en, c.name_ar FROM public.categories c
      WHERE c.brand_id = v_brand_id AND p.category IS NOT NULL
        AND (c.slug = p.category OR lower(c.name_en) = lower(p.category))
      ORDER BY (c.slug = p.category) DESC
      LIMIT 1
    ) cat ON true
    LEFT JOIN store_lines sl ON sl.currency = k.currency AND sl.product_id IS NOT DISTINCT FROM k.product_id
    LEFT JOIN returns_by_product rp ON rp.currency = k.currency AND rp.product_id IS NOT DISTINCT FROM k.product_id
    LEFT JOIN partner pa ON pa.currency = k.currency AND pa.product_id IS NOT DISTINCT FROM k.product_id
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_reporting_margins(timestamptz, timestamptz, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_margins(timestamptz, timestamptz, boolean, text)
  TO authenticated, service_role;
