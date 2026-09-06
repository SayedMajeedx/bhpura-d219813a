ALTER TABLE public.brands
  DROP CONSTRAINT IF EXISTS brands_renewal_intent_check;

ALTER TABLE public.brands
  ADD CONSTRAINT brands_renewal_intent_check
  CHECK (renewal_intent IS NULL OR renewal_intent IN ('renew', 'cancel', 'upgrade', 'downgrade'));

COMMENT ON COLUMN public.brands.renewal_intent IS
  'Merchant subscription intent: renew, cancel, upgrade, or downgrade.';

NOTIFY pgrst, 'reload schema';