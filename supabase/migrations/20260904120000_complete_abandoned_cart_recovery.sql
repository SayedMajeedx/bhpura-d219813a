-- Complete abandoned-cart lifecycle and remove the pgcrypto-specific
-- gen_random_bytes dependency that broke cart capture in production.

ALTER TABLE public.abandoned_carts
  ALTER COLUMN recovery_token
  SET DEFAULT replace(gen_random_uuid()::text, '-', '');

-- Preserve all saved customization fields while refreshing price and stock.
CREATE OR REPLACE FUNCTION public.rpc_validate_and_restore_abandoned_cart(
  p_brand_slug text,
  p_recovery_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand public.brands%ROWTYPE;
  v_cart public.abandoned_carts%ROWTYPE;
  v_item jsonb;
  v_variant public.product_variants%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_adjusted_items jsonb := '[]'::jsonb;
  v_has_out_of_stock boolean := false;
  v_has_price_change boolean := false;
  v_available_qty integer;
  v_current_price numeric;
  v_qty integer;
  v_new_subtotal numeric := 0;
BEGIN
  SELECT * INTO v_brand FROM public.brands WHERE slug = p_brand_slug;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Brand not found');
  END IF;

  SELECT * INTO v_cart
    FROM public.abandoned_carts
   WHERE brand_id = v_brand.id AND recovery_token = p_recovery_token;
  IF NOT FOUND OR v_cart.status IN ('expired', 'unsubscribed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired recovery link');
  END IF;
  IF v_cart.status = 'recovered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This cart has already been completed');
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_cart.cart_items)
  LOOP
    IF NULLIF(v_item->>'variant_id', '') IS NULL THEN
      v_has_out_of_stock := true;
      CONTINUE;
    END IF;

    SELECT * INTO v_variant
      FROM public.product_variants
     WHERE id = (v_item->>'variant_id')::uuid AND brand_id = v_brand.id;
    IF NOT FOUND THEN
      v_has_out_of_stock := true;
      CONTINUE;
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = v_variant.product_id;
    v_available_qty := COALESCE(v_variant.stock_quantity, 0);
    v_current_price := COALESCE(v_variant.selling_price, v_product.base_price, (v_item->>'price')::numeric);
    v_qty := LEAST(GREATEST(COALESCE((v_item->>'qty')::integer, 1), 1), v_available_qty);
    IF COALESCE((v_item->>'price')::numeric, 0) <> v_current_price THEN
      v_has_price_change := true;
    END IF;

    IF v_available_qty <= 0 THEN
      v_has_out_of_stock := true;
      CONTINUE;
    END IF;

    v_adjusted_items := v_adjusted_items || (
      v_item || jsonb_build_object(
        'variant_id', v_variant.id,
        'product_id', v_variant.product_id,
        'title', COALESCE(v_product.name_ar, v_product.name_en, v_item->>'title'),
        'name', COALESCE(v_product.name_ar, v_product.name_en, v_item->>'name'),
        'price', v_current_price,
        'unit_price', v_current_price,
        'qty', v_qty,
        'quantity', v_qty,
        'line_total', v_current_price * v_qty,
        'image_url', COALESCE(v_variant.image_url, v_item->>'image_url', v_item->>'image'),
        'stock_available', v_available_qty
      )
    );
    v_new_subtotal := v_new_subtotal + (v_current_price * v_qty);
  END LOOP;

  UPDATE public.abandoned_carts
     SET status = 'recovering', updated_at = now()
   WHERE id = v_cart.id;

  RETURN jsonb_build_object(
    'success', true,
    'valid', true,
    'cart_id', v_cart.id,
    'guest_name', v_cart.guest_name,
    'guest_email', v_cart.guest_email,
    'guest_phone', v_cart.guest_phone,
    'items', v_adjusted_items,
    'subtotal', v_new_subtotal,
    'currency', v_cart.currency,
    'recovery_discount_code', v_cart.recovery_discount_code,
    'has_out_of_stock', v_has_out_of_stock,
    'has_price_change', v_has_price_change
  );
