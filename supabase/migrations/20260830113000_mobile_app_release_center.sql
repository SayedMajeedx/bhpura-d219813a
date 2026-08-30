CREATE TABLE IF NOT EXISTS public.mobile_app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key text NOT NULL CHECK (app_key IN ('boutq_os','pura_line')),
  platform text NOT NULL CHECK (platform IN ('android','ios')),
  version_name text NOT NULL,
  build_number integer NOT NULL CHECK (build_number > 0),
  artifact_url text NOT NULL CHECK (artifact_url ~ '^https://'),
  object_key text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  install_method text NOT NULL CHECK (install_method IN ('direct','altstore')),
  is_active boolean NOT NULL DEFAULT true,
  release_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_key, platform, build_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_app_one_active_release_idx
  ON public.mobile_app_releases(app_key, platform)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS mobile_app_releases_history_idx
  ON public.mobile_app_releases(app_key, platform, created_at DESC);

ALTER TABLE public.mobile_app_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mobile_app_releases FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mobile_app_releases TO service_role;
GRANT SELECT ON public.mobile_app_releases TO authenticated;

CREATE POLICY "authenticated users read mobile releases"
  ON public.mobile_app_releases FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE VIEW public.mobile_app_releases_public WITH (security_invoker=true) AS
SELECT id, app_key, platform, version_name, build_number, artifact_url, sha256,
       size_bytes, install_method, release_notes, created_at
FROM public.mobile_app_releases
WHERE is_active;
GRANT SELECT ON public.mobile_app_releases_public TO authenticated;

