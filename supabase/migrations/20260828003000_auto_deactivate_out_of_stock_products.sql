-- Auto-deactivate products when all variants are out of stock (stock_main + stock_incubator <= 0)
-- and reactivate them when stock is replenished.

CREATE OR REPLACE FUNCTION public.sync_product_active_on_variant_stock()
RETURNS trigger AS $$
DECLARE
  v_product_id uuid;
  v_total_stock numeric;
  v_variant_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_product_id := OLD.product_id;
  ELSE
    v_product_id := NEW.product_id;
  END IF;

  IF v_product_id IS NOT NULL THEN
    -- Check how many variants exist and the total stock across all variants
    SELECT 
      COUNT(*),
      COALESCE(SUM(COALESCE(stock_main, 0) + COALESCE(stock_incubator, 0)), 0)
    INTO 
      v_variant_count,
      v_total_stock
    FROM public.product_variants
    WHERE product_id = v_product_id;

    -- Only auto-deactivate if product has variants and total stock across all is 0 or less
    IF v_variant_count > 0 AND v_total_stock <= 0 THEN
      UPDATE public.products
      SET is_active = false
      WHERE id = v_product_id AND is_active = true;
    ELSIF v_variant_count > 0 AND v_total_stock > 0 THEN
      UPDATE public.products
      SET is_active = true
      WHERE id = v_product_id AND is_active = false;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_product_active_on_variant_stock ON public.product_variants;

CREATE TRIGGER trg_sync_product_active_on_variant_stock
AFTER INSERT OR UPDATE OF stock_main, stock_incubator OR DELETE ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_active_on_variant_stock();

-- Initial sync: Deactivate active products where all variants have 0 stock
UPDATE public.products p
SET is_active = false
WHERE p.is_active = true
  AND EXISTS (
    SELECT 1 FROM public.product_variants pv WHERE pv.product_id = p.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.product_variants pv
    WHERE pv.product_id = p.id
      AND (COALESCE(pv.stock_main, 0) + COALESCE(pv.stock_incubator, 0)) > 0
  );
