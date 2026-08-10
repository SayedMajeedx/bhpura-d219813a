-- Fix blank order statuses
UPDATE public.orders
SET status = CASE
    WHEN lower(trim(COALESCE(payment_method, ''))) IN ('card', 'tap', 'creimax', 'credit', 'credit_card', 'debit_card') 
         AND lower(trim(COALESCE(payment_status, ''))) IN ('unpaid', 'failed', 'declined', '') THEN 'pending_payment'
    ELSE 'pending'
END
WHERE status IS NULL OR trim(status) = '';

-- Ensure payment_status supports 'failed', 'declined', etc. (This was done in 193000, but we repeat safely)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check CHECK (
  payment_status IN (
    'unpaid', 'paid', 'refunded', 'partially_paid', 'partial', 'failed', 'declined',
    'UNPAID', 'PAID', 'REFUNDED', 'PARTIALLY_PAID', 'FAILED', 'DECLINED'
  )
);

-- Update the release_card_stock_on_terminal_payment function to include audit logging
CREATE OR REPLACE FUNCTION public.release_card_stock_on_terminal_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
  v_value text;
  v_variant_id uuid;
  v_location text;
  r record;
  v_stock_released boolean := false;
BEGIN
  IF lower(trim(COALESCE(NEW.payment_method, ''))) NOT IN (
    'card', 'tap', 'creimax', 'credit', 'credit_card', 'debit_card',
    'apple_pay', 'google_pay'
  ) OR lower(trim(COALESCE(NEW.payment_status, ''))) NOT IN ('failed', 'declined') THEN
    RETURN NEW;
  END IF;

  IF lower(trim(COALESCE(OLD.payment_status, ''))) IN ('failed', 'declined') THEN
    RETURN NEW;
  END IF;

  IF OLD.stock_deducted AND OLD.stock_snapshot IS NOT NULL THEN
    FOR v_key, v_value IN SELECT * FROM jsonb_each_text(OLD.stock_snapshot)
    LOOP
      IF position('|' in v_key) > 0 THEN
        v_variant_id := split_part(v_key, '|', 1)::uuid;
        v_location := split_part(v_key, '|', 2);
      ELSE
        v_variant_id := v_key::uuid;
        v_location := 'main';
      END IF;

      IF v_location = 'incubator' THEN
        UPDATE public.product_variants
        SET stock_incubator = stock_incubator + v_value::integer
        WHERE id = v_variant_id;
      ELSE
        UPDATE public.product_variants
        SET stock_main = stock_main + v_value::integer
        WHERE id = v_variant_id;
      END IF;
    END LOOP;
    v_stock_released := true;
  ELSIF OLD.stock_deducted THEN
    -- Legacy fallback for orders created before location snapshots existed.
    FOR r IN
      SELECT variant_id, COALESCE(location, 'main') AS location,
             sum(quantity)::integer AS quantity
      FROM public.order_items
      WHERE order_id = OLD.id AND variant_id IS NOT NULL
      GROUP BY variant_id, COALESCE(location, 'main')
    LOOP
      IF r.location = 'incubator' THEN
        UPDATE public.product_variants
        SET stock_incubator = stock_incubator + r.quantity
        WHERE id = r.variant_id;
      ELSE
        UPDATE public.product_variants
        SET stock_main = stock_main + r.quantity
        WHERE id = r.variant_id;
      END IF;
    END LOOP;
    v_stock_released := true;
  END IF;

  NEW.stock_deducted := false;
  NEW.stock_snapshot := NULL;
  NEW.status := 'cancelled';
  NEW.fulfillment_status := 'cancelled';

  -- Log the activity
  INSERT INTO public.activity_logs (
      brand_id, user_id, action, message_en, message_ar, order_id
  ) VALUES (
      NEW.brand_id,
      NEW.user_id,
      'payment_' || lower(trim(COALESCE(NEW.payment_status, ''))),
      'Payment ' || lower(trim(COALESCE(NEW.payment_status, ''))) || '. Order cancelled' || CASE WHEN v_stock_released THEN ' and stock released.' ELSE '.' END,
      'المرتجعة' || CASE WHEN v_stock_released THEN ' وتم استرجاع المخزون.' ELSE '.' END,
      NEW.id
  );

  RETURN NEW;
END;
$function$;

-- Apply a Tap status only after the Worker has fetched the charge directly
-- from Tap. The row lock and expected reference make redirect/webhook/cron
-- races idempotent. Unknown or non-terminal statuses leave the order reserved.
DROP FUNCTION IF EXISTS public.expire_abandoned_initiated_tap_orders();

CREATE OR REPLACE FUNCTION public.reconcile_verified_tap_order(
  p_order_id uuid,
  p_brand_id uuid,
  p_charge_id text,
  p_verified_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_status text := upper(trim(COALESCE(p_verified_status, '')));
BEGIN
  IF v_status NOT IN (
    'CAPTURED', 'SUCCESS', 'ABANDONED', 'CANCELLED', 'DECLINED',
    'FAILED', 'RESTRICTED', 'TIMEDOUT', 'VOID'
  ) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND brand_id = p_brand_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_order.payment_gateway_reference IS DISTINCT FROM p_charge_id
     OR lower(trim(COALESCE(v_order.payment_status, ''))) <> 'unpaid'
     OR lower(trim(COALESCE(v_order.payment_method, ''))) NOT IN (
       'card', 'tap', 'creimax', 'credit', 'credit_card', 'debit_card',
       'apple_pay', 'google_pay'
     ) THEN
    RETURN false;
  END IF;

  IF v_status IN ('CAPTURED', 'SUCCESS') THEN
    UPDATE public.orders
    SET payment_status = 'paid', status = 'confirmed'
    WHERE id = v_order.id;
  ELSE
    -- release_card_stock_on_terminal_payment performs the stock release and
    -- cancellation in the same transaction and logs the terminal transition.
    UPDATE public.orders
    SET payment_status = CASE WHEN v_status = 'DECLINED' THEN 'declined' ELSE 'failed' END,
        notes = COALESCE(notes || e'\n', '') ||
          'Tap status verified by scheduled reconciliation: ' || v_status
    WHERE id = v_order.id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_verified_tap_order(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_verified_tap_order(uuid, uuid, text, text)
  TO service_role;

COMMENT ON FUNCTION public.reconcile_verified_tap_order(uuid, uuid, text, text) IS
  'Atomically applies a status already verified against Tap by the scheduled Worker; rejects stale, mismatched, non-terminal, and replayed transitions.';

NOTIFY pgrst, 'reload schema';
