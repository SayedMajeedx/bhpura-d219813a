-- Closing a cart must retain its last useful product/value snapshot for admin
-- analytics. It is not eligible for recovery because the customer cleared it.

CREATE OR REPLACE FUNCTION public.rpc_close_storefront_cart_session(
  p_brand_id uuid,
  p_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF p_brand_id IS NULL OR NULLIF(trim(p_session_id), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid cart session');
  END IF;

  UPDATE public.abandoned_carts
     SET status = 'expired',
         updated_at = now()
   WHERE brand_id = p_brand_id
     AND session_id = p_session_id
     AND status IN ('active', 'abandoned', 'recovering');
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'status', 'cleared', 'updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_close_storefront_cart_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_close_storefront_cart_session(uuid, text) TO anon, authenticated;

COMMENT ON FUNCTION public.rpc_close_storefront_cart_session(uuid, text) IS
  'Closes a cleared storefront cart while preserving its last cart_items and subtotal snapshot.';
