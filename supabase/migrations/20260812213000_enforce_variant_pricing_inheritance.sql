-- Enforce product-level pricing defaults for every variant creation path.
CREATE OR REPLACE FUNCTION public.inherit_product_variant_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_price numeric(14,3);
  v_cost_price numeric(14,3);
BEGIN
  SELECT COALESCE(p.base_price, 0), COALESCE(p.cost_price, 0)
  INTO v_base_price, v_cost_price
  FROM public.products p
  WHERE p.id = NEW.product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  -- Product is the single source of truth for inventory cost.
  NEW.cost_price := v_cost_price;

  -- Blank/zero variant price means inherit the regular product price.
  IF NEW.selling_price IS NULL OR NEW.selling_price <= 0 THEN
    NEW.selling_price := v_base_price;
  END IF;

  -- A lower final price is a sale; otherwise there is no strike-through price.
  IF NEW.selling_price < v_base_price THEN
    NEW.original_price := v_base_price;
  ELSE
    NEW.original_price := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inherit_product_variant_pricing_trigger ON public.product_variants;
CREATE TRIGGER inherit_product_variant_pricing_trigger
BEFORE INSERT ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.inherit_product_variant_pricing();
