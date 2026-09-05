-- ============================================================================
-- Migration: 20260905110000_remediate_phase5_categories_and_campaign_safeguards.sql
-- Description:
--   1. Harden get_brand_categories_with_counts:
--      - Enforce is_admin() AND can_access_brand(p_brand_id) inside the RPC.
--      - Apply 30-day window for 'new-arrivals' and 'new' categories:
--        p.created_at >= (now() - interval '30 days')
--      - Revoke execution from PUBLIC and anon, grant to authenticated and service_role.
--   2. Integration credentials rotation tracking:
--      - Add last_rotated_at and rotated_by to integration_credentials.
--      - Update save_integration_credential to record rotation timestamps and user.
--      - Update list_integration_credentials to expose last_rotated_at.
-- ============================================================================

-- 1. HARDEN get_brand_categories_with_counts RPC
CREATE OR REPLACE FUNCTION public.get_brand_categories_with_counts(p_brand_id uuid)
RETURNS TABLE (
    id uuid,
    name_ar text,
    name_en text,
    slug text,
    sort_order integer,
    is_active boolean,
    parent_id uuid,
    image_url text,
    menu_icon_url text,
    is_smart boolean,
    product_count integer,
    total_product_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Strict admin access check to prevent cross-tenant & anonymous exposure of unlisted categories
    IF NOT (public.is_admin() AND public.can_access_brand(p_brand_id)) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT 
        c.id,
        c.name_ar,
        c.name_en,
        c.slug,
        c.sort_order,
        c.is_active,
        c.parent_id,
        c.image_url,
        c.menu_icon_url,
        CASE 
            WHEN c.slug IN ('new-arrivals', 'new') THEN true
            WHEN c.slug IN ('most-selling', 'best-sellers', 'best-selling') THEN true
            WHEN c.slug IN ('sale', 'offers', 'discounts') THEN true
            ELSE false
        END AS is_smart,
        CASE 
            WHEN c.slug IN ('new-arrivals', 'new') THEN (
                SELECT COUNT(*)::int 
                FROM public.products p 
                WHERE p.brand_id = c.brand_id 
                  AND p.is_active = true 
                  AND p.created_at >= (now() - interval '30 days')
            )
            WHEN c.slug IN ('most-selling', 'best-sellers', 'best-selling') THEN (
                SELECT COUNT(DISTINCT oi.product_id)::int 
                FROM public.order_items oi 
                JOIN public.orders o ON o.id = oi.order_id 
                JOIN public.products p ON p.id = oi.product_id
                WHERE o.brand_id = c.brand_id AND p.is_active = true AND o.payment_status = 'paid'
            )
            WHEN c.slug IN ('sale', 'offers', 'discounts') THEN (
                SELECT COUNT(DISTINCT p.id)::int 
                FROM public.products p 
                WHERE p.brand_id = c.brand_id 
                  AND p.is_active = true 
                  AND (
                      p.show_sale_badge = true 
                      OR EXISTS (
                          SELECT 1 FROM public.product_variants pv 
                          WHERE pv.product_id = p.id AND pv.original_price > pv.selling_price
                      )
                  )
            )
            ELSE (
                SELECT COUNT(*)::int 
                FROM public.products p 
                WHERE p.brand_id = c.brand_id 
                  AND p.is_active = true 
                  AND (p.category = c.slug OR p.category = c.name_en OR p.category = c.id::text)
            )
        END AS product_count,
        CASE 
            WHEN c.slug IN ('new-arrivals', 'new') THEN (
                SELECT COUNT(*)::int 
                FROM public.products p 
                WHERE p.brand_id = c.brand_id 
                  AND p.created_at >= (now() - interval '30 days')
            )
            WHEN c.slug IN ('most-selling', 'best-sellers', 'best-selling') THEN (
                SELECT COUNT(DISTINCT oi.product_id)::int 
                FROM public.order_items oi 
                JOIN public.orders o ON o.id = oi.order_id 
                JOIN public.products p ON p.id = oi.product_id
                WHERE o.brand_id = c.brand_id AND p.is_active = true AND o.payment_status = 'paid'
            )
            WHEN c.slug IN ('sale', 'offers', 'discounts') THEN (
                SELECT COUNT(DISTINCT p.id)::int 
                FROM public.products p 
                WHERE p.brand_id = c.brand_id 
                  AND (
                      p.show_sale_badge = true 
                      OR EXISTS (
                          SELECT 1 FROM public.product_variants pv 
                          WHERE pv.product_id = p.id AND pv.original_price > pv.selling_price
                      )
                  )
            )
            ELSE (
                SELECT COUNT(*)::int 
                FROM public.products p 
                WHERE p.brand_id = c.brand_id 
                  AND (p.category = c.slug OR p.category = c.name_en OR p.category = c.id::text)
            )
        END AS total_product_count
    FROM public.categories c
    WHERE c.brand_id = p_brand_id
    ORDER BY c.sort_order ASC;
END;
$$;

-- Revoke execute from public/anon; allow only authenticated and service_role
REVOKE ALL ON FUNCTION public.get_brand_categories_with_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_brand_categories_with_counts(uuid) TO authenticated, service_role;


-- 2. INTEGRATION CREDENTIALS ROTATION AUDITING
ALTER TABLE public.integration_credentials
  ADD COLUMN IF NOT EXISTS last_rotated_at timestamptz,
  ADD COLUMN IF NOT EXISTS rotated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill last_rotated_at for existing credentials using updated_at
UPDATE public.integration_credentials
SET last_rotated_at = COALESCE(updated_at, created_at, now())
WHERE last_rotated_at IS NULL;

-- 3. UPDATE save_integration_credential WITH ROTATION TRACKING
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
BEGIN
  IF NOT public.is_admin() OR NOT public.can_access_brand(p_brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NULLIF(btrim(p_provider), '') IS NULL THEN RAISE EXCEPTION 'PROVIDER_REQUIRED'; END IF;

  IF p_id IS NULL THEN
    v_id := gen_random_uuid();
    IF NULLIF(btrim(p_api_key), '') IS NOT NULL THEN
      SELECT vault.create_secret(btrim(p_api_key), 'integration-api-' || v_id::text,
        'Encrypted API credential for ' || btrim(p_provider)) INTO v_api_secret_id;
      v_rotated := true;
    END IF;
    IF NULLIF(btrim(p_webhook_secret), '') IS NOT NULL THEN
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

    IF NULLIF(btrim(p_api_key), '') IS NOT NULL THEN
      IF v_api_secret_id IS NULL THEN
        SELECT vault.create_secret(btrim(p_api_key), 'integration-api-' || p_id::text,
          'Encrypted API credential for ' || btrim(p_provider)) INTO v_api_secret_id;
      ELSE
        PERFORM vault.update_secret(v_api_secret_id, btrim(p_api_key));
      END IF;
      v_rotated := true;
    END IF;
    IF NULLIF(btrim(p_webhook_secret), '') IS NOT NULL THEN
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
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_integration_credential(uuid, uuid, text, text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_integration_credential(uuid, uuid, text, text, text, text, boolean, text) TO authenticated, service_role;


-- 4. UPDATE list_integration_credentials TO RETURN last_rotated_at
DROP FUNCTION IF EXISTS public.list_integration_credentials(uuid);

CREATE OR REPLACE FUNCTION public.list_integration_credentials(p_brand_id uuid)
RETURNS TABLE(
  id uuid,
  brand_id uuid,
  provider text,
  base_url text,
  api_key_masked text,
  webhook_secret_masked text,
  has_api_key boolean,
  has_webhook_secret boolean,
  is_active boolean,
  notes text,
  updated_at timestamp with time zone,
  last_rotated_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
  SELECT
    i.id,
    i.brand_id,
    i.provider,
    i.base_url,
    CASE
      WHEN api.decrypted_secret IS NULL THEN NULL
      ELSE '••••••••••••' || right(api.decrypted_secret, 4)
    END,
    CASE
      WHEN webhook.decrypted_secret IS NULL THEN NULL
      ELSE '••••••••••••' || right(webhook.decrypted_secret, 4)
    END,
    api.decrypted_secret IS NOT NULL,
    webhook.decrypted_secret IS NOT NULL,
    i.is_active,
    i.notes,
    i.updated_at,
    i.last_rotated_at
  FROM public.integration_credentials i
  LEFT JOIN vault.decrypted_secrets api ON api.id = i.api_key_secret_id
  LEFT JOIN vault.decrypted_secrets webhook ON webhook.id = i.webhook_secret_secret_id
  WHERE i.brand_id = p_brand_id
    AND public.is_admin() AND public.can_access_brand(p_brand_id)
  ORDER BY i.provider;
$$;

REVOKE ALL ON FUNCTION public.list_integration_credentials(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_integration_credentials(uuid) TO authenticated, service_role;
