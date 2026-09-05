-- Reconstructed migration for remote schema version 20260831201047
-- Delivery estimate configuration in business settings

ALTER TABLE public.business_settings
ADD COLUMN IF NOT EXISTS delivery_estimate_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS delivery_estimate_ar text DEFAULT 'التوصيل المتوقع خلال 24 - 48 ساعة داخل البحرين',
ADD COLUMN IF NOT EXISTS delivery_estimate_en text DEFAULT 'Estimated delivery within 24 - 48 hours';
