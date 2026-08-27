-- White-label mobile app factory. Secrets remain in Edge Function / CI secret stores.
CREATE TABLE IF NOT EXISTS public.white_label_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL UNIQUE REFERENCES public.brands(id) ON DELETE CASCADE,
  app_name text NOT NULL,
  android_package text NOT NULL UNIQUE CHECK (android_package ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  storefront_url text NOT NULL CHECK (storefront_url ~ '^https://'),
  icon_url text,
  splash_logo_url text,
  primary_color text NOT NULL DEFAULT '#330A0A',
  background_color text NOT NULL DEFAULT '#FFF9F7',
  firebase_project_id text,
  firebase_android_app_id text,
  firebase_config jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','provisioning','ready_for_build','building','ready','failed','disabled')),
  version_name text NOT NULL DEFAULT '1.0.0',
  version_code integer NOT NULL DEFAULT 1 CHECK (version_code > 0),
  latest_apk_url text,
  latest_build_id uuid,
  last_error text,
  provisioned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.white_label_app_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.white_label_apps(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  version_name text NOT NULL,
  version_code integer NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','building','succeeded','failed','cancelled')),
  provider text NOT NULL DEFAULT 'github_actions',
  provider_run_id text,
  provider_run_url text,
  apk_url text,
  apk_sha256 text,
  error_message text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS white_label_app_builds_app_idx ON public.white_label_app_builds(app_id,created_at DESC);

ALTER TABLE public.white_label_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.white_label_app_builds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.white_label_apps,public.white_label_app_builds FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.white_label_apps,public.white_label_app_builds TO service_role;
GRANT SELECT ON public.white_label_apps,public.white_label_app_builds TO authenticated;

CREATE POLICY "super admins read white label apps" ON public.white_label_apps FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active' AND p.role='super_admin'));
CREATE POLICY "brand admins read own white label app" ON public.white_label_apps FOR SELECT TO authenticated
USING (public.can_access_brand(brand_id));
CREATE POLICY "super admins read white label builds" ON public.white_label_app_builds FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active' AND p.role='super_admin'));
CREATE POLICY "brand admins read own white label builds" ON public.white_label_app_builds FOR SELECT TO authenticated
USING (public.can_access_brand(brand_id));

-- Public client-safe view deliberately excludes firebase_config and internal errors.
CREATE OR REPLACE VIEW public.white_label_apps_public WITH (security_invoker=true) AS
SELECT id,brand_id,app_name,android_package,storefront_url,icon_url,splash_logo_url,
       primary_color,background_color,status,version_name,version_code,latest_apk_url,
       latest_build_id,provisioned_at,created_at,updated_at
FROM public.white_label_apps;
GRANT SELECT ON public.white_label_apps_public TO authenticated;

CREATE OR REPLACE FUNCTION public.request_white_label_rebuild(p_brand_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_app public.white_label_apps%ROWTYPE; v_build_id uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.status='active' AND p.role='super_admin') THEN
    RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED';
  END IF;
  SELECT * INTO v_app FROM public.white_label_apps WHERE brand_id=p_brand_id;
  IF NOT FOUND OR v_app.firebase_android_app_id IS NULL THEN RAISE EXCEPTION 'APP_NOT_PROVISIONED'; END IF;
  UPDATE public.white_label_apps SET version_code=version_code+1,status='ready_for_build',last_error=NULL,updated_at=now() WHERE id=v_app.id RETURNING version_code INTO v_app.version_code;
  INSERT INTO public.white_label_app_builds(app_id,brand_id,version_name,version_code,requested_by)
  VALUES(v_app.id,p_brand_id,v_app.version_name,v_app.version_code,auth.uid()) RETURNING id INTO v_build_id;
  UPDATE public.white_label_apps SET latest_build_id=v_build_id WHERE id=v_app.id;
  RETURN v_build_id;
END $$;
REVOKE ALL ON FUNCTION public.request_white_label_rebuild(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_white_label_rebuild(uuid) TO authenticated;
