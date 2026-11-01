-- A product keeps at least one variant.
--
-- A product is sold as one of its variants: its price, its stock, the stock ledger, its cost and
-- every order line live on a variant, and the order builder refuses a line without one
-- (VARIANT_NOT_FOUND). A product with no options is sold as its default variant, a variant with
-- no option value (src/lib/default-variant.ts). Until now any member of staff could delete a
-- product's last variant: on 2026-11-01 deleting the old "قياسي" defaults left two of Pura's
-- abayas on the storefront with a buy button that checkout then refused.
--
-- Deleting the last variant of a product that is not a service is now refused with
-- PRODUCT_NEEDS_A_VARIANT. The rule looks at the product as it stands when the transaction ends
-- (a deferred constraint trigger), so:
--   * deleting the product itself still removes its variants (the product is gone by then);
--   * a variant can be replaced by another inside one transaction.
-- A service is left alone: its lengths are one set that set_service_lengths writes whole.
-- No row is changed by this migration.

CREATE OR REPLACE FUNCTION public.product_keeps_a_variant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.products p
     WHERE p.id = OLD.product_id
       AND COALESCE(p.item_kind, 'product') <> 'service'
       AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id)
  ) THEN
    RAISE EXCEPTION 'PRODUCT_NEEDS_A_VARIANT';
  END IF;
  RETURN NULL;
END;
$$;

-- A trigger function: nobody calls it by hand.
REVOKE ALL ON FUNCTION public.product_keeps_a_variant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_product_variants_keep_one ON public.product_variants;
CREATE CONSTRAINT TRIGGER trg_product_variants_keep_one
  AFTER DELETE ON public.product_variants
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.product_keeps_a_variant();
