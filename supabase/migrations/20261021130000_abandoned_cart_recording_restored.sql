-- Abandoned carts are recorded again, and what a visitor can write is bounded.
--
-- Migration 20260905090000 redefined rpc_record_or_update_cart_activity with
-- `SET search_path = public` and a call to gen_random_bytes(), which lives in the
-- `extensions` schema. Every new cart has failed since (42883: function
-- gen_random_bytes(integer) does not exist) and the browser hid the error: the
-- table's last new row is from 2026-09-04. The same rewrite also undid the
-- previous day's fix (20260904143000): it trusted a customer id sent by the
-- browser again, and made consent impossible to withdraw.
--
-- Both functions below are called by visitors (anon), so they check what they are
-- given themselves:
-- * a cart is one row per store and browser session, of bounded size, in the
--   store's own currency; a store takes at most 300 new carts in 10 minutes;
-- * the customer is the signed-in shopper's own record of that store, never an id
--   the caller names;
-- * consent is the shopper's latest answer at checkout (null keeps the last one:
--   the storefront's background sync asks nothing);
-- * an order closes the carts of its own session and its own customer only, and
--   only an order of that store placed in the last hour. A cart that was abandoned
--   and then became an order is `recovered`; one that went straight to checkout is
--   `converted`, so a store's "recovered" figures are carts that really came back.

ALTER TABLE public.abandoned_carts DROP CONSTRAINT IF EXISTS abandoned_carts_status_check;
ALTER TABLE public.abandoned_carts ADD CONSTRAINT abandoned_carts_status_check
  CHECK (status = ANY (ARRAY[
    'active', 'abandoned', 'recovering', 'recovered', 'converted', 'expired', 'unsubscribed'
  ]::text[]));

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_brand_created
  ON public.abandoned_carts (brand_id, created_at);

