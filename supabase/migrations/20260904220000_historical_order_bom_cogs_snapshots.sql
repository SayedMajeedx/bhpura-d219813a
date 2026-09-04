-- Repair historical storefront item links and freeze packaging COGS at the
-- moment an order is completed. This prevents old orders from losing BOM cost
-- and prevents later material-price edits from rewriting historical profit.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS packaging_cost_snapshot numeric(12,3);

-- Kept self-contained so this repair can also be run manually in SQL Editor.
CREATE OR REPLACE FUNCTION public.copy_brand_packaging_bom_to_product(
  p_brand_id uuid, p_product_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_template_product_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.product_bom_items
    WHERE brand_id = p_brand_id AND product_id = p_product_id) THEN RETURN; END IF;
  SELECT product_id INTO v_template_product_id
  FROM public.product_bom_items
  WHERE brand_id = p_brand_id AND product_id <> p_product_id
  GROUP BY product_id ORDER BY count(*) DESC, max(created_at) DESC LIMIT 1;
  IF v_template_product_id IS NULL THEN RETURN; END IF;
  UPDATE public.products target SET direct_packaging_cost = source.direct_packaging_cost
  FROM public.products source
  WHERE target.id = p_product_id AND target.brand_id = p_brand_id
    AND source.id = v_template_product_id;
  INSERT INTO public.product_bom_items
    (brand_id, product_id, packaging_material_id, quantity_per_unit)
  SELECT p_brand_id, p_product_id, packaging_material_id, quantity_per_unit
  FROM public.product_bom_items
  WHERE brand_id = p_brand_id AND product_id = v_template_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.inherit_brand_packaging_bom_on_product_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN
  PERFORM public.copy_brand_packaging_bom_to_product(NEW.brand_id, NEW.id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS inherit_brand_packaging_bom_trigger ON public.products;
CREATE TRIGGER inherit_brand_packaging_bom_trigger AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.inherit_brand_packaging_bom_on_product_insert();

-- Older checkout versions did not consistently persist product_id.
UPDATE public.order_items oi
SET product_id = pv.product_id
FROM public.product_variants pv
WHERE oi.product_id IS NULL
  AND oi.variant_id = pv.id
  AND oi.brand_id = pv.brand_id;

WITH matches AS (
  SELECT DISTINCT ON (oi.id) oi.id AS order_item_id,
    p.id AS product_id, pv.id AS variant_id
  FROM public.order_items oi
  JOIN public.product_variants pv
    ON pv.brand_id = oi.brand_id
   AND NULLIF(oi.selected_variant->>'sku', '') IS NOT NULL
   AND lower(pv.sku) = lower(oi.selected_variant->>'sku')
  JOIN public.products p ON p.id = pv.product_id AND p.brand_id = pv.brand_id
  WHERE oi.product_id IS NULL
  ORDER BY oi.id, pv.created_at DESC
)
UPDATE public.order_items oi
SET product_id = matches.product_id,
    variant_id = COALESCE(oi.variant_id, matches.variant_id)
FROM matches
WHERE oi.id = matches.order_item_id;

-- Final conservative fallback: exact product-name match only.
WITH matches AS (
  SELECT DISTINCT ON (oi.id) oi.id AS order_item_id, p.id AS product_id
  FROM public.order_items oi
  JOIN public.products p ON p.brand_id = oi.brand_id
   AND lower(trim(oi.description)) IN (
     lower(trim(COALESCE(p.name, ''))),
     lower(trim(COALESCE(p.name_ar, ''))),
     lower(trim(COALESCE(p.name_en, '')))
   )
  WHERE oi.product_id IS NULL AND NULLIF(trim(oi.description), '') IS NOT NULL
  ORDER BY oi.id, p.created_at DESC
)
UPDATE public.order_items oi
SET product_id = matches.product_id
FROM matches
WHERE oi.id = matches.order_item_id;

-- Ensure every active direct-sale product has the brand packaging template.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.brand_id, p.id
    FROM public.products p
    WHERE p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.product_bom_items pbi
        WHERE pbi.brand_id = p.brand_id AND pbi.product_id = p.id
      )
  LOOP
    PERFORM public.copy_brand_packaging_bom_to_product(r.brand_id, r.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_order_packaging_cogs(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  WITH product_packaging AS (
    SELECT p.id AS product_id,
      COALESCE(p.direct_packaging_cost, 0) +
      COALESCE(sum(pbi.quantity_per_unit * pm.unit_cost), 0) AS unit_packaging_cost
    FROM public.products p
    LEFT JOIN public.product_bom_items pbi
      ON pbi.product_id = p.id AND pbi.brand_id = p.brand_id
    LEFT JOIN public.packaging_materials pm
      ON pm.id = pbi.packaging_material_id AND pm.brand_id = p.brand_id
    GROUP BY p.id, p.direct_packaging_cost
  )
  UPDATE public.order_items oi
  SET packaging_cost_snapshot = round(COALESCE(pp.unit_packaging_cost, 0)::numeric, 3)
  FROM product_packaging pp
  WHERE oi.order_id = p_order_id
    AND oi.product_id = pp.product_id
    AND oi.packaging_cost_snapshot IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.snapshot_packaging_cogs_on_order_completion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND lower(COALESCE(NEW.fulfillment_status, NEW.status, '')) IN
      ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up') THEN
    PERFORM public.snapshot_order_packaging_cogs(NEW.id);
  ELSIF TG_OP = 'UPDATE'
    AND lower(COALESCE(NEW.fulfillment_status, NEW.status, '')) IN
      ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up')
    AND lower(COALESCE(OLD.fulfillment_status, OLD.status, '')) NOT IN
      ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up') THEN
    PERFORM public.snapshot_order_packaging_cogs(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_packaging_cogs_order_trigger ON public.orders;
CREATE TRIGGER snapshot_packaging_cogs_order_trigger
AFTER INSERT OR UPDATE OF status, fulfillment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.snapshot_packaging_cogs_on_order_completion();

CREATE OR REPLACE FUNCTION public.snapshot_packaging_cogs_on_order_item_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = NEW.order_id
      AND lower(COALESCE(o.fulfillment_status, o.status, '')) IN
        ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up')
  ) THEN
    PERFORM public.snapshot_order_packaging_cogs(NEW.order_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_packaging_cogs_item_trigger ON public.order_items;
CREATE TRIGGER snapshot_packaging_cogs_item_trigger
AFTER INSERT OR UPDATE OF product_id ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.snapshot_packaging_cogs_on_order_item_insert();

-- Backfill every historical completed order after repairing its product link.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.orders
    WHERE lower(COALESCE(fulfillment_status, status, '')) IN
      ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up')
  LOOP
    PERFORM public.snapshot_order_packaging_cogs(r.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reporting_order_cogs(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_include_historical boolean DEFAULT false,
  p_brand_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
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
        AND lower(COALESCE(o.payment_status, '')) = 'paid'
        AND lower(COALESCE(o.status, '')) NOT IN ('cancelled', 'canceled', 'refunded')
        AND lower(COALESCE(o.fulfillment_status, '')) NOT IN ('cancelled', 'canceled', 'refunded')
        AND (p_include_historical OR lower(COALESCE(o.status, '')) <> 'archived_historical')
      GROUP BY o.currency
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_order_packaging_cogs(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snapshot_packaging_cogs_on_order_completion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snapshot_packaging_cogs_on_order_item_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_reporting_order_cogs(timestamptz,timestamptz,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_order_cogs(timestamptz,timestamptz,boolean,text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_order_items_reporting_product
  ON public.order_items (brand_id, order_id, product_id);

NOTIFY pgrst, 'reload schema';
