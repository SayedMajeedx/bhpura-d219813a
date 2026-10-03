-- Advance payment, enforced by the database.
--
-- When a store turns on business_settings.advance_payment_enabled, a storefront
-- order must be paid in part online before it is complete:
--
--   * orders.advance_percent keeps the percentage that applied when the order was
--     placed (a later change to the store's setting does not move it). NULL means
--     no advance was asked for.
--   * a storefront order cannot be placed with cash on delivery ('cod'): the
--     insert is refused with ADVANCE_PAYMENT_REQUIRED. Orders made by staff
--     (channel 'admin') are never refused or tagged.
--   * the card charge asks for the advance (src/lib/payments/booking-deposit.server.ts)
--     and approving a BenefitPay receipt records the advance, not the whole total,
--     leaving the order part-paid with the balance still due.
--
-- Additive: a nullable column, a trigger and one function replaced (the live
-- approve_benefit_payment, with the advance branch added).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS advance_percent numeric(5, 2)
    CHECK (advance_percent IS NULL OR (advance_percent > 0 AND advance_percent <= 100));

CREATE OR REPLACE FUNCTION public.apply_advance_payment_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
  v_percent numeric;
BEGIN
  IF NEW.channel IS DISTINCT FROM 'storefront' OR NEW.brand_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT s.advance_payment_enabled, s.advance_payment_percent
    INTO v_enabled, v_percent
    FROM public.business_settings s
   WHERE s.brand_id = NEW.brand_id;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN NEW;
  END IF;
  IF NEW.payment_method = 'cod' THEN
    RAISE EXCEPTION 'ADVANCE_PAYMENT_REQUIRED'
      USING HINT = 'This store asks for an advance payment by card or BenefitPay.';
  END IF;
  NEW.advance_percent := v_percent;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_advance_payment_rule() FROM PUBLIC, anon, authenticated;

-- Named to sort last, so the other insert triggers (brand default, invoice number) ran first.
DROP TRIGGER IF EXISTS trg_orders_z_advance_payment ON public.orders;
CREATE TRIGGER trg_orders_z_advance_payment
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.apply_advance_payment_rule();

-- The advance an order asks for, in fils: its percentage of the total, rounded up
-- (the same rule as depositOf in src/lib/payments/charge-plan.ts). NULL when no advance
-- applies or it would be the whole total.
CREATE OR REPLACE FUNCTION public.order_advance_amount(p_total numeric, p_percent numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_percent IS NOT NULL AND p_percent > 0 AND p_percent < 100
    THEN ceil(p_total * p_percent * 10 - 0.000000001) / 1000
  END
$function$;

CREATE OR REPLACE FUNCTION public.approve_benefit_payment(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_advance numeric;
  v_part boolean;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT public.is_admin() OR NOT public.can_access_brand(v_order.brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_order.payment_method <> 'benefit' OR v_order.benefit_receipt_key IS NULL THEN
    RAISE EXCEPTION 'BENEFIT_RECEIPT_NOT_FOUND';
  END IF;
  IF v_order.payment_status IN ('paid', 'partially_paid') THEN
    RETURN jsonb_build_object('approved', true, 'already_paid', true);
  END IF;

  -- An order placed under an advance rule is paid in part: the advance is recorded
  -- and the balance stays due.
  v_advance := public.order_advance_amount(v_order.total, v_order.advance_percent);
  v_part := v_advance IS NOT NULL AND v_advance < v_order.total;

  UPDATE public.orders
  SET status = 'confirmed',
      payment_status = CASE WHEN v_part THEN 'partially_paid' ELSE 'paid' END,
      advance_paid = CASE WHEN v_part THEN v_advance ELSE total END,
      benefit_verified_at = now(),
      benefit_verified_by = auth.uid(),
      benefit_receipt_delete_after = now() + interval '30 days',
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'approved', true,
    'advance_only', v_part,
    'receipt_delete_after', now() + interval '30 days'
  );
END;
$function$;
