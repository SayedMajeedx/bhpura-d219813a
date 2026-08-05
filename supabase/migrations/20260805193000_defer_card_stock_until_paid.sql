-- Preserve the eager storefront stock reservation while a hosted card payment
-- is unpaid/in progress. Release it only after Tap reports a terminal failure.
-- This prevents two customers from paying for the same last unit.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check CHECK (
  payment_status IN (
    'unpaid', 'paid', 'refunded', 'partially_paid', 'partial', 'failed', 'declined',
    'UNPAID', 'PAID', 'REFUNDED', 'PARTIALLY_PAID', 'FAILED', 'DECLINED'
  )
);

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
  END IF;

  NEW.stock_deducted := false;
  NEW.stock_snapshot := NULL;
  NEW.status := 'cancelled';
  NEW.fulfillment_status := 'cancelled';
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS release_card_stock_on_terminal_payment ON public.orders;
CREATE TRIGGER release_card_stock_on_terminal_payment
BEFORE UPDATE OF payment_status, payment_method ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.release_card_stock_on_terminal_payment();

REVOKE ALL ON FUNCTION public.release_card_stock_on_terminal_payment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_card_stock_on_terminal_payment() TO service_role;

COMMENT ON FUNCTION public.release_card_stock_on_terminal_payment() IS
  'Keeps unpaid card stock reserved and releases it atomically only on a verified failed/declined transition.';

NOTIFY pgrst, 'reload schema';
