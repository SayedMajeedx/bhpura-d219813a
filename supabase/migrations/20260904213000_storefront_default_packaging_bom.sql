-- Every direct/storefront product must inherit the brand packaging BOM.  The
-- existing "apply to all products" action produces one shared template; this
-- migration repairs products that pre-date it and keeps future products in sync.

CREATE OR REPLACE FUNCTION public.copy_brand_packaging_bom_to_product(
  p_brand_id uuid,
  p_product_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_template_product_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.product_bom_items
    WHERE brand_id = p_brand_id AND product_id = p_product_id
  ) THEN
    RETURN;
  END IF;

  -- Prefer the most complete, most recently configured product as the brand
  -- template.  This matches the inventory screen's "apply to all" workflow.
  SELECT pbi.product_id INTO v_template_product_id
  FROM public.product_bom_items pbi
  WHERE pbi.brand_id = p_brand_id AND pbi.product_id <> p_product_id
  GROUP BY pbi.product_id
  ORDER BY count(*) DESC, max(pbi.created_at) DESC
  LIMIT 1;

  IF v_template_product_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.products target
  SET direct_packaging_cost = source.direct_packaging_cost
  FROM public.products source
  WHERE target.id = p_product_id
    AND target.brand_id = p_brand_id
    AND source.id = v_template_product_id;

  INSERT INTO public.product_bom_items (
    brand_id, product_id, packaging_material_id, quantity_per_unit
  )
  SELECT p_brand_id, p_product_id, packaging_material_id, quantity_per_unit
  FROM public.product_bom_items
  WHERE brand_id = p_brand_id AND product_id = v_template_product_id
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.inherit_brand_packaging_bom_on_product_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.copy_brand_packaging_bom_to_product(NEW.brand_id, NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inherit_brand_packaging_bom_trigger ON public.products;
CREATE TRIGGER inherit_brand_packaging_bom_trigger
AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.inherit_brand_packaging_bom_on_product_insert();

-- Repair active products with no BOM using the brand's established template.
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

REVOKE ALL ON FUNCTION public.copy_brand_packaging_bom_to_product(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inherit_brand_packaging_bom_on_product_insert() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
