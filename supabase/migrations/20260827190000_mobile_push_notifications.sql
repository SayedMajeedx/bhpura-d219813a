-- Durable, tenant-scoped push notifications for Boutq OS mobile devices.
CREATE TABLE IF NOT EXISTS public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL UNIQUE CHECK (expo_push_token ~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$'),
  platform text NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios')),
  device_name text,
  enabled boolean NOT NULL DEFAULT true,
  preferences jsonb NOT NULL DEFAULT '{"order_new":true,"order_updated":true,"review_due":true,"review_completed":true,"low_stock":true,"system_failure":true}'::jsonb,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_devices_brand_enabled_idx ON public.push_devices (brand_id) WHERE enabled;
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_devices FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_devices TO service_role;

CREATE POLICY "users read own push devices" ON public.push_devices
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.push_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('order_new','order_updated','review_due','review_completed','low_stock','system_failure')),
  entity_type text NOT NULL,
  entity_id uuid,
  dedupe_key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  target_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','processed','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS push_notification_events_pending_idx
ON public.push_notification_events (available_at, created_at) WHERE status IN ('pending','failed');
ALTER TABLE public.push_notification_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_notification_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_notification_events TO service_role;

CREATE TABLE IF NOT EXISTS public.push_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.push_notification_events(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.push_devices(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('accepted','failed','disabled')),
  provider_ticket_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, device_id)
);
ALTER TABLE public.push_delivery_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_delivery_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_delivery_log TO service_role;

CREATE OR REPLACE FUNCTION public.register_mobile_push_device(
  p_token text,
  p_enabled boolean DEFAULT true,
  p_platform text DEFAULT 'android',
  p_device_name text DEFAULT NULL,
  p_preferences jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_profile public.profiles%ROWTYPE; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_token !~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$' THEN RAISE EXCEPTION 'INVALID_PUSH_TOKEN'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid() AND status = 'active';
  IF NOT FOUND OR v_profile.role NOT IN ('super_admin','admin','brand_admin','staff','courier') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  INSERT INTO public.push_devices (user_id, brand_id, expo_push_token, platform, device_name, enabled, preferences)
  VALUES (auth.uid(), v_profile.brand_id, p_token, p_platform, NULLIF(trim(p_device_name), ''), p_enabled,
    COALESCE(p_preferences, '{"order_new":true,"order_updated":true,"review_due":true,"review_completed":true,"low_stock":true,"system_failure":true}'::jsonb))
  ON CONFLICT (expo_push_token) DO UPDATE SET
    user_id = EXCLUDED.user_id, brand_id = EXCLUDED.brand_id, platform = EXCLUDED.platform,
    device_name = EXCLUDED.device_name, enabled = EXCLUDED.enabled,
    preferences = COALESCE(p_preferences, push_devices.preferences), last_seen_at = now(), updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.register_mobile_push_device(text,boolean,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_mobile_push_device(text,boolean,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_mobile_order_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invoice text := COALESCE(NEW.invoice_number::text, '—');
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.push_notification_events (brand_id,event_type,entity_type,entity_id,dedupe_key,title,body,target_url,payload)
    VALUES (NEW.brand_id,'order_new','order',NEW.id,'order-new:'||NEW.id,'طلب جديد #'||v_invoice,
      COALESCE(NULLIF(NEW.customer_name_snapshot,''),'عميل جديد')||' — '||COALESCE(NEW.total,0)||' '||COALESCE(NEW.currency,'BHD'),
      '/orders/'||NEW.id,jsonb_build_object('order_id',NEW.id,'invoice_number',NEW.invoice_number))
    ON CONFLICT DO NOTHING;
  ELSIF ROW(NEW.status,NEW.payment_status,NEW.fulfillment_status) IS DISTINCT FROM ROW(OLD.status,OLD.payment_status,OLD.fulfillment_status) THEN
    INSERT INTO public.push_notification_events (brand_id,event_type,entity_type,entity_id,dedupe_key,title,body,target_url,payload)
    VALUES (NEW.brand_id,'order_updated','order',NEW.id,
      'order-state:'||NEW.id||':'||COALESCE(NEW.status,'')||':'||COALESCE(NEW.payment_status,'')||':'||COALESCE(NEW.fulfillment_status,''),
      'تحديث الطلب #'||v_invoice,'الحالة: '||COALESCE(NULLIF(NEW.fulfillment_status,''),NULLIF(NEW.status,''),'تم التحديث'),
      '/orders/'||NEW.id,jsonb_build_object('order_id',NEW.id,'invoice_number',NEW.invoice_number))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS enqueue_mobile_order_push ON public.orders;
CREATE TRIGGER enqueue_mobile_order_push AFTER INSERT OR UPDATE OF status,payment_status,fulfillment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enqueue_mobile_order_push();

CREATE OR REPLACE FUNCTION public.enqueue_mobile_review_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invoice integer;
BEGIN
  SELECT invoice_number INTO v_invoice FROM public.orders WHERE id = NEW.order_id;
  INSERT INTO public.push_notification_events (brand_id,event_type,entity_type,entity_id,dedupe_key,title,body,target_url,payload)
  VALUES (NEW.brand_id,'review_completed','review',NEW.id,'review-completed:'||NEW.id,'تقييم جديد مكتمل',
    'الطلب #'||COALESCE(v_invoice::text,'—')||' حصل على '||NEW.rating||' من 5','/reviews',
    jsonb_build_object('review_id',NEW.id,'order_id',NEW.order_id,'rating',NEW.rating))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS enqueue_mobile_review_push ON public.order_reviews;
CREATE TRIGGER enqueue_mobile_review_push AFTER INSERT ON public.order_reviews
FOR EACH ROW EXECUTE FUNCTION public.enqueue_mobile_review_push();

CREATE OR REPLACE FUNCTION public.enqueue_mobile_low_stock_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_stock numeric; v_old_stock numeric; v_name text; v_brand uuid;
BEGIN
  v_stock := COALESCE(NEW.stock_main, NEW.stock, 0); v_old_stock := COALESCE(OLD.stock_main, OLD.stock, 0);
  IF v_stock <= 5 AND (v_old_stock > 5 OR v_old_stock IS NULL) THEN
    SELECT p.brand_id, p.name INTO v_brand, v_name FROM public.products p WHERE p.id = NEW.product_id;
    INSERT INTO public.push_notification_events (brand_id,event_type,entity_type,entity_id,dedupe_key,title,body,target_url,payload)
    VALUES (v_brand,'low_stock','variant',NEW.id,'low-stock:'||NEW.id||':'||v_stock,'تنبيه انخفاض المخزون',
      COALESCE(v_name,NULLIF(NEW.sku,''),'منتج')||' — المتبقي '||v_stock,'/inventory',jsonb_build_object('variant_id',NEW.id,'stock',v_stock))
    ON CONFLICT DO NOTHING;
  END IF; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS enqueue_mobile_low_stock_push ON public.product_variants;
CREATE TRIGGER enqueue_mobile_low_stock_push AFTER UPDATE OF stock_main,stock ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.enqueue_mobile_low_stock_push();

REVOKE ALL ON FUNCTION public.enqueue_mobile_order_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_mobile_review_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_mobile_low_stock_push() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
-- The production cron is installed at deploy time with an Authorization
-- header sourced from the environment; credentials never belong in migrations.
