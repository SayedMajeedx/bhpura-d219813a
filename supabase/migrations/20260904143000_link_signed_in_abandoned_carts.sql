-- Link storefront cart activity to the authenticated brand customer. Never
-- trust a customer id supplied by an anonymous browser.

CREATE OR REPLACE FUNCTION public.rpc_record_or_update_cart_activity(
  p_brand_id uuid,
  p_session_id text,
  p_customer_id uuid DEFAULT NULL,
  p_guest_email text DEFAULT NULL,
  p_guest_phone text DEFAULT NULL,
  p_guest_name text DEFAULT NULL,
  p_cart_items jsonb DEFAULT '[]'::jsonb,
  p_subtotal numeric DEFAULT 0.000,
  p_currency text DEFAULT 'BHD',
  p_marketing_consent boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cart public.abandoned_carts%ROWTYPE;
  v_customer public.customers%ROWTYPE;
BEGIN
  IF p_brand_id IS NULL OR NULLIF(trim(p_session_id), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid cart session');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.brands WHERE id = p_brand_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Brand not found');
  END IF;
  IF jsonb_typeof(COALESCE(p_cart_items, '[]'::jsonb)) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cart items must be an array');
  END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT * INTO v_customer
      FROM public.customers
     WHERE brand_id = p_brand_id AND auth_user_id = auth.uid()
     LIMIT 1;
  END IF;

  IF jsonb_array_length(COALESCE(p_cart_items, '[]'::jsonb)) = 0 THEN
    UPDATE public.abandoned_carts
       SET status = 'expired', cart_items = '[]'::jsonb, subtotal = 0, updated_at = now()
     WHERE brand_id = p_brand_id AND session_id = p_session_id
       AND status IN ('active', 'abandoned', 'recovering');
    RETURN jsonb_build_object('success', true, 'status', 'cleared');
  END IF;

  SELECT * INTO v_cart
    FROM public.abandoned_carts
   WHERE brand_id = p_brand_id AND session_id = p_session_id
     AND status IN ('active', 'abandoned', 'recovering')
   ORDER BY last_activity_at DESC, created_at DESC
   LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    UPDATE public.abandoned_carts
       SET customer_id = COALESCE(v_customer.id, customer_id),
           guest_email = COALESCE(v_customer.email, NULLIF(trim(p_guest_email), ''), guest_email),
           guest_phone = COALESCE(v_customer.phone, NULLIF(trim(p_guest_phone), ''), guest_phone),
           guest_name = COALESCE(v_customer.name, NULLIF(trim(p_guest_name), ''), guest_name),
           cart_items = p_cart_items,
           subtotal = GREATEST(COALESCE(p_subtotal, 0), 0),
           currency = COALESCE(NULLIF(trim(p_currency), ''), currency),
           marketing_consent = p_marketing_consent,
           status = 'active', abandoned_at = NULL,
           last_activity_at = now(), updated_at = now()
     WHERE id = v_cart.id
     RETURNING * INTO v_cart;
  ELSE
    INSERT INTO public.abandoned_carts (
      brand_id, session_id, customer_id, guest_email, guest_phone, guest_name,
      cart_items, subtotal, currency, marketing_consent, recovery_token,
      status, last_activity_at
    ) VALUES (
      p_brand_id, p_session_id, v_customer.id,
      COALESCE(v_customer.email, NULLIF(trim(p_guest_email), '')),
      COALESCE(v_customer.phone, NULLIF(trim(p_guest_phone), '')),
      COALESCE(v_customer.name, NULLIF(trim(p_guest_name), '')),
      p_cart_items, GREATEST(COALESCE(p_subtotal, 0), 0),
      COALESCE(NULLIF(trim(p_currency), ''), 'BHD'), p_marketing_consent,
      replace(gen_random_uuid()::text, '-', ''), 'active', now()
    ) RETURNING * INTO v_cart;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'cart_id', v_cart.id,
    'recovery_token', v_cart.recovery_token, 'status', v_cart.status
  );
END;
$$;

-- Repair still-live carts captured before the browser-side identity fix.
UPDATE public.abandoned_carts cart
   SET customer_id = customer.id,
       guest_name = COALESCE(cart.guest_name, customer.name),
       guest_email = COALESCE(cart.guest_email, customer.email),
       guest_phone = COALESCE(cart.guest_phone, customer.phone),
       updated_at = now()
  FROM public.customers customer
 WHERE cart.brand_id = customer.brand_id
   AND cart.customer_id IS NULL
   AND cart.status IN ('active', 'abandoned', 'recovering')
   AND (
     (cart.guest_email IS NOT NULL AND lower(cart.guest_email) = lower(customer.email))
     OR (cart.guest_phone IS NOT NULL AND cart.guest_phone = customer.phone)
   );
