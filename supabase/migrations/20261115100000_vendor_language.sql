-- The language a supplier reads (the owner's report of 2026-11-03): a tailor's job sheet and the
-- WhatsApp message written for them print in it by default, in Arabic, English or both side by
-- side. Nothing chosen (null) means the screen's language, as before. No function changes: the
-- vendors table's own policy (finance staff of the store) already lets staff read and set it.

ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS preferred_language text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vendors_preferred_language_check'
      AND conrelid = 'public.vendors'::regclass
  ) THEN
    ALTER TABLE public.vendors ADD CONSTRAINT vendors_preferred_language_check
      CHECK (preferred_language IS NULL OR preferred_language IN ('ar', 'en', 'both'));
  END IF;
END $$;

COMMENT ON COLUMN public.vendors.preferred_language IS
  'The language this supplier''s job sheets and messages default to: ar, en or both; null = the screen''s.';
