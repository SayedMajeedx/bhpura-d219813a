CREATE TABLE IF NOT EXISTS public.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL,
  batch_index integer NOT NULL DEFAULT 0 CHECK (batch_index >= 0),
  source text NOT NULL CHECK (source IN ('shopify','salla','zid','woocommerce','custom','instagram')),
  entity_type text NOT NULL DEFAULT 'products' CHECK (entity_type IN ('products','customers','orders')),
  status text NOT NULL CHECK (status IN ('processing','completed','partial','failed')),
  total_count integer NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  success_count integer NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, session_id, batch_index)
);

CREATE INDEX IF NOT EXISTS import_runs_brand_created_idx
  ON public.import_runs (brand_id, created_at DESC);

ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_runs TO authenticated;
GRANT ALL ON public.import_runs TO service_role;

DROP POLICY IF EXISTS "brand members read import runs" ON public.import_runs;
CREATE POLICY "brand members read import runs" ON public.import_runs
FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

