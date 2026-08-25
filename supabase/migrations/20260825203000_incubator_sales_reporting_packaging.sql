-- Incubator sales become first-class reporting events. Packaging policy is
-- contractual per incubator and every sale snapshots its financial inputs.

ALTER TABLE public.incubators
  ADD COLUMN IF NOT EXISTS packaging_policy text NOT NULL DEFAULT 'incubator',
  ADD COLUMN IF NOT EXISTS fixed_packaging_cost numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE public.incubators DROP CONSTRAINT IF EXISTS incubators_packaging_policy_check;
ALTER TABLE public.incubators ADD CONSTRAINT incubators_packaging_policy_check
  CHECK (packaging_policy IN ('incubator', 'our_bom', 'fixed'));
ALTER TABLE public.incubators DROP CONSTRAINT IF EXISTS incubators_fixed_packaging_cost_check;
ALTER TABLE public.incubators ADD CONSTRAINT incubators_fixed_packaging_cost_check
  CHECK (fixed_packaging_cost >= 0);

ALTER TABLE public.incubator_sales
  ADD COLUMN IF NOT EXISTS product_cost_snapshot numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_cost_snapshot numeric(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_policy_snapshot text NOT NULL DEFAULT 'incubator',
  ADD COLUMN IF NOT EXISTS packaging_materials_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.incubator_sales DROP CONSTRAINT IF EXISTS incubator_sales_packaging_policy_check;
ALTER TABLE public.incubator_sales ADD CONSTRAINT incubator_sales_packaging_policy_check
  CHECK (packaging_policy_snapshot IN ('incubator', 'our_bom', 'fixed'));

-- Existing sales used incubator-provided packaging. Snapshot historical product
-- cost without rewriting revenue, commission, settlement, or inventory history.
UPDATE public.incubator_sales s
SET product_cost_snapshot = round(COALESCE(v.cost_price, 0) * s.quantity, 3),
    packaging_policy_snapshot = 'incubator',
    packaging_cost_snapshot = 0
FROM public.product_variants v
WHERE v.id = s.variant_id AND s.product_cost_snapshot = 0;

CREATE OR REPLACE FUNCTION public.record_incubator_sale(
  p_incubator_id uuid, p_variant_id uuid, p_quantity integer,
  p_unit_price numeric DEFAULT NULL, p_sold_at timestamptz DEFAULT now()
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inc public.incubators%ROWTYPE;
  v_item public.incubator_inventory%ROWTYPE;
  v_product_id uuid;
  v_unit_product_cost numeric(12,3);
  v_direct_packaging numeric(12,3);
  v_gross numeric(12,3);
  v_commission numeric(12,3);
  v_net numeric(12,3);
  v_packaging numeric(12,3) := 0;
  v_materials jsonb := '[]'::jsonb;
  v_sale_id uuid;
  r record;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  SELECT * INTO v_inc FROM public.incubators WHERE id = p_incubator_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_brand(v_inc.brand_id)
    OR NOT public.has_permission('manage_inventory') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;

  SELECT * INTO v_item FROM public.incubator_inventory
  WHERE incubator_id = p_incubator_id AND variant_id = p_variant_id FOR UPDATE;
  IF NOT FOUND OR v_item.quantity < p_quantity THEN RAISE EXCEPTION 'INSUFFICIENT_INCUBATOR_STOCK'; END IF;

  SELECT v.product_id, COALESCE(v.cost_price, 0), COALESCE(p.direct_packaging_cost, 0)
  INTO v_product_id, v_unit_product_cost, v_direct_packaging
  FROM public.product_variants v JOIN public.products p ON p.id = v.product_id
  WHERE v.id = p_variant_id AND p.brand_id = v_inc.brand_id;
  IF v_product_id IS NULL THEN RAISE EXCEPTION 'VARIANT_NOT_FOUND'; END IF;

  IF v_inc.packaging_policy = 'our_bom' THEN
    v_packaging := round(v_direct_packaging * p_quantity, 3);
    FOR r IN
      SELECT pm.id, pm.unit_cost, pbi.quantity_per_unit,
        pbi.quantity_per_unit * p_quantity AS required_quantity
      FROM public.product_bom_items pbi
      JOIN public.packaging_materials pm ON pm.id = pbi.packaging_material_id
      WHERE pbi.product_id = v_product_id AND pbi.brand_id = v_inc.brand_id
      FOR UPDATE OF pm
    LOOP
      UPDATE public.packaging_materials
      SET stock_quantity = stock_quantity - r.required_quantity
      WHERE id = r.id AND stock_quantity >= r.required_quantity;
      IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_PACKAGING_STOCK'; END IF;
      v_packaging := v_packaging + round(r.unit_cost * r.required_quantity, 3);
      v_materials := v_materials || jsonb_build_array(jsonb_build_object(
        'material_id', r.id, 'quantity', r.required_quantity, 'unit_cost', r.unit_cost));
    END LOOP;
  ELSIF v_inc.packaging_policy = 'fixed' THEN
    v_packaging := round(v_inc.fixed_packaging_cost * p_quantity, 3);
  END IF;

  v_gross := round(COALESCE(p_unit_price, v_item.consignment_price) * p_quantity, 3);
  v_commission := CASE WHEN v_item.commission_type = 'percentage'
    THEN round(v_gross * v_item.commission_value / 100, 3)
    ELSE round(v_item.commission_value * p_quantity, 3) END;
  v_commission := least(v_commission, v_gross);
  v_net := v_gross - v_commission;

  UPDATE public.incubator_inventory SET quantity = quantity - p_quantity WHERE id = v_item.id;
  UPDATE public.product_variants SET stock_incubator = stock_incubator - p_quantity
  WHERE id = p_variant_id AND stock_incubator >= p_quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'INCUBATOR_STOCK_OUT_OF_SYNC'; END IF;

  INSERT INTO public.incubator_sales(
    brand_id, incubator_id, variant_id, quantity, unit_price, gross_amount,
    commission_amount, net_due, sold_at, product_cost_snapshot,
    packaging_cost_snapshot, packaging_policy_snapshot, packaging_materials_snapshot)
  VALUES (
    v_inc.brand_id, p_incubator_id, p_variant_id, p_quantity,
    COALESCE(p_unit_price, v_item.consignment_price), v_gross, v_commission, v_net, p_sold_at,
    round(v_unit_product_cost * p_quantity, 3), round(v_packaging, 3),
    v_inc.packaging_policy, v_materials)
  RETURNING id INTO v_sale_id;

  INSERT INTO public.incubator_movements(brand_id, incubator_id, variant_id, movement_type,
    quantity_delta, reference_type, reference_id)
  VALUES (v_inc.brand_id, p_incubator_id, p_variant_id, 'sale', -p_quantity, 'sale', v_sale_id);
  RETURN v_sale_id;
END; $$;

CREATE OR REPLACE FUNCTION public.reverse_incubator_sale(p_sale_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sale public.incubator_sales%ROWTYPE; r record;
BEGIN
  SELECT * INTO v_sale FROM public.incubator_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_brand(v_sale.brand_id)
    OR NOT public.has_permission('manage_inventory') THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF v_sale.status <> 'confirmed' THEN RAISE EXCEPTION 'SALE_ALREADY_REVERSED'; END IF;
  IF v_sale.paid_amount > 0 THEN RAISE EXCEPTION 'PAID_SALE_CANNOT_BE_REVERSED'; END IF;

  UPDATE public.incubator_sales SET status = 'reversed', reversal_reason = nullif(trim(p_reason), ''),
    reversed_at = now(), reversed_by = auth.uid() WHERE id = p_sale_id;
  UPDATE public.incubator_inventory SET quantity = quantity + v_sale.quantity
  WHERE incubator_id = v_sale.incubator_id AND variant_id = v_sale.variant_id;
  UPDATE public.product_variants SET stock_incubator = stock_incubator + v_sale.quantity
  WHERE id = v_sale.variant_id;

  FOR r IN SELECT * FROM jsonb_to_recordset(v_sale.packaging_materials_snapshot)
    AS x(material_id uuid, quantity integer, unit_cost numeric)
  LOOP
    UPDATE public.packaging_materials SET stock_quantity = stock_quantity + r.quantity
    WHERE id = r.material_id AND brand_id = v_sale.brand_id;
  END LOOP;

  INSERT INTO public.incubator_movements(brand_id, incubator_id, variant_id, movement_type,
    quantity_delta, reference_type, reference_id, notes)
  VALUES (v_sale.brand_id, v_sale.incubator_id, v_sale.variant_id, 'sale_reversal',
    v_sale.quantity, 'sale', p_sale_id, p_reason);
END; $$;

-- One tenant-safe reporting payload powers overview, charts, and product merging.
CREATE OR REPLACE FUNCTION public.rpc_reporting_incubator_sales(
  p_start_date timestamptz, p_end_date timestamptz, p_tz text DEFAULT 'UTC',
  p_interval text DEFAULT 'day',
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_brand_id uuid := public.reporting_brand_id(p_brand_slug); v_result jsonb;
BEGIN
  IF p_interval NOT IN ('day', 'week', 'month', 'year') THEN RAISE EXCEPTION 'INVALID_INTERVAL'; END IF;
  WITH sales AS (
    SELECT s.*, i.currency, v.sku, v.size, v.color, v.fabric,
      COALESCE(p.name, v.sku, 'Incubator item') AS product_name,
      COALESCE(v.stock_main, v.stock, 0) AS current_stock
    FROM public.incubator_sales s
    JOIN public.incubators i ON i.id = s.incubator_id
    JOIN public.product_variants v ON v.id = s.variant_id
    JOIN public.products p ON p.id = v.product_id
    WHERE s.brand_id = v_brand_id AND s.status = 'confirmed'
      AND s.sold_at >= p_start_date AND s.sold_at < p_end_date
  ), summary AS (
    SELECT currency, count(*)::bigint AS sale_count, sum(gross_amount)::numeric AS gross_amount,
      sum(commission_amount)::numeric AS commission_amount,
      sum(product_cost_snapshot + packaging_cost_snapshot)::numeric AS cogs,
      sum(net_due - paid_amount)::numeric AS receivables, sum(paid_amount)::numeric AS collected
    FROM sales GROUP BY currency
  ), timeseries AS (
    SELECT date_trunc(p_interval, sold_at AT TIME ZONE p_tz) AS time_bucket, currency,
      count(*)::bigint AS sale_count, sum(gross_amount)::numeric AS gross_amount,
      sum(commission_amount)::numeric AS commission_amount,
      sum(product_cost_snapshot)::numeric AS product_cost_snapshot,
      sum(packaging_cost_snapshot)::numeric AS packaging_cost_snapshot,
      sum(net_due)::numeric AS net_due, sum(paid_amount)::numeric AS paid_amount
    FROM sales GROUP BY 1, currency
  ), products AS (
    SELECT variant_id, sku, size, color, fabric, product_name, currency,
      sum(quantity)::bigint AS units_sold, sum(gross_amount)::numeric AS net_merch_sales,
      sum(product_cost_snapshot + packaging_cost_snapshot)::numeric AS known_cogs,
      max(current_stock)::integer AS current_stock
    FROM sales GROUP BY variant_id, sku, size, color, fabric, product_name, currency
  )
  SELECT jsonb_build_object(
    'summary', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM summary x), '[]'::jsonb),
    'timeseries', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.time_bucket) FROM timeseries x), '[]'::jsonb),
    'products', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM products x), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.rpc_reporting_incubator_sales(timestamptz,timestamptz,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_incubator_sales(timestamptz,timestamptz,text,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
