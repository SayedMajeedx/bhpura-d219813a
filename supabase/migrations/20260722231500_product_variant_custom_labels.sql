ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant_label_size text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS variant_label_color text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS variant_label_fabric text DEFAULT NULL;

-- Refresh select grants for public access on products
GRANT SELECT (variant_label_size, variant_label_color, variant_label_fabric) ON public.products TO anon, authenticated;