CREATE OR REPLACE FUNCTION public.rpc_record_or_update_cart_activity(
  p_brand_id uuid,
  p_session_id text,
  p_customer_id uuid DEFAULT NULL,
  p_guest_email text DEFAULT NULL,
  p_guest_phone text DEFAULT NULL,
  p_guest_name text DEFAULT NULL,
  p_cart_items jsonb DEFAULT '[]'::jsonb,
  p_subtotal numeric DEFAULT 0.000,
  p_currency text DEFAULT 'BHD'::text,
  p_marketing_consent boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session text := NULLIF(btrim(p_session_id), '');
  v_items jsonb := COALESCE(p_cart_items, '[]'::jsonb);
  v_email text := left(NULLIF(btrim(p_guest_email), ''), 254);
  v_phone text := left(NULLIF(btrim(p_guest_phone), ''), 32);
  v_name text := left(NULLIF(btrim(p_guest_name), ''), 120);
  v_currency text;
  v_customer public.customers%ROWTYPE;
  v_cart public.abandoned_carts%ROWTYPE;
  v_consent boolean;
BEGIN
  -- p_customer_id is not read: the customer is the signed-in shopper's own record.
  IF p_brand_id IS NULL OR v_session IS NULL OR length(v_session) > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CART_SESSION');
  END IF;
  IF jsonb_typeof(v_items) <> 'array'
     OR jsonb_array_length(v_items) > 100
     OR octet_length(v_items::text) > 65536 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CART_ITEMS');
  END IF;
  IF p_subtotal IS NULL OR p_subtotal < 0 OR p_subtotal > 100000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CART_SUBTOTAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.brands WHERE id = p_brand_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'STORE_NOT_FOUND');
  END IF;

  IF jsonb_array_length(v_items) = 0 THEN
    UPDATE public.abandoned_carts
       SET status = 'expired', updated_at = now()
     WHERE brand_id = p_brand_id AND session_id = v_session
       AND status IN ('active', 'abandoned', 'recovering');
    RETURN jsonb_build_object('success', true, 'status', 'cleared');
  END IF;

  SELECT COALESCE(
    NULLIF(btrim(bs.currency), ''),
    CASE WHEN upper(btrim(p_currency)) ~ '^[A-Z]{3}$' THEN upper(btrim(p_currency)) END,
    'BHD'
  ) INTO v_currency
  FROM (SELECT 1) one
  LEFT JOIN public.business_settings bs ON bs.brand_id = p_brand_id;

  IF auth.uid() IS NOT NULL THEN
    SELECT * INTO v_customer
      FROM public.customers
     WHERE brand_id = p_brand_id AND auth_user_id = auth.uid()
     ORDER BY created_at
     LIMIT 1;
  END IF;

  -- Consent needs someone to reach: a contact typed at checkout or the shopper's account.
  v_consent := CASE
    WHEN p_marketing_consent IS NULL THEN NULL
    ELSE p_marketing_consent AND (v_email IS NOT NULL OR v_phone IS NOT NULL OR v_customer.id IS NOT NULL)
  END;

  SELECT * INTO v_cart
    FROM public.abandoned_carts
   WHERE brand_id = p_brand_id AND session_id = v_session
     AND status IN ('active', 'abandoned', 'recovering')
   ORDER BY last_activity_at DESC, created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    -- abandoned_at is kept: a cart that comes back and is ordered was recovered.
    UPDATE public.abandoned_carts
       SET customer_id = COALESCE(v_customer.id, customer_id),
           guest_email = COALESCE(v_customer.email, v_email, guest_email),
           guest_phone = COALESCE(v_customer.phone, v_phone, guest_phone),
           guest_name = COALESCE(v_customer.name, v_name, guest_name),
           cart_items = v_items,
           subtotal = p_subtotal,
           currency = v_currency,
           marketing_consent = COALESCE(v_consent, marketing_consent),
           status = CASE WHEN status = 'recovering' THEN 'recovering' ELSE 'active' END,
           last_activity_at = now(),
           updated_at = now()
     WHERE id = v_cart.id
     RETURNING * INTO v_cart;
  ELSE
    IF (
      SELECT count(*) FROM public.abandoned_carts
       WHERE brand_id = p_brand_id AND created_at > now() - interval '10 minutes'
    ) >= 300 THEN
      RETURN jsonb_build_object('success', false, 'error', 'TOO_MANY_CARTS');
    END IF;

    -- recovery_token takes the column's default (gen_random_uuid, in core Postgres).
    INSERT INTO public.abandoned_carts (
      brand_id, session_id, customer_id, guest_email, guest_phone, guest_name,
      cart_items, subtotal, currency, marketing_consent, status, last_activity_at
    ) VALUES (
      p_brand_id, v_session, v_customer.id,
      COALESCE(v_customer.email, v_email),
      COALESCE(v_customer.phone, v_phone),
      COALESCE(v_customer.name, v_name),
      v_items, p_subtotal, v_currency, COALESCE(v_consent, false), 'active', now()
    )
    RETURNING * INTO v_cart;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cart_id', v_cart.id,
    'recovery_token', v_cart.recovery_token,
    'status', v_cart.status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_mark_cart_recovered_on_order(
  p_brand_id uuid,
  p_order_id uuid,
  p_customer_id uuid DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_guest_email text DEFAULT NULL,
  p_guest_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order record;
  v_session text := NULLIF(btrim(p_session_id), '');
  v_recovered integer := 0;
  v_converted integer := 0;
BEGIN
  -- Only the order's own data is read: p_customer_id, p_guest_email and p_guest_phone are
  -- kept for older browsers and ignored.
  SELECT o.id, o.customer_id,
         NULLIF(btrim(o.customer_email_snapshot), '') AS email,
         NULLIF(btrim(o.customer_phone_snapshot), '') AS phone
    INTO v_order
    FROM public.orders o
   WHERE o.id = p_order_id
     AND o.brand_id = p_brand_id
     AND o.channel = 'storefront'
     AND o.created_at > now() - interval '1 hour';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  WITH closed AS (
    UPDATE public.abandoned_carts
       SET status = CASE WHEN abandoned_at IS NOT NULL THEN 'recovered' ELSE 'converted' END,
           recovered_at = now(),
           recovered_order_id = v_order.id,
           updated_at = now()
     WHERE brand_id = p_brand_id
       AND status IN ('active', 'abandoned', 'recovering')
       AND (
         (v_session IS NOT NULL AND session_id = v_session)
         OR (v_order.customer_id IS NOT NULL AND customer_id = v_order.customer_id)
         OR (v_order.phone IS NOT NULL AND guest_phone = v_order.phone)
         OR (v_order.email IS NOT NULL AND lower(guest_email) = lower(v_order.email))
       )
    RETURNING status
  )
  SELECT count(*) FILTER (WHERE status = 'recovered'),
         count(*) FILTER (WHERE status = 'converted')
    INTO v_recovered, v_converted
    FROM closed;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'recovered_carts_count', v_recovered,
    'converted_carts_count', v_converted
  );
END;
$function$;

-- Carts closed by an order before this migration without ever being abandoned went
-- straight to checkout: they were never recovered.
UPDATE public.abandoned_carts
   SET status = 'converted', updated_at = now()
 WHERE status = 'recovered' AND abandoned_at IS NULL;
