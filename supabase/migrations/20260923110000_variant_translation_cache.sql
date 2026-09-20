-- Migration: 20260923110000_variant_translation_cache.sql
-- Description: Create persistent high-speed translation cache for autonomous variant and option translation

CREATE TABLE IF NOT EXISTS public.translation_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_lang text NOT NULL,
  target_lang text NOT NULL,
  source_text text NOT NULL,
  translated_text text NOT NULL,
  context text NOT NULL DEFAULT 'variant_option',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_translation_cache UNIQUE (source_lang, target_lang, source_text, context)
);

CREATE INDEX IF NOT EXISTS idx_translation_cache_lookup 
  ON public.translation_cache (source_lang, target_lang, source_text);

ALTER TABLE public.translation_cache ENABLE ROW LEVEL SECURITY;

-- Allow public read so storefront visitors can retrieve translations instantly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'translation_cache' AND policyname = 'Public read for translation cache'
  ) THEN
    CREATE POLICY "Public read for translation cache"
      ON public.translation_cache
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Allow authenticated users and service role to insert or update translations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'translation_cache' AND policyname = 'Authenticated users can insert translation cache'
  ) THEN
    CREATE POLICY "Authenticated users can insert translation cache"
      ON public.translation_cache
      FOR INSERT
      TO authenticated, service_role
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'translation_cache' AND policyname = 'Authenticated users can update translation cache'
  ) THEN
    CREATE POLICY "Authenticated users can update translation cache"
      ON public.translation_cache
      FOR UPDATE
      TO authenticated, service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
