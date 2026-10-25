-- A store charges VAT only when it has a VAT number (the owner's decision, 2026-10-25).
--
-- Every store was created with a 10% rate, prices exclusive, and the order builder adds the
-- store's rate to every order (place_storefront_order, create_booking_order, the staff order
-- editor, the checkout's preview through brand_public_settings). A store that never opened the
-- tax settings therefore charged its customers 10% VAT with no VAT number: Aurora and zh did.
-- A business that is not registered for VAT may not charge it.
--
-- The rule sits on the settings row, so every reader of default_tax_rate follows it without a
-- rewrite: with no VAT number the rate is 0, whatever a form or a tenant function sends. New
-- stores start at 0. Orders already placed keep the tax they carry (reprice_order_totals reads
-- the order's own tax_rate).

CREATE OR REPLACE FUNCTION public.business_settings_vat_needs_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NULLIF(btrim(COALESCE(NEW.vat_number, '')), '') IS NULL THEN
    NEW.default_tax_rate := 0;
  ELSIF NEW.default_tax_rate IS NULL THEN
    NEW.default_tax_rate := 0;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.business_settings_vat_needs_number() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_business_settings_vat_needs_number ON public.business_settings;
CREATE TRIGGER trg_business_settings_vat_needs_number
  BEFORE INSERT OR UPDATE ON public.business_settings
  FOR EACH ROW EXECUTE FUNCTION public.business_settings_vat_needs_number();

ALTER TABLE public.business_settings ALTER COLUMN default_tax_rate SET DEFAULT 0;

-- The stores charging VAT with no VAT number stop now (the trigger sets the rate).
UPDATE public.business_settings
   SET default_tax_rate = 0
 WHERE NULLIF(btrim(COALESCE(vat_number, '')), '') IS NULL
   AND COALESCE(default_tax_rate, 0) <> 0;
