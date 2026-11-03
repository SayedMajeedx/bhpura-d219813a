-- Bring an archived size back.
--
-- A size with a history is archived, never deleted (migration 20261111100000). Ordering that size
-- again from a supplier (the owner's request of 2026-11-03: a supplier order could not take a
-- size the product did not have) must not make a second size beside the archived one, with its
-- sales and stock history split between them: the archived size comes back instead, with its
-- history.
--
-- * `restore_product_variant(id)`: the size is in use again (its barcode was freed when it was
--   archived and stays free). Its product comes back too when it was archived, still hidden from
--   the store until the merchant shows it, as `restore_product` does. Staff with
--   `manage_inventory`, as for removing a size.

CREATE OR REPLACE FUNCTION public.restore_product_variant(p_variant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_variant public.product_variants%ROWTYPE;
BEGIN
  SELECT * INTO v_variant FROM public.product_variants WHERE id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VARIANT_NOT_FOUND';
  END IF;
  IF NOT public.can_access_brand(v_variant.brand_id)
     OR NOT public.has_permission('manage_inventory') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  UPDATE public.product_variants SET archived_at = NULL
   WHERE id = p_variant_id AND archived_at IS NOT NULL;
  UPDATE public.products SET archived_at = NULL
   WHERE id = v_variant.product_id AND archived_at IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_product_variant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_product_variant(uuid) TO authenticated;
