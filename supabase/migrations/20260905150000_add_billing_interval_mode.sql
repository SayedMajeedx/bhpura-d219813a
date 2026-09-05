-- Add billing_interval_mode to saas_plans and system_settings ('both', 'monthly_only', 'annual_only')
ALTER TABLE public.saas_plans 
ADD COLUMN IF NOT EXISTS billing_interval_mode text NOT NULL DEFAULT 'both' 
CHECK (billing_interval_mode IN ('both', 'monthly_only', 'annual_only'));

ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS billing_interval_mode text NOT NULL DEFAULT 'both' 
CHECK (billing_interval_mode IN ('both', 'monthly_only', 'annual_only'));
