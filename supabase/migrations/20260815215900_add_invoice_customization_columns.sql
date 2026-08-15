-- Add 7 invoice customization columns to business_settings
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS invoice_arabic_font_family text DEFAULT 'Cairo',
  ADD COLUMN IF NOT EXISTS invoice_status_paid_color text DEFAULT '#16a34a',
  ADD COLUMN IF NOT EXISTS invoice_status_unpaid_color text DEFAULT '#dc2626',
  ADD COLUMN IF NOT EXISTS invoice_status_progress_color text DEFAULT '#d97706',
  ADD COLUMN IF NOT EXISTS invoice_table_header_bg text DEFAULT '#f8fafc',
  ADD COLUMN IF NOT EXISTS invoice_table_header_fg text DEFAULT '#0f172a',
  ADD COLUMN IF NOT EXISTS invoice_divider_color text DEFAULT '#e2e8f0';

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
