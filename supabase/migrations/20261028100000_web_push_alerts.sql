-- Order alerts on the installed admin while it is closed (the owner's request of 2026-10-27): a
-- member of staff turns them on per device (Settings → Account, `OrderAlertsSettings`), the browser
-- gives a Web Push subscription, and the push sender (`send-mobile-push`, every minute) delivers each
-- new order of the store to it from the same queue the merchant app reads
-- (`push_notification_events`). Encryption and signing: `supabase/functions/send-mobile-push/web-push.ts`.

CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  -- Only the browsers' own push services: the sender never posts to an address a visitor chose.
  endpoint text NOT NULL UNIQUE CHECK (
    length(endpoint) <= 1024 AND endpoint ~ (
      '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|'
      || '[a-z0-9.-]*push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
    )
  ),
  p256dh text NOT NULL CHECK (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text NOT NULL CHECK (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
  device_name text CHECK (length(device_name) <= 180),
  preferences jsonb NOT NULL DEFAULT '{"order_new":true}'::jsonb,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_push_subscriptions_brand_idx ON public.web_push_subscriptions (brand_id);
ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.web_push_subscriptions TO service_role;

-- A device turns alerts on for the store it is looking at: staff of that store who handle orders.
CREATE OR REPLACE FUNCTION public.register_web_push_subscription(
  p_brand_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_device_name text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.can_access_brand(p_brand_id) OR NOT public.has_permission('manage_orders') THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  INSERT INTO public.web_push_subscriptions (user_id, brand_id, endpoint, p256dh, auth, device_name)
  VALUES (auth.uid(), p_brand_id, p_endpoint, p_p256dh, p_auth, NULLIF(left(trim(p_device_name), 180), ''))
  ON CONFLICT (endpoint) DO UPDATE SET
    user_id = EXCLUDED.user_id, brand_id = EXCLUDED.brand_id, p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth, device_name = EXCLUDED.device_name, updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.register_web_push_subscription(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_web_push_subscription(uuid, text, text, text, text) TO authenticated;

-- Turning them off on a device: only the person's own subscription.
CREATE OR REPLACE FUNCTION public.remove_web_push_subscription(p_endpoint text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  DELETE FROM public.web_push_subscriptions WHERE endpoint = p_endpoint AND user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.remove_web_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_web_push_subscription(text) TO authenticated;

-- Who receives an event, read by the sender at the moment it sends: a subscription for the event's
-- store, wanting that kind of event, whose person is still active and may still handle the store's
-- orders (a member who left, was switched off or lost the permission stops receiving at once).
CREATE OR REPLACE FUNCTION public.web_push_targets(p_brand_id uuid, p_event_type text)
RETURNS TABLE (id uuid, endpoint text, p256dh text, auth text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.endpoint, s.p256dh, s.auth
    FROM public.web_push_subscriptions s
    JOIN public.profiles p ON p.id = s.user_id
   WHERE s.brand_id = p_brand_id
     AND COALESCE((s.preferences ->> p_event_type)::boolean, false)
     AND p.status = 'active'
     AND (
       p.role = 'super_admin'
       OR (p.brand_id = p_brand_id
           AND (p.role IN ('admin', 'brand_admin') OR jsonb_exists(p.permissions, 'manage_orders')))
     );
$$;
REVOKE ALL ON FUNCTION public.web_push_targets(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_push_targets(uuid, text) TO service_role;
