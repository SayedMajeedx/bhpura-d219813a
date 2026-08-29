-- Internal, append-only operational signals for scheduled jobs and readiness.
CREATE TABLE IF NOT EXISTS public.system_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL CHECK (char_length(service) BETWEEN 1 AND 80),
  status text NOT NULL CHECK (status IN ('healthy', 'degraded', 'failed')),
  correlation_id text,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_health_events_service_created_idx
  ON public.system_health_events (service, created_at DESC);

ALTER TABLE public.system_health_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_health_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.system_health_events TO service_role;

DROP POLICY IF EXISTS "super admins read system health" ON public.system_health_events;
CREATE POLICY "super admins read system health"
  ON public.system_health_events FOR SELECT TO authenticated
  USING (public.is_super_admin());

GRANT SELECT ON public.system_health_events TO authenticated;

-- Keep the table bounded without placing credentials in the database.
CREATE OR REPLACE FUNCTION public.prune_system_health_events(p_retention_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_deleted integer;
BEGIN
  IF p_retention_days < 7 OR p_retention_days > 365 THEN
    RAISE EXCEPTION 'INVALID_RETENTION';
  END IF;
  DELETE FROM public.system_health_events
  WHERE created_at < now() - make_interval(days => p_retention_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_system_health_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_system_health_events(integer) TO service_role;

