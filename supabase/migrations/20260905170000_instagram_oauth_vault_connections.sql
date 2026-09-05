-- Migration: 20260905170000_instagram_oauth_vault_connections.sql
-- Description: Separate table for Instagram OAuth tokens with Vault encryption at rest and lifecycle management

CREATE TABLE IF NOT EXISTS public.brand_instagram_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  instagram_user_id text,
  instagram_username text,
  token_secret_id uuid,
  token_type text DEFAULT 'bearer',
  scope text DEFAULT 'instagram_business_basic',
  expires_at timestamptz NOT NULL,
  last_refreshed_at timestamptz,
  refresh_error text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_instagram_connections_brand_id_key UNIQUE (brand_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_instagram_connections_brand ON public.brand_instagram_connections(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_instagram_connections_expiring ON public.brand_instagram_connections(expires_at) WHERE is_active = true;

ALTER TABLE public.brand_instagram_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_instagram_connections_select" ON public.brand_instagram_connections;
CREATE POLICY "brand_instagram_connections_select" ON public.brand_instagram_connections
  FOR SELECT TO authenticated
  USING (
    public.can_access_brand(brand_id) OR public.is_admin()
  );

-- 1. Function: save_instagram_token (Security Definer)
CREATE OR REPLACE FUNCTION public.save_instagram_token(
  p_brand_id uuid,
  p_user_id uuid,
  p_instagram_user_id text,
  p_instagram_username text,
  p_access_token text,
  p_expires_in integer DEFAULT 5184000,
  p_scope text DEFAULT 'instagram_business_basic'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS \$\$
DECLARE
  v_secret_id uuid;
  v_connection_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF NULLIF(btrim(p_access_token), '') IS NULL THEN
    RAISE EXCEPTION 'Access token cannot be empty';
  END IF;

  v_expires_at := now() + (COALESCE(p_expires_in, 5184000) || ' seconds')::interval;

  SELECT id, token_secret_id INTO v_connection_id, v_secret_id
  FROM public.brand_instagram_connections
  WHERE brand_id = p_brand_id;

  IF v_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_secret_id, btrim(p_access_token));
  ELSE
    SELECT vault.create_secret(
      btrim(p_access_token),
      'ig-token-' || p_brand_id::text,
      'Encrypted Instagram token for brand ' || p_brand_id::text
    ) INTO v_secret_id;
  END IF;

  INSERT INTO public.brand_instagram_connections (
    brand_id,
    user_id,
    instagram_user_id,
    instagram_username,
    token_secret_id,
    token_type,
    scope,
    expires_at,
    last_refreshed_at,
    refresh_error,
    is_active,
    updated_at
  ) VALUES (
    p_brand_id,
    p_user_id,
    NULLIF(btrim(p_instagram_user_id), ''),
    NULLIF(btrim(p_instagram_username), ''),
    v_secret_id,
    'bearer',
    COALESCE(NULLIF(btrim(p_scope), ''), 'instagram_business_basic'),
    v_expires_at,
    now(),
    NULL,
    true,
    now()
  )
  ON CONFLICT (brand_id) DO UPDATE SET
    user_id = COALESCE(EXCLUDED.user_id, public.brand_instagram_connections.user_id),
    instagram_user_id = COALESCE(EXCLUDED.instagram_user_id, public.brand_instagram_connections.instagram_user_id),
    instagram_username = COALESCE(EXCLUDED.instagram_username, public.brand_instagram_connections.instagram_username),
    token_secret_id = v_secret_id,
    scope = EXCLUDED.scope,
    expires_at = EXCLUDED.expires_at,
    last_refreshed_at = now(),
    refresh_error = NULL,
    is_active = true,
    updated_at = now()
  RETURNING id INTO v_connection_id;

  RETURN v_connection_id;
END;
\$\$;

REVOKE ALL ON FUNCTION public.save_instagram_token(uuid, uuid, text, text, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_instagram_token(uuid, uuid, text, text, text, integer, text) TO authenticated, service_role;

-- 2. Function: get_decrypted_instagram_token (Security Definer)
CREATE OR REPLACE FUNCTION public.get_decrypted_instagram_token(p_brand_id uuid)
RETURNS TABLE (
  connection_id uuid,
  brand_id uuid,
  instagram_user_id text,
  instagram_username text,
  access_token text,
  expires_at timestamptz,
  is_active boolean,
  refresh_error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS \$\$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NOT (public.can_access_brand(p_brand_id) OR public.is_admin()) THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    c.id AS connection_id,
    c.brand_id,
    c.instagram_user_id,
    c.instagram_username,
    s.decrypted_secret AS access_token,
    c.expires_at,
    c.is_active,
    c.refresh_error
  FROM public.brand_instagram_connections c
  JOIN vault.decrypted_secrets s ON s.id = c.token_secret_id
  WHERE c.brand_id = p_brand_id
    AND c.is_active = true;
END;
\$\$;

REVOKE ALL ON FUNCTION public.get_decrypted_instagram_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_decrypted_instagram_token(uuid) TO authenticated, service_role;

-- 3. Function: get_instagram_connection_status
CREATE OR REPLACE FUNCTION public.get_instagram_connection_status(p_brand_id uuid)
RETURNS TABLE (
  is_connected boolean,
  instagram_username text,
  instagram_user_id text,
  expires_at timestamptz,
  days_until_expiry integer,
  last_refreshed_at timestamptz,
  refresh_error text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS \$\$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NOT (public.can_access_brand(p_brand_id) OR public.is_admin()) THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    (c.id IS NOT NULL AND c.is_active = true AND c.expires_at > now()) AS is_connected,
    c.instagram_username,
    c.instagram_user_id,
    c.expires_at,
    GREATEST(0, EXTRACT(DAY FROM (c.expires_at - now()))::integer) AS days_until_expiry,
    c.last_refreshed_at,
    c.refresh_error,
    c.is_active
  FROM public.brand_instagram_connections c
  WHERE c.brand_id = p_brand_id;
END;
\$\$;

REVOKE ALL ON FUNCTION public.get_instagram_connection_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_instagram_connection_status(uuid) TO authenticated, service_role;

-- 4. Function: get_expiring_instagram_tokens
CREATE OR REPLACE FUNCTION public.get_expiring_instagram_tokens(p_days_threshold integer DEFAULT 10)
RETURNS TABLE (
  connection_id uuid,
  brand_id uuid,
  instagram_user_id text,
  instagram_username text,
  access_token text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS \$\$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    c.id AS connection_id,
    c.brand_id,
    c.instagram_user_id,
    c.instagram_username,
    s.decrypted_secret AS access_token,
    c.expires_at
  FROM public.brand_instagram_connections c
  JOIN vault.decrypted_secrets s ON s.id = c.token_secret_id
  WHERE c.is_active = true
    AND c.expires_at <= (now() + (p_days_threshold || ' days')::interval);
END;
\$\$;

REVOKE ALL ON FUNCTION public.get_expiring_instagram_tokens(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_expiring_instagram_tokens(integer) TO authenticated, service_role;

-- 5. Function: record_instagram_token_refresh_result
CREATE OR REPLACE FUNCTION public.record_instagram_token_refresh_result(
  p_brand_id uuid,
  p_success boolean,
  p_new_token text DEFAULT NULL,
  p_new_expires_in integer DEFAULT 5184000,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS \$\$
DECLARE
  v_secret_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
  END IF;

  SELECT token_secret_id INTO v_secret_id
  FROM public.brand_instagram_connections
  WHERE brand_id = p_brand_id;

  IF p_success THEN
    IF NULLIF(btrim(p_new_token), '') IS NOT NULL AND v_secret_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_secret_id, btrim(p_new_token));
    END IF;

    UPDATE public.brand_instagram_connections
    SET expires_at = now() + (COALESCE(p_new_expires_in, 5184000) || ' seconds')::interval,
        last_refreshed_at = now(),
        refresh_error = NULL,
        updated_at = now()
    WHERE brand_id = p_brand_id;
  ELSE
    UPDATE public.brand_instagram_connections
    SET refresh_error = NULLIF(btrim(p_error_message), ''),
        updated_at = now()
    WHERE brand_id = p_brand_id;
  END IF;
END;
\$\$;

REVOKE ALL ON FUNCTION public.record_instagram_token_refresh_result(uuid, boolean, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_instagram_token_refresh_result(uuid, boolean, text, integer, text) TO authenticated, service_role;
