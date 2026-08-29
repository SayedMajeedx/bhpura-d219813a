-- ============================================================================
-- Migration: Public API v1, Scoped API Keys, Webhooks Engine, Idempotency & Connector Framework
-- Timestamp: 20260829150000
-- Multi-Tenant & RLS Secured Architecture
-- ============================================================================

-- 1. Brand Developer API Keys
CREATE TABLE IF NOT EXISTS public.brand_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL DEFAULT 'bq_live_',
  key_hint text NOT NULL, -- Last 4 chars e.g. "a9f2"
  key_hash text NOT NULL UNIQUE, -- SHA-256 hex hash of the raw token
  scopes text[] NOT NULL DEFAULT ARRAY['products:read', 'orders:read']::text[],
  rate_limit_per_minute integer NOT NULL DEFAULT 120,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NULL,
  last_used_at timestamptz NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand team can view their brand api keys"
  ON public.brand_api_keys FOR SELECT
  USING (
    brand_id IN (
      SELECT b.id FROM public.brands b
      WHERE b.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.brand_members bm
        WHERE bm.brand_id = b.id AND bm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Brand team can manage their brand api keys"
  ON public.brand_api_keys FOR ALL
  USING (
    brand_id IN (
      SELECT b.id FROM public.brands b
      WHERE b.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.brand_members bm
        WHERE bm.brand_id = b.id AND bm.user_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_brand_api_keys_hash ON public.brand_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_brand_api_keys_brand ON public.brand_api_keys(brand_id);

-- 2. API Request Audit Logs (no sensitive payloads logged)
CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  api_key_id uuid NULL REFERENCES public.brand_api_keys(id) ON DELETE SET NULL,
  request_id text NOT NULL,
  idempotency_key text NULL,
  method text NOT NULL,
  path text NOT NULL,
  status_code integer NOT NULL,
  ip_address text NULL,
  user_agent text NULL,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand team can view api request logs"
  ON public.api_request_logs FOR SELECT
  USING (
    brand_id IN (
      SELECT b.id FROM public.brands b
      WHERE b.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.brand_members bm
        WHERE bm.brand_id = b.id AND bm.user_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_api_request_logs_brand_date ON public.api_request_logs(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_request_id ON public.api_request_logs(request_id);

-- 3. API Idempotency Records
CREATE TABLE IF NOT EXISTS public.api_idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  resource_path text NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT uq_brand_idempotency UNIQUE (brand_id, idempotency_key)
);

ALTER TABLE public.api_idempotency_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_idempotency_lookup ON public.api_idempotency_records(brand_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON public.api_idempotency_records(expires_at);

-- 4. Brand Webhook Endpoints
CREATE TABLE IF NOT EXISTS public.brand_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  url text NOT NULL,
  description text NULL,
  secret text NOT NULL, -- whsec_... for HMAC-SHA256 signature
  subscribed_events text[] NOT NULL DEFAULT ARRAY['order.created', 'order.updated']::text[],
  is_active boolean NOT NULL DEFAULT true,
  consecutive_failures integer NOT NULL DEFAULT 0,
  disabled_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand team can manage webhook endpoints"
  ON public.brand_webhook_endpoints FOR ALL
  USING (
    brand_id IN (
      SELECT b.id FROM public.brands b
      WHERE b.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.brand_members bm
        WHERE bm.brand_id = b.id AND bm.user_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_brand ON public.brand_webhook_endpoints(brand_id);

-- 5. Webhook Delivery Logs
CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES public.brand_webhook_endpoints(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_name text NOT NULL,
  payload jsonb NOT NULL,
  request_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_status integer NULL,
  response_body text NULL,
  duration_ms integer NULL,
  attempt integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending', -- pending, delivered, failed, retrying
  next_retry_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand team can view webhook delivery logs"
  ON public.webhook_delivery_logs FOR SELECT
  USING (
    brand_id IN (
      SELECT b.id FROM public.brands b
      WHERE b.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.brand_members bm
        WHERE bm.brand_id = b.id AND bm.user_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_brand_date ON public.webhook_delivery_logs(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_endpoint ON public.webhook_delivery_logs(endpoint_id);

-- 6. Brand Connectors (Unified Integrations: Shopify, WooCommerce, Salla, Zid, Zapier/Make, POS, etc.)
CREATE TABLE IF NOT EXISTS public.brand_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  connector_type text NOT NULL, -- 'shopify', 'woocommerce', 'salla', 'zid', 'zapier', 'make', 'custom_pos', 'custom_accounting'
  status text NOT NULL DEFAULT 'disconnected', -- 'connected', 'disconnected', 'syncing', 'error', 'paused'
  auth_type text NOT NULL DEFAULT 'api_key', -- 'api_key', 'oauth2', 'webhook_secret', 'custom'
  credentials_encrypted jsonb NOT NULL DEFAULT '{}'::jsonb,
  sync_direction text NOT NULL DEFAULT 'two_way', -- 'inbound_only', 'outbound_only', 'two_way'
  field_mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  sync_frequency_minutes integer NOT NULL DEFAULT 60,
  last_sync_at timestamptz NULL,
  last_sync_status text NULL, -- 'success', 'failed', 'partial'
  last_error_message text NULL,
  total_synced_records integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_brand_connector UNIQUE (brand_id, connector_type)
);

ALTER TABLE public.brand_connectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand team can manage connectors"
  ON public.brand_connectors FOR ALL
  USING (
    brand_id IN (
      SELECT b.id FROM public.brands b
      WHERE b.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.brand_members bm
        WHERE bm.brand_id = b.id AND bm.user_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_brand_connectors_brand ON public.brand_connectors(brand_id);

-- 7. Brand Connector Sync Logs
CREATE TABLE IF NOT EXISTS public.brand_connector_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.brand_connectors(id) ON DELETE CASCADE,
  sync_job_id text NOT NULL,
  entity_type text NOT NULL, -- 'products', 'orders', 'inventory', 'customers'
  direction text NOT NULL, -- 'inbound', 'outbound'
  records_processed integer NOT NULL DEFAULT 0,
  records_succeeded integer NOT NULL DEFAULT 0,
  records_failed integer NOT NULL DEFAULT 0,
  error_details jsonb NULL,
  status text NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL
);

ALTER TABLE public.brand_connector_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand team can view connector sync logs"
  ON public.brand_connector_sync_logs FOR SELECT
  USING (
    brand_id IN (
      SELECT b.id FROM public.brands b
      WHERE b.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.brand_members bm
        WHERE bm.brand_id = b.id AND bm.user_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_connector_sync_logs_brand ON public.brand_connector_sync_logs(brand_id, started_at DESC);

-- ============================================================================
-- 8. SECURITY DEFINER RPC Functions
-- ============================================================================

-- RPC 1: Validate API Key Hash securely
CREATE OR REPLACE FUNCTION public.rpc_validate_api_key_hash(
  p_key_hash text
)
RETURNS TABLE (
  is_valid boolean,
  api_key_id uuid,
  brand_id uuid,
  brand_slug text,
  brand_name text,
  scopes text[],
  rate_limit_per_minute integer,
  error_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key record;
  v_brand record;
BEGIN
  IF p_key_hash IS NULL OR length(trim(p_key_hash)) = 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::text, NULL::text, ARRAY[]::text[], 0, 'missing_key_hash'::text;
    RETURN;
  END IF;

  SELECT * INTO v_key
  FROM public.brand_api_keys
  WHERE key_hash = trim(p_key_hash);

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::text, NULL::text, ARRAY[]::text[], 0, 'invalid_key'::text;
    RETURN;
  END IF;

  IF NOT v_key.is_active THEN
    RETURN QUERY SELECT false, v_key.id, v_key.brand_id, NULL::text, NULL::text, v_key.scopes, v_key.rate_limit_per_minute, 'revoked_key'::text;
    RETURN;
  END IF;

  IF v_key.expires_at IS NOT NULL AND v_key.expires_at < now() THEN
    RETURN QUERY SELECT false, v_key.id, v_key.brand_id, NULL::text, NULL::text, v_key.scopes, v_key.rate_limit_per_minute, 'expired_key'::text;
    RETURN;
  END IF;

  SELECT id, slug, COALESCE(name_ar, name_en, 'Brand') as bname INTO v_brand
  FROM public.brands
  WHERE id = v_key.brand_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, v_key.id, v_key.brand_id, NULL::text, NULL::text, v_key.scopes, v_key.rate_limit_per_minute, 'brand_not_found'::text;
    RETURN;
  END IF;

  -- Update last used timestamp asynchronously
  UPDATE public.brand_api_keys
  SET last_used_at = now()
  WHERE id = v_key.id;

  RETURN QUERY SELECT
    true,
    v_key.id,
    v_key.brand_id,
    v_brand.slug,
    v_brand.bname,
    v_key.scopes,
    v_key.rate_limit_per_minute,
    NULL::text;
END;
$$;

-- RPC 2: Record API Request Audit Log
CREATE OR REPLACE FUNCTION public.rpc_record_api_request_log(
  p_brand_id uuid,
  p_api_key_id uuid,
  p_request_id text,
  p_idempotency_key text,
  p_method text,
  p_path text,
  p_status_code integer,
  p_ip_address text,
  p_user_agent text,
  p_duration_ms integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.api_request_logs (
    brand_id,
    api_key_id,
    request_id,
    idempotency_key,
    method,
    path,
    status_code,
    ip_address,
    user_agent,
    duration_ms
  )
  VALUES (
    p_brand_id,
    p_api_key_id,
    COALESCE(p_request_id, gen_random_uuid()::text),
    p_idempotency_key,
    upper(trim(p_method)),
    p_path,
    p_status_code,
    p_ip_address,
    p_user_agent,
    COALESCE(p_duration_ms, 0)
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- RPC 3: Process or Store Idempotency Response
CREATE OR REPLACE FUNCTION public.rpc_get_or_create_idempotency_record(
  p_brand_id uuid,
  p_idempotency_key text,
  p_resource_path text,
  p_request_hash text,
  p_response_status integer DEFAULT NULL,
  p_response_body jsonb DEFAULT NULL
)
RETURNS TABLE (
  has_cached_response boolean,
  response_status integer,
  response_body jsonb,
  is_conflict boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec record;
BEGIN
  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RETURN QUERY SELECT false, NULL::integer, NULL::jsonb, false;
    RETURN;
  END IF;

  SELECT * INTO v_rec
  FROM public.api_idempotency_records
  WHERE brand_id = p_brand_id
    AND idempotency_key = trim(p_idempotency_key)
    AND expires_at > now();

  IF FOUND THEN
    -- If request hash differs for the same idempotency key, flag conflict
    IF v_rec.request_hash <> p_request_hash THEN
      RETURN QUERY SELECT false, 409::integer, jsonb_build_object('error', 'Idempotency key reused with differing request payload'), true;
      RETURN;
    END IF;

    RETURN QUERY SELECT true, v_rec.response_status, v_rec.response_body, false;
    RETURN;
  END IF;

  -- If response provided, store new idempotency record (24 hour TTL)
  IF p_response_status IS NOT NULL AND p_response_body IS NOT NULL THEN
    INSERT INTO public.api_idempotency_records (
      brand_id,
      idempotency_key,
      resource_path,
      request_hash,
      response_status,
      response_body,
      expires_at
    )
    VALUES (
      p_brand_id,
      trim(p_idempotency_key),
      p_resource_path,
      p_request_hash,
      p_response_status,
      p_response_body,
      now() + interval '24 hours'
    )
    ON CONFLICT (brand_id, idempotency_key) DO UPDATE
    SET response_status = EXCLUDED.response_status,
        response_body = EXCLUDED.response_body,
        expires_at = now() + interval '24 hours';
  END IF;

  RETURN QUERY SELECT false, NULL::integer, NULL::jsonb, false;
END;
$$;
