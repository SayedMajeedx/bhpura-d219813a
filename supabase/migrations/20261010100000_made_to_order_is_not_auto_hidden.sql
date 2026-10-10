-- A made-to-order piece is not hidden when its ready stock is zero.
--
-- `sync_product_active_on_variant_stock` hides a product (is_active = false) when the stock of all
-- its variants reaches zero, and shows it again when stock returns. It never looked at how the
-- product is sold: a made-to-order piece (is_made_to_order) is made when it is ordered, and a
-- service has no stock at all, yet both were hidden the moment a variant was added with no stock,
-- or a ready size sold out. On the live database the trigger had already switched off made-to-order
-- products and services this way.
--
-- This version leaves a made-to-order product and a service alone: zero ready stock neither hides
-- them nor (later) shows them. Everything else behaves as before.
--
-- One clean-up: a made-to-order product or service that is visible but still carries the
-- "hidden by the system" mark loses the mark, so a merchant who later hides it by hand is not
-- overruled. Products that are hidden now are not touched: whether to show them is the merchant's
-- decision.

CREATE OR REPLACE FUNCTION public.sync_product_active_on_variant_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product_id uuid;
  v_total_stock numeric;
  v_variant_count integer;
  v_made_to_order boolean;
  v_item_kind text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_product_id := OLD.product_id;
  ELSE
    v_product_id := NEW.product_id;
  END IF;

  IF v_product_id IS NOT NULL THEN
    SELECT p.is_made_to_order, p.item_kind
      INTO v_made_to_order, v_item_kind
      FROM public.products p
     WHERE p.id = v_product_id;

    -- Sold by making it, or a service: ready stock says nothing about whether it can be bought.
    IF COALESCE(v_made_to_order, false) OR v_item_kind = 'service' THEN
      RETURN NULL;
    END IF;

    SELECT
      COUNT(*),
      COALESCE(SUM(COALESCE(stock_main, 0) + COALESCE(stock_incubator, 0)), 0)
    INTO
      v_variant_count,
      v_total_stock
    FROM public.product_variants
    WHERE product_id = v_product_id;

    IF v_variant_count > 0 AND v_total_stock <= 0 THEN
      UPDATE public.products
      SET is_active = false,
          auto_deactivated_out_of_stock = true
      WHERE id = v_product_id AND is_active = true;
    ELSIF v_variant_count > 0 AND v_total_stock > 0 THEN
      UPDATE public.products
      SET is_active = true,
          auto_deactivated_out_of_stock = false
      WHERE id = v_product_id AND is_active = false AND auto_deactivated_out_of_stock = true;
    END IF;
  END IF;

  RETURN NULL;
END;
$function$;

UPDATE public.products
SET auto_deactivated_out_of_stock = false
WHERE auto_deactivated_out_of_stock = true
  AND is_active = true
  AND (is_made_to_order = true OR item_kind = 'service');
