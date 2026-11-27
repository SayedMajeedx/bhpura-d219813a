-- An order line whose piece has no cost recorded says so (the final report of 2026-11-27,
-- improvement 1): its `unit_cost` is left empty, never written as zero.
--
-- `snapshot_order_item_unit_cost` (migration 20261019120000) gave a line its size's cost, else its
-- product's, and when neither had one it wrote the size's zero. A zero reads as "this piece cost
-- nothing": the order's profit, the Margins report and the month pack counted the whole price as
-- profit, and the reports' "cost data is incomplete" check (`missing_cost_units`, which counts an
-- empty `unit_cost`) never saw it. Now:
--   - a cost the writer gave is kept, as before (a line may be given 0 on purpose);
--   - the size's own cost, else the product's, when it is above zero, as before;
--   - a service or a package with neither costs the store nothing per piece: zero, as before;
--   - anything else is unknown: the line keeps no cost, and every report says so.
-- Lines already written are not touched (the live data had none written as a wrong zero).

CREATE OR REPLACE FUNCTION public.snapshot_order_item_unit_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_size_cost numeric;
  v_product uuid := NEW.product_id;
  v_product_cost numeric;
  v_is_service boolean := false;
BEGIN
  IF NEW.unit_cost IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.variant_id IS NOT NULL THEN
    SELECT pv.cost_price, pv.product_id INTO v_size_cost, v_product
      FROM public.product_variants pv
     WHERE pv.id = NEW.variant_id;
    v_product := COALESCE(v_product, NEW.product_id);
  END IF;

  IF COALESCE(v_size_cost, 0) > 0 THEN
    NEW.unit_cost := v_size_cost;
    RETURN NEW;
  END IF;

  IF v_product IS NOT NULL THEN
    SELECT pc.cost_price INTO v_product_cost
      FROM public.product_costs pc
     WHERE pc.product_id = v_product;
    SELECT (p.item_kind = 'service' OR COALESCE(p.is_package, false)) INTO v_is_service
      FROM public.products p
     WHERE p.id = v_product;
  END IF;

  IF COALESCE(v_product_cost, 0) > 0 THEN
    NEW.unit_cost := v_product_cost;
  ELSIF COALESCE(v_is_service, false) THEN
    NEW.unit_cost := 0;
  END IF;
  -- Otherwise the cost is unknown and stays empty.
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.snapshot_order_item_unit_cost() FROM PUBLIC, anon, authenticated;
