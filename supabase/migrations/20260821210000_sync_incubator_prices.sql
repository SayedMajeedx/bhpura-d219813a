-- Synchronize consignment prices with the latest inventory prices when requested.
CREATE OR REPLACE FUNCTION public.sync_incubator_inventory_prices(p_incubator_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_updated integer;
BEGIN
  IF p_incubator_id IS NOT NULL THEN
    SELECT brand_id INTO v_brand_id FROM public.incubators WHERE id = p_incubator_id;
    IF v_brand_id IS NULL
       OR NOT public.can_access_brand(v_brand_id)
       OR NOT public.has_permission('manage_inventory') THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;
  END IF;

  UPDATE public.incubator_inventory ii
  SET consignment_price = pv.selling_price
  FROM public.product_variants pv
  WHERE pv.id = ii.variant_id
    AND (p_incubator_id IS NULL OR ii.incubator_id = p_incubator_id)
    AND public.can_access_brand(ii.brand_id)
    AND public.has_permission('manage_inventory')
    AND ii.consignment_price IS DISTINCT FROM pv.selling_price;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_incubator_inventory_prices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_incubator_inventory_prices(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
