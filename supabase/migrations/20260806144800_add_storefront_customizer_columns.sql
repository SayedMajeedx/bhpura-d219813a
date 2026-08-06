-- Migration: Add storefront customizer columns to business_settings table
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS storefront_radius text DEFAULT '1rem',
  ADD COLUMN IF NOT EXISTS header_glass boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS badge_accent text DEFAULT 'maroon',
  ADD COLUMN IF NOT EXISTS storefront_loader_text_en text,
  ADD COLUMN IF NOT EXISTS storefront_loader_text_ar text;
