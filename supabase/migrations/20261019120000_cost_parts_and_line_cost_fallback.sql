-- ==============================================================================
-- A product's cost in parts, and an order line that knows its product's cost.
--
-- 47 of a store's 56 made-to-order products had no cost, so every sale of one counted its whole
-- price as profit. Two things kept it so:
--
--   1. The cost of a piece made to order is thought of in parts (the fabric, the tailoring, the
--      extras), and the product held one number. `product_costs.cost_parts` keeps the parts
--      ([{ "label": text, "amount": number }], up to 12), and the cost is their sum, written by
--      the database (`product_costs_parts`). When the cost is later set as one number
--      (a supplier order received, the cost field, the missing-costs sheet) and no longer matches
--      the parts, the parts are dropped: the number is the truth.
--
--   2. An order line's cost was copied from its size alone (`snapshot_order_item_unit_cost`): a
--      size with no cost of its own gave the line no cost, even when its product had one. The
--      stock totals and the inventory read a size with no cost as costing what its product costs;
--      an order line now reads it the same way. A line with no size takes its product's cost.
--      Lines already written keep the cost they were given: a past order is not repriced.
--
--   3. Saving a product copied its cost onto every size, wiping a size's own cost (section 3).
--
-- `product_costs` is read and written only by staff who see the store's finances
-- (`can_view_brand_costs`); the parts sit in it and follow the same rule.
-- ==============================================================================

ALTER TABLE public.product_costs
  ADD COLUMN IF NOT EXISTS cost_parts jsonb;

CREATE OR REPLACE FUNCTION public.product_costs_parts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_part jsonb;
  v_sum numeric := 0;
  v_parts_changed boolean :=
    TG_OP = 'INSERT' OR NEW.cost_parts IS DISTINCT FROM OLD.cost_parts;
BEGIN
  -- No parts, or an empty list: the cost is one number.
  IF NEW.cost_parts IS NOT NULL
     AND jsonb_typeof(NEW.cost_parts) = 'array'
     AND jsonb_array_length(NEW.cost_parts) = 0 THEN
    NEW.cost_parts := NULL;
  END IF;

  IF NEW.cost_parts IS NOT NULL AND v_parts_changed THEN
    IF jsonb_typeof(NEW.cost_parts) <> 'array' OR jsonb_array_length(NEW.cost_parts) > 12 THEN
      RAISE EXCEPTION 'INVALID_COST_PARTS';
    END IF;
    FOR v_part IN SELECT value FROM jsonb_array_elements(NEW.cost_parts) LOOP
      IF jsonb_typeof(v_part) <> 'object'
         OR jsonb_typeof(v_part -> 'label') <> 'string'
         OR length(trim(v_part ->> 'label')) = 0
         OR length(v_part ->> 'label') > 60
         OR jsonb_typeof(v_part -> 'amount') <> 'number'
         OR (v_part ->> 'amount')::numeric < 0
         OR (v_part ->> 'amount')::numeric > 1000000 THEN
        RAISE EXCEPTION 'INVALID_COST_PARTS';
      END IF;
      v_sum := v_sum + (v_part ->> 'amount')::numeric;
    END LOOP;
    NEW.cost_price := round(v_sum, 3);
  ELSIF NEW.cost_parts IS NOT NULL
        AND TG_OP = 'UPDATE'
        AND NEW.cost_price IS DISTINCT FROM OLD.cost_price THEN
    -- The cost was set as one number elsewhere: parts that no longer add up to it are dropped.
    SELECT COALESCE(sum((value ->> 'amount')::numeric), 0) INTO v_sum
      FROM jsonb_array_elements(NEW.cost_parts);
    IF round(v_sum, 3) IS DISTINCT FROM round(NEW.cost_price, 3) THEN
      NEW.cost_parts := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.product_costs_parts() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_product_costs_parts ON public.product_costs;
CREATE TRIGGER trg_product_costs_parts
  BEFORE INSERT OR UPDATE ON public.product_costs
  FOR EACH ROW EXECUTE FUNCTION public.product_costs_parts();

-- An order line's cost when it is written: its size's own cost, else its product's, else none.
-- A cost the line was given (`unit_cost` set by the writer) is kept.
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
  END IF;

  IF COALESCE(v_product_cost, 0) > 0 THEN
    NEW.unit_cost := v_product_cost;
  ELSIF NEW.variant_id IS NOT NULL THEN
    -- As before: a size with no cost and a product with none give the line its size's (zero).
    NEW.unit_cost := v_size_cost;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.snapshot_order_item_unit_cost() FROM PUBLIC, anon, authenticated;

-- 3. A product's sizes follow its cost, unless a size has a cost of its own -------------------
-- Saving a product used to copy its cost onto every one of its sizes (the editor's
-- `syncVariantsWithProduct`), so a size's own cost (set when a supplier order was received, or
-- typed on the size) was lost the next time anyone saved the product, even its description; a
-- product with no cost wiped its sizes' costs to nothing. Now the database moves a size with the
-- product only when it was following it: its cost was the product's old cost, or none.
CREATE OR REPLACE FUNCTION public.product_costs_sizes_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sync text := current_setting('app.cost_sync', true);
BEGIN
  IF NEW.cost_price IS NOT DISTINCT FROM OLD.cost_price THEN
    RETURN NULL;
  END IF;
  -- Both copies of a size's cost move together: the cost table and the column an order line
  -- reads (the two-way sync is held off meanwhile, then put back as it was).
  PERFORM set_config('app.cost_sync', '1', true);
  UPDATE public.variant_costs vc
     SET cost_price = NEW.cost_price, updated_at = now()
    FROM public.product_variants v
   WHERE v.id = vc.variant_id
     AND v.product_id = NEW.product_id
     AND v.brand_id = NEW.brand_id
     AND (vc.cost_price = OLD.cost_price OR vc.cost_price = 0);
  UPDATE public.product_variants v
     SET cost_price = NEW.cost_price
   WHERE v.product_id = NEW.product_id
     AND v.brand_id = NEW.brand_id
     AND (COALESCE(v.cost_price, 0) = OLD.cost_price OR COALESCE(v.cost_price, 0) = 0);
  PERFORM set_config('app.cost_sync', COALESCE(v_sync, '0'), true);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.product_costs_sizes_follow() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_product_costs_sizes_follow ON public.product_costs;
CREATE TRIGGER trg_product_costs_sizes_follow
  AFTER UPDATE ON public.product_costs
  FOR EACH ROW EXECUTE FUNCTION public.product_costs_sizes_follow();