END;
$$;

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

  IF jsonb_array_length(COALESCE(p_cart_items, '[]'::jsonb)) = 0 THEN
    UPDATE public.abandoned_carts
       SET status = 'expired',
           cart_items = '[]'::jsonb,
           subtotal = 0,
           updated_at = now()
     WHERE brand_id = p_brand_id
       AND session_id = p_session_id
       AND status IN ('active', 'abandoned', 'recovering');
    RETURN jsonb_build_object('success', true, 'status', 'cleared');
  END IF;

  SELECT * INTO v_cart
    FROM public.abandoned_carts
   WHERE brand_id = p_brand_id
     AND session_id = p_session_id
     AND status IN ('active', 'abandoned', 'recovering')
   ORDER BY last_activity_at DESC, created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.abandoned_carts
       SET customer_id = COALESCE(p_customer_id, customer_id),
           guest_email = COALESCE(NULLIF(trim(p_guest_email), ''), guest_email),
           guest_phone = COALESCE(NULLIF(trim(p_guest_phone), ''), guest_phone),
           guest_name = COALESCE(NULLIF(trim(p_guest_name), ''), guest_name),
           cart_items = p_cart_items,
           subtotal = GREATEST(COALESCE(p_subtotal, 0), 0),
           currency = COALESCE(NULLIF(trim(p_currency), ''), currency),
           marketing_consent = p_marketing_consent,
           status = 'active',
           abandoned_at = NULL,
           last_activity_at = now(),
           updated_at = now()
     WHERE id = v_cart.id
     RETURNING * INTO v_cart;
  ELSE
    INSERT INTO public.abandoned_carts (
      brand_id, session_id, customer_id, guest_email, guest_phone,
      guest_name, cart_items, subtotal, currency, marketing_consent,
      recovery_token, status, last_activity_at
    ) VALUES (
      p_brand_id, p_session_id, p_customer_id, NULLIF(trim(p_guest_email), ''),
      NULLIF(trim(p_guest_phone), ''), NULLIF(trim(p_guest_name), ''),
      p_cart_items, GREATEST(COALESCE(p_subtotal, 0), 0),
      COALESCE(NULLIF(trim(p_currency), ''), 'BHD'), p_marketing_consent,
      replace(gen_random_uuid()::text, '-', ''), 'active', now()
    ) RETURNING * INTO v_cart;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cart_id', v_cart.id,
    'recovery_token', v_cart.recovery_token,
    'status', v_cart.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_process_abandoned_carts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_abandoned integer := 0;
  v_expired integer := 0;
  v_expired_stale integer := 0;
BEGIN
  -- Keep only the newest live row left by the previous insert-before-update bug.
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY brand_id, session_id
             ORDER BY last_activity_at DESC, created_at DESC
           ) AS position
      FROM public.abandoned_carts
     WHERE status IN ('active', 'abandoned', 'recovering')
  )
  UPDATE public.abandoned_carts c
     SET status = 'expired', updated_at = now()
    FROM ranked r
   WHERE c.id = r.id AND r.position > 1;
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  UPDATE public.abandoned_carts c
     SET status = 'abandoned',
         abandoned_at = COALESCE(c.abandoned_at, now()),
         updated_at = now()
    FROM public.brands b
    LEFT JOIN public.brand_abandoned_cart_settings s ON s.brand_id = b.id
   WHERE c.brand_id = b.id
     AND COALESCE(s.is_enabled, true) = true
     AND c.status = 'active'
     AND jsonb_array_length(c.cart_items) > 0
     AND c.last_activity_at <= now() - make_interval(
       mins => COALESCE(s.abandonment_threshold_minutes, 30)
     );
  GET DIAGNOSTICS v_abandoned = ROW_COUNT;

  UPDATE public.abandoned_carts
     SET status = 'expired', updated_at = now()
   WHERE status IN ('abandoned', 'recovering')
     AND COALESCE(abandoned_at, last_activity_at) < now() - interval '30 days';
  GET DIAGNOSTICS v_expired_stale = ROW_COUNT;
  v_expired := v_expired + v_expired_stale;

  RETURN jsonb_build_object('success', true, 'abandoned', v_abandoned, 'expired', v_expired);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_generate_abandoned_cart_recovery_coupon(
  p_brand_id uuid,
  p_cart_id uuid,
  p_discount_type text DEFAULT 'percentage',
  p_discount_value numeric DEFAULT 10.0,
  p_expiry_hours integer DEFAULT 48
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_cart public.abandoned_carts%ROWTYPE;
BEGIN
  SELECT * INTO v_cart
    FROM public.abandoned_carts
   WHERE id = p_cart_id AND brand_id = p_brand_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_cart.recovery_discount_code IS NOT NULL THEN
    RETURN v_cart.recovery_discount_code;
  END IF;

  v_code := 'CART-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  INSERT INTO public.promo_codes (
    brand_id, code, discount_type, discount_value, max_redemptions,
    usage_limit_per_customer, end_date, is_active
  ) VALUES (
    p_brand_id, v_code, p_discount_type, p_discount_value, 1, 1,
    now() + make_interval(hours => GREATEST(p_expiry_hours, 1)), true
  );

  UPDATE public.abandoned_carts
     SET recovery_discount_code = v_code, updated_at = now()
   WHERE id = p_cart_id;
  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_process_abandoned_carts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_process_abandoned_carts() TO service_role;

COMMENT ON FUNCTION public.rpc_process_abandoned_carts() IS
  'Runs every minute from the Cloudflare scheduled worker and advances abandoned-cart lifecycle states.';
