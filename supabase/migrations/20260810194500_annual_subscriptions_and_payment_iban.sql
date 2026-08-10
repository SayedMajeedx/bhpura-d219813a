-- Annual subscription lifecycle. Pura remains the platform owner's permanent project.
ALTER TABLE public.brands
  ALTER COLUMN plan_type SET DEFAULT 'annual';

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS subscription_iban text NOT NULL DEFAULT 'BH12KHCB0000001234567890';

UPDATE public.brands
SET
  plan_type = 'lifetime',
  subscription_status = 'active',
  subscription_expires_at = NULL,
  updated_at = now()
WHERE lower(slug) = 'pura';

UPDATE public.brands
SET
  plan_type = 'annual',
  subscription_status = COALESCE(subscription_status, 'active'),
  subscription_expires_at = COALESCE(subscription_expires_at, created_at + interval '1 year'),
  updated_at = now()
WHERE lower(slug) <> 'pura'
  AND plan_type IS DISTINCT FROM 'trial';

-- Never advertise an elapsed annual term as active. Pending receipts retain
-- their review state so a super admin can still approve or reject them.
UPDATE public.brands
SET
  subscription_status = 'suspended',
  updated_at = now()
WHERE lower(slug) <> 'pura'
  AND plan_type = 'annual'
  AND subscription_status = 'active'
  AND subscription_expires_at <= now();

COMMENT ON COLUMN public.brands.plan_type IS
  'annual for normal tenants, trial for evaluation, lifetime only for the owner project';

NOTIFY pgrst, 'reload schema';
