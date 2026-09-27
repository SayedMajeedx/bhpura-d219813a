-- Bug #14: completing a delivery ran courier_complete_delivery and, when it
-- failed, a direct orders update from the browser. The function authorised
-- the assigned courier or a profile whose global role was 'admin', 'superadmin'
-- or 'staff', so:
--   - brand staff (role 'brand_admin') were refused and only got through the
--     browser fallback, which marks the order 'completed';
--   - a courier's failure fell back to an update their RLS silently filters
--     out, and the screen still said the delivery was done;
--   - an 'admin' profile could complete another brand's orders.
-- Now the function alone completes a delivery, for the assigned courier or
-- the brand's own staff (can_access_brand: active, not a courier, same brand
-- or super admin). It marks the order completed like the office path did,
-- and refuses to complete (and count the cash of) a delivery twice.

CREATE OR REPLACE FUNCTION public.courier_complete_delivery(
  p_order_id uuid,
  p_collected_amount numeric DEFAULT 0,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_user_id UUID;
  v_new_paid_amount NUMERIC;
  v_new_payment_status TEXT;
  v_updated_notes TEXT;
  v_courier_name TEXT;
BEGIN
  IF p_collected_amount < 0 THEN
    RAISE EXCEPTION 'Collected amount cannot be negative';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id, brand_id, total, COALESCE(advance_paid, 0) AS current_paid, payment_status,
         fulfillment_status, assigned_to, delivery_notes
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.assigned_to IS DISTINCT FROM v_user_id
     AND NOT public.can_access_brand(v_order.brand_id) THEN
    RAISE EXCEPTION 'Not authorized to complete delivery for this order';
  END IF;

  IF upper(COALESCE(v_order.fulfillment_status, '')) = 'COMPLETED' THEN
    RAISE EXCEPTION 'DELIVERY_ALREADY_COMPLETED';
  END IF;

  v_new_paid_amount := COALESCE(v_order.current_paid, 0) + COALESCE(p_collected_amount, 0);

  IF v_new_paid_amount >= v_order.total THEN
    v_new_payment_status := 'paid';
  ELSIF v_new_paid_amount > 0 THEN
    v_new_payment_status := 'partially_paid';
  ELSE
    v_new_payment_status := COALESCE(v_order.payment_status, 'unpaid');
  END IF;

  SELECT COALESCE(full_name, email, 'Courier') INTO v_courier_name
  FROM public.profiles
  WHERE id = v_user_id;

  IF p_notes IS NOT NULL AND trim(p_notes) <> '' THEN
    v_updated_notes := COALESCE(v_order.delivery_notes || E'\n', '') ||
      '[' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI') || ' - ' || v_courier_name || ']: ' || trim(p_notes);
  ELSE
    v_updated_notes := v_order.delivery_notes;
  END IF;

  UPDATE public.orders
  SET
    advance_paid = v_new_paid_amount,
    cod_collected_amount = COALESCE(p_collected_amount, 0),
    cod_collected_at = NOW(),
    cod_collected_by = v_user_id,
    payment_status = v_new_payment_status,
    status = 'completed',
    fulfillment_status = 'COMPLETED',
    delivery_notes = v_updated_notes,
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'paid_amount', v_new_paid_amount,
    'payment_status', v_new_payment_status,
    'fulfillment_status', 'COMPLETED'
  );
END;
$function$;
