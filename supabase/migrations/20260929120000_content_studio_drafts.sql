-- Migration: 20260929120000_content_studio_drafts.sql
--
-- Saved drafts for the content studio: a brand's team can save a design
-- (the template, format, product and the studio's choices) and reopen it
-- later. Additive only: one new table, visible to the brand's own staff
-- through can_access_brand, like message templates and the other
-- per-brand tables.

CREATE TABLE public.content_studio_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  template_id text NOT NULL CHECK (char_length(template_id) BETWEEN 1 AND 40),
  format text NOT NULL CHECK (format IN ('story', 'portrait', 'square')),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  -- The studio's choices (copy, look, logo, picks); small by construction.
  settings jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(settings) = 'object' AND pg_column_size(settings) <= 32768),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX content_studio_drafts_brand_updated_idx
  ON public.content_studio_drafts (brand_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_studio_drafts TO authenticated;
GRANT ALL ON public.content_studio_drafts TO service_role;

ALTER TABLE public.content_studio_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand access" ON public.content_studio_drafts
  FOR ALL
  USING (public.can_access_brand(brand_id))
  WITH CHECK (public.can_access_brand(brand_id));

CREATE TRIGGER content_studio_drafts_updated_at
  BEFORE UPDATE ON public.content_studio_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
