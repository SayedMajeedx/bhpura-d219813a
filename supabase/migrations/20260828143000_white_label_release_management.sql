ALTER TABLE public.white_label_app_builds
  ADD COLUMN IF NOT EXISTS apk_object_key text,
  ADD COLUMN IF NOT EXISTS apk_size_bytes bigint CHECK (apk_size_bytes IS NULL OR apk_size_bytes > 0),
  ADD COLUMN IF NOT EXISTS release_notes text,
  ADD COLUMN IF NOT EXISTS validation_results jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS white_label_one_active_build_per_app_idx
  ON public.white_label_app_builds(app_id)
  WHERE status IN ('queued','building');

CREATE INDEX IF NOT EXISTS white_label_builds_brand_created_idx
  ON public.white_label_app_builds(brand_id,created_at DESC);

CREATE OR REPLACE VIEW public.white_label_apps_public WITH (security_invoker=true) AS
SELECT id,brand_id,app_name,android_package,storefront_url,icon_url,splash_logo_url,
       primary_color,background_color,status,version_name,version_code,latest_apk_url,
       latest_build_id,provisioned_at,created_at,updated_at
FROM public.white_label_apps;
GRANT SELECT ON public.white_label_apps_public TO authenticated;

CREATE OR REPLACE VIEW public.white_label_app_builds_public WITH (security_invoker=true) AS
SELECT id,app_id,brand_id,version_name,version_code,status,provider,provider_run_id,
       provider_run_url,apk_url,apk_sha256,apk_size_bytes,error_message,release_notes,
       validation_results,started_at,completed_at,created_at
FROM public.white_label_app_builds;
GRANT SELECT ON public.white_label_app_builds_public TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_white_label_build(p_build_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_build public.white_label_app_builds%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=auth.uid() AND p.status='active' AND p.role='super_admin'
  ) THEN RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED'; END IF;
  SELECT * INTO v_build FROM public.white_label_app_builds
  WHERE id=p_build_id AND status='succeeded' AND apk_url IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUILD_NOT_AVAILABLE'; END IF;
  UPDATE public.white_label_apps
  SET latest_build_id=v_build.id, latest_apk_url=v_build.apk_url, status='ready', updated_at=now()
  WHERE id=v_build.app_id;
END $$;
REVOKE ALL ON FUNCTION public.activate_white_label_build(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_white_label_build(uuid) TO authenticated;
