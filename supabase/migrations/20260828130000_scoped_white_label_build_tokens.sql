ALTER TABLE public.white_label_app_builds ADD COLUMN IF NOT EXISTS build_token_hash text;
ALTER TABLE public.white_label_app_builds ADD COLUMN IF NOT EXISTS build_token_expires_at timestamptz;
REVOKE SELECT(build_token_hash,build_token_expires_at) ON public.white_label_app_builds FROM authenticated;
