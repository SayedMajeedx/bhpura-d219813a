ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS renewal_intent text,
  ADD COLUMN IF NOT EXISTS renewal_intent_recorded_at timestamptz;

ALTER TABLE public.brands
  DROP CONSTRAINT IF EXISTS brands_renewal_intent_check;

ALTER TABLE public.brands
  ADD CONSTRAINT brands_renewal_intent_check
  CHECK (renewal_intent IS NULL OR renewal_intent IN ('renew', 'cancel'));

COMMENT ON COLUMN public.brands.renewal_intent IS
  'Merchant decision during the final 30 days: renew or cancel at term end.';

NOTIFY pgrst, 'reload schema';
