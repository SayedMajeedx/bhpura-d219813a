-- Customer push devices, lifecycle notifications, and tenant-scoped campaigns.
CREATE TABLE IF NOT EXISTS public.customer_push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  expo_push_token text NOT NULL UNIQUE CHECK (expo_push_token ~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$'),
  platform text NOT NULL DEFAULT 'android' CHECK (platform IN ('android','ios')),
  device_name text,
  enabled boolean NOT NULL DEFAULT true,
  order_updates_enabled boolean NOT NULL DEFAULT true,
  marketing_enabled boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_push_devices_customer_idx ON public.customer_push_devices(customer_id) WHERE enabled;
CREATE INDEX IF NOT EXISTS customer_push_devices_brand_idx ON public.customer_push_devices(brand_id) WHERE enabled;
ALTER TABLE public.customer_push_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_push_devices FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.customer_push_devices TO service_role;
GRANT SELECT ON public.customer_push_devices TO authenticated;
CREATE POLICY "customers read own push devices" ON public.customer_push_devices FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read brand customer devices" ON public.customer_push_devices FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

CREATE TABLE IF NOT EXISTS public.customer_push_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('order_update','marketing')),
  dedupe_key text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  target_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','processed','failed')),
  attempts integer NOT NULL DEFAULT 0,
  recipient_count integer NOT NULL DEFAULT 0,
  accepted_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  last_error text,
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS customer_push_events_pending_idx ON public.customer_push_events(available_at,created_at) WHERE status IN ('pending','failed');
ALTER TABLE public.customer_push_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_push_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.customer_push_events TO service_role;
GRANT SELECT ON public.customer_push_events TO authenticated;
CREATE POLICY "admins read brand customer push" ON public.customer_push_events FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

CREATE TABLE IF NOT EXISTS public.customer_push_delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.customer_push_events(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.customer_push_devices(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('accepted','failed','disabled')),
  provider_ticket_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id,device_id)
);
ALTER TABLE public.customer_push_delivery_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_push_delivery_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.customer_push_delivery_log TO service_role;

