ALTER TABLE public.customer_push_devices DROP CONSTRAINT IF EXISTS customer_push_devices_expo_push_token_check;
ALTER TABLE public.customer_push_devices ADD COLUMN IF NOT EXISTS token_provider text NOT NULL DEFAULT 'expo' CHECK(token_provider IN('expo','fcm','apns'));
ALTER TABLE public.customer_push_devices ADD CONSTRAINT customer_push_devices_token_check CHECK (
  (token_provider='expo' AND expo_push_token ~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$') OR
  (token_provider IN('fcm','apns') AND char_length(expo_push_token) BETWEEN 20 AND 4096)
);

DROP FUNCTION IF EXISTS public.register_customer_push_device(text,text,boolean,boolean,boolean,text,text);
CREATE OR REPLACE FUNCTION public.register_customer_push_device(
  p_brand_slug text,p_token text,p_enabled boolean DEFAULT true,p_order_updates boolean DEFAULT true,
  p_marketing boolean DEFAULT false,p_platform text DEFAULT 'android',p_device_name text DEFAULT NULL,
  p_token_provider text DEFAULT 'fcm'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_brand_id uuid;v_customer_id uuid;v_id uuid;v_provider text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_provider:=CASE WHEN p_token_provider IN('expo','fcm','apns') THEN p_token_provider ELSE 'fcm' END;
  IF (v_provider='expo' AND p_token !~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$') OR char_length(p_token) NOT BETWEEN 20 AND 4096 THEN RAISE EXCEPTION 'INVALID_PUSH_TOKEN'; END IF;
  SELECT id INTO v_brand_id FROM public.brands WHERE slug=lower(trim(p_brand_slug)) AND is_active=true;
  IF v_brand_id IS NULL THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;
  SELECT id INTO v_customer_id FROM public.customers WHERE brand_id=v_brand_id AND auth_user_id=auth.uid() ORDER BY created_at LIMIT 1;
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_MEMBERSHIP_REQUIRED'; END IF;
  INSERT INTO public.customer_push_devices(user_id,customer_id,brand_id,expo_push_token,token_provider,platform,device_name,enabled,order_updates_enabled,marketing_enabled)
  VALUES(auth.uid(),v_customer_id,v_brand_id,p_token,v_provider,CASE WHEN p_platform='ios' THEN 'ios' ELSE 'android' END,NULLIF(trim(p_device_name),''),p_enabled,p_order_updates,p_marketing)
  ON CONFLICT(expo_push_token) DO UPDATE SET user_id=EXCLUDED.user_id,customer_id=EXCLUDED.customer_id,brand_id=EXCLUDED.brand_id,
    token_provider=EXCLUDED.token_provider,platform=EXCLUDED.platform,device_name=EXCLUDED.device_name,enabled=EXCLUDED.enabled,
    order_updates_enabled=EXCLUDED.order_updates_enabled,marketing_enabled=EXCLUDED.marketing_enabled,last_seen_at=now(),updated_at=now()
  RETURNING id INTO v_id; RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.register_customer_push_device(text,text,boolean,boolean,boolean,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_customer_push_device(text,text,boolean,boolean,boolean,text,text,text) TO authenticated;
