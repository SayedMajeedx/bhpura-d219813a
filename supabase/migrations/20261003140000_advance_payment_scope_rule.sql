-- Advance payment, phase 1: the rule decides per order, from its lines.
--
-- What an order owes in advance now depends on the store's scope, so it is worked out in one
-- place, from the order itself (order_advance_due), and everything reads it from there: the
-- card charge (through an RPC), the BenefitPay approval and the cash-on-delivery check.
--
--   * Matching lines only. Under made_to_order, only made-to-order lines count (order_items
--     whose location is 'custom'); their share of the order is taken after discounts and
--     with their share of the tax, never the delivery fee. Under delivery, an order that is
--     delivered counts whole, delivery fee included; any other order owes nothing in advance.
--     made_to_order_or_delivery is both: a delivered order whole, else its made-to-order lines.
--   * The amount is the percentage of that, rounded up to the fils, and never more than the
--     order total.
--   * At insert an order has no lines yet, so cash on delivery is refused when the order is
--     committed (a deferred constraint trigger), not when the row is inserted.
--
-- Additive: functions and triggers only. approve_benefit_payment is replaced (the live
-- definition from 20261003120000, now reading order_advance_due).

CREATE OR REPLACE FUNCTION public.apply_advance_payment_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
  v_percent numeric;
  v_scope text;
BEGIN
  IF NEW.channel IS DISTINCT FROM 'storefront' OR NEW.brand_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT s.advance_payment_enabled, s.advance_payment_percent, s.advance_payment_scope
    INTO v_enabled, v_percent, v_scope
    FROM public.business_settings s
   WHERE s.brand_id = NEW.brand_id;
  IF COALESCE(v_enabled, false) THEN
    NEW.advance_percent := v_percent;
    NEW.advance_scope := COALESCE(v_scope, 'all');
  END IF;
  RETURN NEW;
END;
$function$;

-- What the order owes in advance, or NULL when nothing is asked of it.
CREATE OR REPLACE FUNCTION public.order_advance_due(p_order_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders%ROWTYPE;
  v_lines numeric;
  v_custom numeric;
  v_items numeric;
  v_basis numeric;
  v_delivery boolean;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND OR o.advance_percent IS NULL OR o.advance_percent <= 0 OR COALESCE(o.total, 0) <= 0 THEN
    RETURN NULL;
  END IF;
  v_delivery := o.fulfillment_method = 'delivery';
  SELECT COALESCE(sum(line_total), 0),
         COALESCE(sum(line_total) FILTER (WHERE location = 'custom'), 0)
    INTO v_lines, v_custom
    FROM public.order_items WHERE order_id = o.id;
  -- The order without its delivery fee: discounts and tax are spread over the lines.
  v_items := GREATEST(o.total - COALESCE(o.shipping, 0), 0);
  v_basis := CASE COALESCE(o.advance_scope, 'all')
    WHEN 'delivery' THEN CASE WHEN v_delivery THEN o.total ELSE 0 END
    WHEN 'made_to_order' THEN CASE WHEN v_lines > 0 THEN v_items * v_custom / v_lines ELSE 0 END
    WHEN 'made_to_order_or_delivery' THEN
      CASE WHEN v_delivery THEN o.total WHEN v_lines > 0 THEN v_items * v_custom / v_lines ELSE 0 END
    ELSE o.total
  END;
  IF v_basis <= 0 THEN
    RETURN NULL;
  END IF;
  RETURN LEAST(
    o.total,
    CASE WHEN o.advance_percent >= 100
         THEN round(v_basis, 3)
         ELSE ceil(v_basis * o.advance_percent * 10 - 0.000000001) / 1000 END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.order_advance_due(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_advance_due(uuid) TO service_role;

-- Cash on delivery is refused at commit, once the lines are there to decide whether an
-- advance applies to this order. Staff-made orders (channel 'admin') carry no advance.
CREATE OR REPLACE FUNCTION public.check_advance_payment_cod()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.channel = 'storefront'
     AND NEW.payment_method = 'cod'
     AND NEW.advance_percent IS NOT NULL
     AND public.order_advance_due(NEW.id) IS NOT NULL THEN
    RAISE EXCEPTION 'ADVANCE_PAYMENT_REQUIRED'
      USING HINT = 'This store asks for an advance payment by card or BenefitPay.';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.check_advance_payment_cod() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_advance_cod ON public.orders;
CREATE CONSTRAINT TRIGGER trg_orders_advance_cod
  AFTER INSERT ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_advance_payment_cod();

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

  -- An order placed under an advance rule is paid in part: the advance is recorded and
  -- the balance stays due. Nothing is owed in advance when the rule does not reach it.
  v_advance := public.order_advance_due(p_order_id);
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
