-- Migration: 20260922140000_invoice_customization_enhancements.sql
-- Description: Add invoice customization columns for brand name visibility, customizable terms & conditions per brand

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS invoice_show_business_name BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_show_terms BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_terms_ar TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS invoice_terms_en TEXT DEFAULT NULL;

COMMENT ON COLUMN public.business_settings.invoice_show_business_name IS 'Whether to show the business name as text below the logo on invoices';
COMMENT ON COLUMN public.business_settings.invoice_show_terms IS 'Whether to display the Terms & Conditions section on invoices';
COMMENT ON COLUMN public.business_settings.invoice_terms_ar IS 'Custom Arabic terms & conditions for the invoice';
COMMENT ON COLUMN public.business_settings.invoice_terms_en IS 'Custom English terms & conditions for the invoice';
