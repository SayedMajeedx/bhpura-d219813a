-- Migration: Fix auto deactivate on out-of-stock to preserve manual merchant product deactivations
-- Only auto-reactivate if the product was automatically deactivated by the system due to zero stock.

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS auto_deactivated_out_of_stock boolean DEFAULT false;

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
      SET is_active = false,
          auto_deactivated_out_of_stock = true
      WHERE id = v_product_id AND is_active = true;
    ELSIF v_variant_count > 0 AND v_total_stock > 0 THEN
      -- Only reactivate if it was auto-deactivated by zero stock, NOT if the merchant manually hid it!
      UPDATE public.products
      SET is_active = true,
          auto_deactivated_out_of_stock = false
      WHERE id = v_product_id AND is_active = false AND auto_deactivated_out_of_stock = true;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