CREATE OR REPLACE FUNCTION public.register_customer_push_device(
  p_brand_slug text,
  p_token text,
  p_enabled boolean DEFAULT true,
  p_order_updates boolean DEFAULT true,
  p_marketing boolean DEFAULT false,
  p_platform text DEFAULT 'android',
  p_device_name text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_brand_id uuid; v_customer_id uuid; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_token !~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$' THEN RAISE EXCEPTION 'INVALID_PUSH_TOKEN'; END IF;
  SELECT id INTO v_brand_id FROM public.brands WHERE slug=lower(trim(p_brand_slug)) AND is_active=true;
  IF v_brand_id IS NULL THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;
  SELECT id INTO v_customer_id FROM public.customers WHERE brand_id=v_brand_id AND auth_user_id=auth.uid() ORDER BY created_at LIMIT 1;
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_MEMBERSHIP_REQUIRED'; END IF;
  INSERT INTO public.customer_push_devices(user_id,customer_id,brand_id,expo_push_token,platform,device_name,enabled,order_updates_enabled,marketing_enabled)
  VALUES(auth.uid(),v_customer_id,v_brand_id,p_token,CASE WHEN p_platform='ios' THEN 'ios' ELSE 'android' END,NULLIF(trim(p_device_name),''),p_enabled,p_order_updates,p_marketing)
  ON CONFLICT(expo_push_token) DO UPDATE SET
    user_id=EXCLUDED.user_id,customer_id=EXCLUDED.customer_id,brand_id=EXCLUDED.brand_id,platform=EXCLUDED.platform,
    device_name=EXCLUDED.device_name,enabled=EXCLUDED.enabled,order_updates_enabled=EXCLUDED.order_updates_enabled,
    marketing_enabled=EXCLUDED.marketing_enabled,last_seen_at=now(),updated_at=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.register_customer_push_device(text,text,boolean,boolean,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_customer_push_device(text,text,boolean,boolean,boolean,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_customer_push_campaign(
  p_brand_id uuid, p_title text, p_body text, p_customer_id uuid DEFAULT NULL, p_target_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_key text;
BEGIN
  IF NOT public.can_access_brand(p_brand_id) THEN RAISE EXCEPTION 'NOT_AUTHORIZED'; END IF;
  IF length(trim(p_title)) NOT BETWEEN 1 AND 100 OR length(trim(p_body)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'INVALID_MESSAGE'; END IF;
  IF p_customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.customers WHERE id=p_customer_id AND brand_id=p_brand_id) THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  v_key := 'campaign:'||gen_random_uuid();
  INSERT INTO public.customer_push_events(brand_id,customer_id,event_type,dedupe_key,title,body,target_url,created_by)
  VALUES(p_brand_id,p_customer_id,'marketing',v_key,trim(p_title),trim(p_body),NULLIF(trim(p_target_url),''),auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_customer_push_campaign(uuid,text,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_push_campaign(uuid,text,text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_customer_order_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_invoice text:=COALESCE(NEW.invoice_number::text,'—'); v_title text; v_body text; v_state text;
BEGIN
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    v_title:='استلمنا طلبك #'||v_invoice; v_body:='شكراً لك. سنرسل لك التحديثات هنا أولاً بأول.'; v_state:='created';
  ELSIF ROW(NEW.status,NEW.payment_status,NEW.fulfillment_status) IS NOT DISTINCT FROM ROW(OLD.status,OLD.payment_status,OLD.fulfillment_status) THEN RETURN NEW;
  ELSE
    v_state:=upper(COALESCE(NULLIF(NEW.fulfillment_status,''),NULLIF(NEW.status,''),'UPDATED'))||':'||lower(COALESCE(NEW.payment_status,''));
    CASE
      WHEN lower(COALESCE(NEW.status,'')) IN ('cancelled','canceled') THEN v_title:='تم إلغاء الطلب #'||v_invoice; v_body:='إذا احتجت مساعدة، تواصل معنا من داخل المتجر.';
      WHEN lower(COALESCE(NEW.payment_status,''))='refunded' THEN v_title:='تم استرجاع مبلغ الطلب #'||v_invoice; v_body:='تم تسجيل الاسترجاع بنجاح.';
      WHEN upper(COALESCE(NEW.fulfillment_status,''))='OUT_FOR_DELIVERY' THEN v_title:='طلبك في الطريق #'||v_invoice; v_body:='طلبك خرج للتوصيل وسيصلك قريباً.';
      WHEN upper(COALESCE(NEW.fulfillment_status,''))='READY_FOR_PICKUP' OR lower(COALESCE(NEW.status,''))='ready_for_pickup' THEN v_title:='طلبك جاهز للاستلام #'||v_invoice; v_body:='يمكنك الآن استلام طلبك.';
      WHEN upper(COALESCE(NEW.fulfillment_status,''))='COMPLETED' OR lower(COALESCE(NEW.status,''))='completed' THEN v_title:='اكتمل طلبك #'||v_invoice; v_body:='نتمنى أن ينال طلبك إعجابك. شكراً لاختيارك Pura Line.';
      WHEN lower(COALESCE(NEW.payment_status,''))='paid' THEN v_title:='تم تأكيد الدفع #'||v_invoice; v_body:='تم اعتماد دفعتك وبدأنا متابعة الطلب.';
      WHEN lower(COALESCE(NEW.status,''))='confirmed' THEN v_title:='تم تأكيد الطلب #'||v_invoice; v_body:='طلبك مؤكد وتحت المتابعة.';
      WHEN upper(COALESCE(NEW.fulfillment_status,'')) IN ('PROCESSING','PREPARING') THEN v_title:='جاري تجهيز طلبك #'||v_invoice; v_body:='نعمل حالياً على تجهيز طلبك.';
      ELSE v_title:='تحديث على طلبك #'||v_invoice; v_body:='تم تحديث حالة طلبك. افتح التطبيق لمشاهدة التفاصيل.';
    END CASE;
  END IF;
  INSERT INTO public.customer_push_events(brand_id,customer_id,order_id,event_type,dedupe_key,title,body,target_url,payload)
  VALUES(NEW.brand_id,NEW.customer_id,NEW.id,'order_update','customer-order:'||NEW.id||':'||v_state,v_title,v_body,'/pura/account',jsonb_build_object('order_id',NEW.id,'invoice_number',NEW.invoice_number))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enqueue_customer_order_push ON public.orders;
CREATE TRIGGER enqueue_customer_order_push AFTER INSERT OR UPDATE OF status,payment_status,fulfillment_status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.enqueue_customer_order_push();
REVOKE ALL ON FUNCTION public.enqueue_customer_order_push() FROM PUBLIC,anon,authenticated;
