CREATE TABLE IF NOT EXISTS public.export_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL,
  preset text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('products','customers','orders','expenses','full_backup')),
  file_format text NOT NULL CHECK (file_format IN ('xlsx','csv','json')),
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  file_size_bytes bigint,
  file_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS export_runs_brand_created_idx
  ON public.export_runs (brand_id, created_at DESC);

ALTER TABLE public.export_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.export_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.export_runs TO authenticated;
GRANT ALL ON public.export_runs TO service_role;

DROP POLICY IF EXISTS "brand members read export runs" ON public.export_runs;
CREATE POLICY "brand members read export runs" ON public.export_runs
FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

DROP POLICY IF EXISTS "brand members insert export runs" ON public.export_runs;
CREATE POLICY "brand members insert export runs" ON public.export_runs
FOR INSERT TO authenticated WITH CHECK (public.can_access_brand(brand_id));
