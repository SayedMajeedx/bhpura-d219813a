-- Allow merchants to restrict a promo code to customers with a prior successful order.
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS returning_customers_only boolean NOT NULL DEFAULT false;

ALTER TABLE public.promo_codes
  DROP CONSTRAINT IF EXISTS promo_codes_customer_audience_check,
  ADD CONSTRAINT promo_codes_customer_audience_check CHECK (
    NOT (first_time_customers_only AND returning_customers_only)
  );

-- Preserve the existing mature validation implementation and add the returning-customer
-- eligibility guard in front of it. The public signature remains unchanged.
ALTER FUNCTION public.validate_promo_code(text,text,numeric,jsonb,uuid)
  RENAME TO validate_promo_code_before_returning_customer_guard_20260825;

CREATE FUNCTION public.validate_promo_code(
  p_brand_slug text,
  p_code text,
  p_subtotal numeric,
  p_items jsonb DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promo public.promo_codes%ROWTYPE;
  v_brand_id uuid;
  v_user_id uuid := auth.uid();
  v_effective_customer_id uuid;
  v_effective_auth_user_id uuid;
  v_historical_orders integer := 0;
BEGIN
  SELECT pc.* INTO v_promo
  FROM public.promo_codes pc
  JOIN public.brands b ON b.id = pc.brand_id
  WHERE b.slug = p_brand_slug
    AND b.is_active = true
    AND upper(pc.code) = upper(trim(p_code));

  IF v_promo.id IS NOT NULL AND v_promo.returning_customers_only THEN
    v_brand_id := v_promo.brand_id;

    IF p_customer_id IS NOT NULL THEN
      IF NOT (
        public.is_super_admin()
        OR (public.is_admin() AND public.current_brand_id() = v_brand_id)
      ) THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'CUSTOMER_ACCESS_DENIED');
      END IF;

      SELECT c.id, c.auth_user_id
      INTO v_effective_customer_id, v_effective_auth_user_id
      FROM public.customers c
      WHERE c.id = p_customer_id AND c.brand_id = v_brand_id;

      IF v_effective_customer_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'CUSTOMER_REQUIRED');
      END IF;
    ELSE
      IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'AUTH_REQUIRED');
      END IF;
      v_effective_auth_user_id := v_user_id;
    END IF;

    SELECT count(*) INTO v_historical_orders
    FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    WHERE o.brand_id = v_brand_id
      AND (
        (v_effective_auth_user_id IS NOT NULL AND c.auth_user_id = v_effective_auth_user_id)
        OR (v_effective_auth_user_id IS NULL AND c.id = v_effective_customer_id)
      )
      AND (o.status IN ('completed', 'paid') OR o.payment_status = 'paid');

    IF v_historical_orders = 0 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'PREVIOUS_ORDER_REQUIRED');
    END IF;
  END IF;

  RETURN public.validate_promo_code_before_returning_customer_guard_20260825(
    p_brand_slug,
    p_code,
    p_subtotal,
    p_items,
    p_customer_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_promo_code(text,text,numeric,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_promo_code(text,text,numeric,jsonb,uuid)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
