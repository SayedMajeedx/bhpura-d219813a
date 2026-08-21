-- Secure editing of incubator-specific codes and commercial terms.
CREATE OR REPLACE FUNCTION public.update_incubator_inventory_item(
  p_inventory_id uuid,
  p_external_code text,
  p_consignment_price numeric,
  p_commission_type text,
  p_commission_value numeric
)
RETURNS public.incubator_inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.incubator_inventory%ROWTYPE;
BEGIN
  IF p_consignment_price < 0 OR p_commission_value < 0
     OR p_commission_type NOT IN ('percentage', 'fixed') THEN
    RAISE EXCEPTION 'INVALID_INCUBATOR_ITEM_TERMS';
  END IF;

  SELECT * INTO v_item
  FROM public.incubator_inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND
     OR NOT public.can_access_brand(v_item.brand_id)
     OR NOT public.has_permission('manage_inventory') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  UPDATE public.incubator_inventory
  SET external_code = nullif(trim(p_external_code), ''),
      consignment_price = p_consignment_price,
      commission_type = p_commission_type,
      commission_value = p_commission_value
  WHERE id = p_inventory_id
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.update_incubator_inventory_item(uuid,text,numeric,text,numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_incubator_inventory_item(uuid,text,numeric,text,numeric)
  TO authenticated;

-- Make changes visible to every open admin screen through Supabase Realtime.
DO $$
DECLARE v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY[
      'incubators', 'incubator_inventory', 'incubator_movements',
      'incubator_sales', 'incubator_payments'
    ] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
    END LOOP;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
