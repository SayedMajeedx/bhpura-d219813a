-- Support transferring / assigning unallocated incubator stock as well as main stock to an incubator
CREATE OR REPLACE FUNCTION public.transfer_stock_to_incubator(
  p_incubator_id uuid, p_variant_id uuid, p_quantity integer,
  p_external_code text DEFAULT NULL, p_price numeric DEFAULT NULL,
  p_commission_type text DEFAULT NULL, p_commission_value numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_brand uuid;
  v_variant_brand uuid;
  v_inventory_id uuid;
  v_inc public.incubators%ROWTYPE;
  v_stock_main integer;
  v_stock_incubator integer;
  v_allocated_incubator integer;
  v_unallocated_incubator integer;
  v_needed_from_main integer;
BEGIN
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  SELECT * INTO v_inc FROM public.incubators WHERE id = p_incubator_id AND is_active FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_brand(v_inc.brand_id) OR NOT public.has_permission('manage_inventory') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT p.brand_id, v.stock_main, v.stock_incubator
  INTO v_variant_brand, v_stock_main, v_stock_incubator
  FROM public.product_variants v
  JOIN public.products p ON p.id = v.product_id
  WHERE v.id = p_variant_id FOR UPDATE;

  IF v_variant_brand IS DISTINCT FROM v_inc.brand_id THEN
    RAISE EXCEPTION 'CROSS_BRAND_INCUBATOR_REFERENCE';
  END IF;

  -- Calculate total currently allocated to any incubator for this variant
  SELECT COALESCE(SUM(quantity), 0) INTO v_allocated_incubator
  FROM public.incubator_inventory
  WHERE variant_id = p_variant_id;

  -- Unallocated incubator stock that already exists on the variant
  v_unallocated_incubator := GREATEST(0, COALESCE(v_stock_incubator, 0) - v_allocated_incubator);

  IF v_unallocated_incubator >= p_quantity THEN
    -- Quantity is already in stock_incubator, no need to touch stock_main
    v_needed_from_main := 0;
  ELSE
    v_needed_from_main := p_quantity - v_unallocated_incubator;
  END IF;

  IF v_needed_from_main > 0 THEN
    IF COALESCE(v_stock_main, 0) < v_needed_from_main THEN
      RAISE EXCEPTION 'INSUFFICIENT_MAIN_STOCK';
    END IF;

    UPDATE public.product_variants
    SET stock_main = stock_main - v_needed_from_main,
        stock_incubator = stock_incubator + v_needed_from_main
    WHERE id = p_variant_id;
  END IF;

  INSERT INTO public.incubator_inventory
    (brand_id, incubator_id, variant_id, external_code, quantity, consignment_price, commission_type, commission_value)
  VALUES (v_inc.brand_id, p_incubator_id, p_variant_id, nullif(trim(p_external_code), ''), p_quantity,
    COALESCE(p_price, 0), COALESCE(p_commission_type, v_inc.commission_type),
    COALESCE(p_commission_value, v_inc.commission_value))
  ON CONFLICT (incubator_id, variant_id) DO UPDATE SET
    quantity = incubator_inventory.quantity + EXCLUDED.quantity,
    external_code = COALESCE(EXCLUDED.external_code, incubator_inventory.external_code),
    consignment_price = CASE WHEN EXCLUDED.consignment_price > 0 THEN EXCLUDED.consignment_price ELSE incubator_inventory.consignment_price END,
    commission_type = EXCLUDED.commission_type,
    commission_value = EXCLUDED.commission_value
  RETURNING id INTO v_inventory_id;

  INSERT INTO public.incubator_movements(brand_id, incubator_id, variant_id, movement_type, quantity_delta, notes)
  VALUES (v_inc.brand_id, p_incubator_id, p_variant_id, 'transfer_in', p_quantity, p_notes);

  RETURN v_inventory_id;
END; $$;
