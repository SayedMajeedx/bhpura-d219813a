-- Migration: Automated Packaging Material Stock Deduction Trigger
-- Created At: 2026-08-16
-- Description: Automatically deducts physical stock of packaging materials (Big Bag, Card, Plastic Bag, etc.)
--              when an order status transitions to 'completed', 'delivered', 'fulfilled', or 'shipped'.

CREATE OR REPLACE FUNCTION public.trg_orders_deduct_packaging_materials()
RETURNS trigger AS $$
DECLARE
  v_item RECORD;
  v_bom RECORD;
  v_needed_qty numeric;
  v_is_now_fulfilled boolean;
  v_was_fulfilled boolean;
BEGIN
  v_is_now_fulfilled := lower(COALESCE(NEW.fulfillment_status, NEW.status, '')) IN ('completed', 'delivered', 'fulfilled', 'shipped');
  v_was_fulfilled := lower(COALESCE(OLD.fulfillment_status, OLD.status, '')) IN ('completed', 'delivered', 'fulfilled', 'shipped');

  -- Trigger deduction ONLY when order transitions FROM unfulfilled TO fulfilled
  IF v_is_now_fulfilled AND NOT v_was_fulfilled THEN
    FOR v_item IN
      SELECT product_id, quantity FROM public.order_items WHERE order_id = NEW.id AND brand_id = NEW.brand_id
    LOOP
      FOR v_bom IN
        SELECT packaging_material_id, quantity_per_unit
        FROM public.product_bom_items
        WHERE product_id = v_item.product_id AND brand_id = NEW.brand_id
      LOOP
        v_needed_qty := COALESCE(v_bom.quantity_per_unit, 1) * COALESCE(v_item.quantity, 1);
        UPDATE public.packaging_materials
        SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_needed_qty)
        WHERE id = v_bom.packaging_material_id AND brand_id = NEW.brand_id;
      END LOOP;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_orders_deduct_packaging_materials ON public.orders;

CREATE TRIGGER trg_orders_deduct_packaging_materials
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_deduct_packaging_materials();
