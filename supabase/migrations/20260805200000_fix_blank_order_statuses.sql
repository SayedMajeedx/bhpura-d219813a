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

-- Abandoned Payment Expiration
CREATE OR REPLACE FUNCTION public.expire_abandoned_initiated_tap_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_cancelled_count integer := 0;
    v_order RECORD;
BEGIN
    FOR v_order IN
        SELECT id, brand_id, user_id, payment_gateway_reference, status, payment_status, stock_deducted
        FROM public.orders
        WHERE lower(trim(COALESCE(payment_method, ''))) IN ('card', 'tap', 'creimax', 'credit', 'credit_card', 'debit_card')
          AND lower(trim(COALESCE(payment_status, ''))) = 'unpaid'
          AND payment_gateway_reference IS NOT NULL
          AND created_at < (NOW() - INTERVAL '30 minutes')
          AND status NOT IN ('cancelled', 'completed', 'shipped', 'delivered', 'returned')
    LOOP
        -- Cancel the order and transition to failed
        -- The trigger release_card_stock_on_terminal_payment will catch this and release stock + log
        UPDATE public.orders
        SET payment_status = 'failed',
            notes = COALESCE(notes || e'\n', '') || 'Automatically cancelled due to payment expiration'
        WHERE id = v_order.id;

        v_cancelled_count := v_cancelled_count + 1;
    END LOOP;
    
    RETURN v_cancelled_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_abandoned_initiated_tap_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_abandoned_initiated_tap_orders() TO service_role;

COMMENT ON FUNCTION public.expire_abandoned_initiated_tap_orders() IS
  'Finds TAP orders created > 30 mins ago still unpaid, cancels them, and logs activity. Stock release is handled by release_card_stock_on_terminal_payment trigger.';

NOTIFY pgrst, 'reload schema';
