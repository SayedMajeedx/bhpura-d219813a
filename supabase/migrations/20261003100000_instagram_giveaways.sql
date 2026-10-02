-- Instagram giveaways: draw winners from the comments on one of the brand's posts.
--
-- Three parts, all additive:
--
--   1. The brand's Instagram connection. brand_instagram_connections and
--      get_instagram_connection_status already exist in the database (an earlier
--      attempt created them without a migration in this repo), so they are written
--      here with IF NOT EXISTS / CREATE OR REPLACE, identical to what is live. The
--      token is kept in Vault; the functions that read or write it are for the
--      service role only (the edge function checks the caller first), so a token
--      never reaches a browser.
--
--   2. giveaways: one row per draw (the post, the rules, the seed).
--      giveaway_comments: the comments pulled from Instagram, written only by the
--      edge function (service role). giveaway_winners: who won, the backups, and
--      whether staff checked the follow / like by hand (Instagram's API cannot tell).
--
--   3. Access: people who manage the store's settings read and write; nobody else.

-- 1. Connection ---------------------------------------------------------------

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

ALTER TABLE public.brand_instagram_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_instagram_connections_select" ON public.brand_instagram_connections;
CREATE POLICY "brand_instagram_connections_select" ON public.brand_instagram_connections
  FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id) OR public.is_admin());

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
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.get_instagram_connection_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_instagram_connection_status(uuid) TO authenticated, service_role;

-- Stores (or replaces) the brand's token in Vault. Service role only: the edge
-- function has already checked that the caller manages this brand.
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
AS $$
DECLARE
  v_secret_id uuid;
  v_connection_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF NULLIF(btrim(p_access_token), '') IS NULL THEN
    RAISE EXCEPTION 'TOKEN_REQUIRED';
  END IF;

  SELECT token_secret_id INTO v_secret_id
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
    brand_id, user_id, instagram_user_id, instagram_username, token_secret_id,
    token_type, scope, expires_at, last_refreshed_at, refresh_error, is_active, updated_at
  ) VALUES (
    p_brand_id, p_user_id, NULLIF(btrim(p_instagram_user_id), ''),
    NULLIF(btrim(p_instagram_username), ''), v_secret_id, 'bearer',
    COALESCE(NULLIF(btrim(p_scope), ''), 'instagram_business_basic'),
    now() + (COALESCE(p_expires_in, 5184000) || ' seconds')::interval,
    now(), NULL, true, now()
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
$$;

REVOKE ALL ON FUNCTION public.save_instagram_token(uuid, uuid, text, text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_instagram_token(uuid, uuid, text, text, text, integer, text)
  TO service_role;

-- Reads the brand's decrypted token. Service role only.
CREATE OR REPLACE FUNCTION public.get_decrypted_instagram_token(p_brand_id uuid)
RETURNS TABLE (
  instagram_user_id text,
  instagram_username text,
  access_token text,
  expires_at timestamptz,
  last_refreshed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT c.instagram_user_id, c.instagram_username, s.decrypted_secret,
         c.expires_at, c.last_refreshed_at
  FROM public.brand_instagram_connections c
  JOIN vault.decrypted_secrets s ON s.id = c.token_secret_id
  WHERE c.brand_id = p_brand_id AND c.is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_decrypted_instagram_token(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_decrypted_instagram_token(uuid) TO service_role;

-- Records a token refresh: the new token and expiry, or the error. Service role only.
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
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
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
$$;

REVOKE ALL ON FUNCTION public.record_instagram_token_refresh_result(uuid, boolean, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_instagram_token_refresh_result(uuid, boolean, text, integer, text)
  TO service_role;

-- 2. Giveaways ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.giveaways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  -- The Instagram post the comments come from.
  media_id text NOT NULL,
  media_permalink text,
  media_caption text CHECK (media_caption IS NULL OR char_length(media_caption) <= 2200),
  media_thumbnail_url text,
  media_posted_at timestamptz,
  -- Instagram's own comment count for the post (replies included), for the progress bar.
  comments_total integer NOT NULL DEFAULT 0 CHECK (comments_total >= 0),
  -- The rules the draw applies (see src/features/giveaways/lib/entry-rules.ts).
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Pulling the comments: where the last page ended, and whether the last page was reached.
  fetch_cursor text,
  fetch_done boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'fetching', 'ready', 'drawn')),
  -- The seed the draw used; the same seed over the same comments gives the same winners.
  draw_seed text,
  drawn_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS giveaways_brand_created_idx
  ON public.giveaways (brand_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.giveaway_comments (
  giveaway_id uuid NOT NULL REFERENCES public.giveaways(id) ON DELETE CASCADE,
  comment_id text NOT NULL,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  username text NOT NULL,
  body text NOT NULL DEFAULT '',
  commented_at timestamptz,
  like_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (giveaway_id, comment_id)
);

CREATE INDEX IF NOT EXISTS giveaway_comments_brand_idx
  ON public.giveaway_comments (brand_id);

CREATE TABLE IF NOT EXISTS public.giveaway_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giveaway_id uuid NOT NULL REFERENCES public.giveaways(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  -- 1 is the first winner; backups follow the winners.
  position integer NOT NULL CHECK (position >= 1),
  kind text NOT NULL CHECK (kind IN ('winner', 'backup')),
  username text NOT NULL,
  comment_id text NOT NULL,
  comment_body text NOT NULL DEFAULT '',
  -- Instagram cannot say who follows or liked, so staff check it by hand.
  follow_checked boolean NOT NULL DEFAULT false,
  like_checked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'disqualified')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (giveaway_id, position)
);

CREATE INDEX IF NOT EXISTS giveaway_winners_brand_idx
  ON public.giveaway_winners (brand_id);

-- 3. Access -------------------------------------------------------------------

ALTER TABLE public.giveaways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giveaway_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giveaway_winners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings managers manage giveaways" ON public.giveaways;
CREATE POLICY "settings managers manage giveaways" ON public.giveaways
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));

-- Comments are read here and written only by the edge function (service role).
DROP POLICY IF EXISTS "settings managers read giveaway comments" ON public.giveaway_comments;
CREATE POLICY "settings managers read giveaway comments" ON public.giveaway_comments
  FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));

DROP POLICY IF EXISTS "settings managers manage giveaway winners" ON public.giveaway_winners;
CREATE POLICY "settings managers manage giveaway winners" ON public.giveaway_winners
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));
