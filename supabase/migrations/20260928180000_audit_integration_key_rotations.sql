-- Bug #27: integration key rotations were never written to the audit log.
--
-- The integrations screen inserted into saas_audit_logs from the browser with
-- columns that do not exist (actor_user_id, details), without the required
-- target_type / target_id, and RLS lets only super admins insert there. The
-- error was swallowed, so no rotation was ever recorded.
--
-- save_integration_credential is unchanged except that it now writes the
-- audit row itself, in the same transaction, whenever an API key or webhook
-- secret is set. The row names the caller and which secrets changed, never
-- the secrets. Brands read their own rows ("Brand view own audit logs").

CREATE OR REPLACE FUNCTION public.save_integration_credential(
  p_id uuid, p_brand_id uuid, p_provider text, p_base_url text,
  p_api_key text, p_webhook_secret text, p_is_active boolean, p_notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_id uuid;
  v_api_secret_id uuid;
  v_webhook_secret_id uuid;
  v_rotated boolean := false;
  v_api_key_set boolean := NULLIF(btrim(p_api_key), '') IS NOT NULL;
  v_webhook_secret_set boolean := NULLIF(btrim(p_webhook_secret), '') IS NOT NULL;
BEGIN
  IF NOT public.is_admin() OR NOT public.can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NULLIF(btrim(p_provider), '') IS NULL THEN RAISE EXCEPTION 'PROVIDER_REQUIRED'; END IF;

  IF p_id IS NULL THEN
    v_id := gen_random_uuid();
    IF v_api_key_set THEN
      SELECT vault.create_secret(btrim(p_api_key), 'integration-api-' || v_id::text,
        'Encrypted API credential for ' || btrim(p_provider)) INTO v_api_secret_id;
      v_rotated := true;
    END IF;
    IF v_webhook_secret_set THEN
      SELECT vault.create_secret(btrim(p_webhook_secret), 'integration-webhook-' || v_id::text,
        'Encrypted webhook credential for ' || btrim(p_provider)) INTO v_webhook_secret_id;
      v_rotated := true;
    END IF;
    INSERT INTO public.integration_credentials(
      id, brand_id, provider, base_url, api_key_secret_id, webhook_secret_secret_id,
      is_active, notes, created_by, last_rotated_at, rotated_by
    ) VALUES (
      v_id, p_brand_id, btrim(p_provider), NULLIF(btrim(p_base_url), ''),
      v_api_secret_id, v_webhook_secret_id, COALESCE(p_is_active, true),
      NULLIF(btrim(p_notes), ''), auth.uid(),
      CASE WHEN v_rotated THEN now() ELSE NULL END,
      CASE WHEN v_rotated THEN auth.uid() ELSE NULL END
    );
  ELSE
    SELECT api_key_secret_id, webhook_secret_secret_id
      INTO v_api_secret_id, v_webhook_secret_id
    FROM public.integration_credentials
    WHERE id = p_id AND brand_id = p_brand_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

    IF v_api_key_set THEN
      IF v_api_secret_id IS NULL THEN
        SELECT vault.create_secret(btrim(p_api_key), 'integration-api-' || p_id::text,
          'Encrypted API credential for ' || btrim(p_provider)) INTO v_api_secret_id;
      ELSE
        PERFORM vault.update_secret(v_api_secret_id, btrim(p_api_key));
      END IF;
      v_rotated := true;
    END IF;
    IF v_webhook_secret_set THEN
      IF v_webhook_secret_id IS NULL THEN
        SELECT vault.create_secret(btrim(p_webhook_secret), 'integration-webhook-' || p_id::text,
          'Encrypted webhook credential for ' || btrim(p_provider)) INTO v_webhook_secret_id;
      ELSE
        PERFORM vault.update_secret(v_webhook_secret_id, btrim(p_webhook_secret));
      END IF;
      v_rotated := true;
    END IF;

    UPDATE public.integration_credentials
    SET provider = btrim(p_provider),
      base_url = NULLIF(btrim(p_base_url), ''),
      api_key_secret_id = v_api_secret_id,
      webhook_secret_secret_id = v_webhook_secret_id,
      api_key = NULL,
      webhook_secret = NULL,
      is_active = COALESCE(p_is_active, true),
      notes = NULLIF(btrim(p_notes), ''),
      last_rotated_at = CASE WHEN v_rotated THEN now() ELSE last_rotated_at END,
      rotated_by = CASE WHEN v_rotated THEN auth.uid() ELSE rotated_by END
    WHERE id = p_id AND brand_id = p_brand_id
    RETURNING id INTO v_id;
  END IF;

  -- Record which secrets were set (never their values).
  IF v_rotated THEN
    INSERT INTO public.saas_audit_logs (
      actor_id, actor_email, action, target_type, target_id, brand_id, changes
    ) VALUES (
      auth.uid(),
      (SELECT u.email FROM auth.users u WHERE u.id = auth.uid()),
      'integration.key_rotated',
      'integration_credential',
      v_id::text,
      p_brand_id,
      jsonb_build_object(
        'provider', btrim(p_provider),
        'created', p_id IS NULL,
        'api_key', v_api_key_set,
        'webhook_secret', v_webhook_secret_set
      )
    );
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_integration_credential(uuid, uuid, text, text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_integration_credential(uuid, uuid, text, text, text, text, boolean, text) TO authenticated, service_role;
