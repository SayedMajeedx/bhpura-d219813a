-- An order's payment is one fact, written in one way.
--
-- What went wrong: an order says how it is paid in two columns (payment_status, and
-- advance_paid for what was collected) and each screen wrote only one of them.
--
--   * The orders list's "Validate payment" button wrote payment_status = 'paid' on a transfer
--     order whose customer had only been asked for an advance: the balance was never asked for
--     again, nothing was recorded as collected, and the transfer was never marked as verified.
--   * "Mark delivered" on the order page, and a card paid in full, said 'paid' and left
--     advance_paid behind, so the invoice printed a balance on a paid order and the advance
--     report offered to remind a customer who owed nothing.
--   * An advance that was approved sent the customer no confirmation, left the order "on hold",
--     and its receipt could still be rejected (which cancels the order).
--
-- The rules below are held by the database, so no screen can write a half state:
--
--   1. 'paid' means the whole total is collected: advance_paid follows it, and an order whose
--      collected amount reaches its total is 'paid' (trg_orders_payment_amounts).
--   2. A transfer is approved by approve_benefit_payment only (the advance when the order was
--      placed under an advance rule, everything otherwise), with or without an uploaded receipt
--      (a staff-made order has none).
--   3. An approved transfer cannot be rejected afterwards.
--   4. The first approval (in full or of the advance) releases the hold and tells the customer;
--      collecting the balance later does not say "your receipt was approved" a second time.

-- 1. 'paid' and the collected amount always agree -------------------------------------------

CREATE OR REPLACE FUNCTION public.orders_payment_amounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text := lower(COALESCE(NEW.payment_status, ''));
BEGIN
  IF COALESCE(NEW.total, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Paid in part, and the parts add up to the total: it is paid.
  IF v_status IN ('partially_paid', 'partial') AND COALESCE(NEW.advance_paid, 0) >= NEW.total THEN
    NEW.payment_status := 'paid';
    v_status := 'paid';
  END IF;

  -- Paid: everything was collected, whoever recorded it and however.
  IF v_status = 'paid' AND COALESCE(NEW.advance_paid, 0) < NEW.total THEN
    NEW.advance_paid := NEW.total;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.orders_payment_amounts() FROM PUBLIC, anon, authenticated;

-- Named to run before trg_orders_sync_payment_fulfillment, which reads the status it settles.
DROP TRIGGER IF EXISTS trg_orders_payment_amounts ON public.orders;
CREATE TRIGGER trg_orders_payment_amounts
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_payment_amounts();

-- 2. Approving a transfer --------------------------------------------------------------------
-- The previous definition, with two changes: any transfer method the order workflow asks to
-- validate is accepted (it only took 'benefit'), and an uploaded receipt is no longer required
-- (a staff-made order has none; the receipt's deletion date is set only when there is one).

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
  IF lower(COALESCE(v_order.payment_method, '')) NOT IN (
       'benefit', 'benefitpay', 'benefit_pay', 'bank_transfer'
     ) THEN
    RAISE EXCEPTION 'NOT_A_TRANSFER_ORDER';
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
      benefit_receipt_delete_after = CASE
        WHEN benefit_receipt_key IS NOT NULL THEN now() + interval '30 days'
        ELSE benefit_receipt_delete_after
      END,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'approved', true,
    'advance_only', v_part,
    'receipt_delete_after', CASE
      WHEN v_order.benefit_receipt_key IS NOT NULL THEN now() + interval '30 days'
    END
  );
END;
$function$;

-- 3. An approved transfer is not rejected afterwards -----------------------------------------
-- The previous definitions, refusing an approved advance ('partially_paid') as they refused
-- 'paid': rejecting cancels the order and tells the customer their payment was not accepted.

CREATE OR REPLACE FUNCTION public.reject_benefit_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_order public.orders%ROWTYPE;
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
    RAISE EXCEPTION 'PAYMENT_ALREADY_APPROVED';
  END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      payment_status = 'unpaid',
      benefit_receipt_rejected_at = now(),
      benefit_receipt_rejected_by = auth.uid(),
      benefit_receipt_delete_after = now(),
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'rejected', true,
    'object_key', v_order.benefit_receipt_key
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_benefit_payment(p_order_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_order public.orders%ROWTYPE;
DECLARE v_reason text := NULLIF(trim(p_reason), '');
BEGIN
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'REJECTION_REASON_REQUIRED';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'REJECTION_REASON_TOO_LONG';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT public.is_admin() OR NOT public.can_access_brand(v_order.brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_order.payment_method <> 'benefit' OR v_order.benefit_receipt_key IS NULL THEN
    RAISE EXCEPTION 'BENEFIT_RECEIPT_NOT_FOUND';
  END IF;
  IF v_order.payment_status IN ('paid', 'partially_paid') THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_APPROVED';
  END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      payment_status = 'unpaid',
      benefit_receipt_rejected_at = now(),
      benefit_receipt_rejected_by = auth.uid(),
      benefit_receipt_rejection_reason = v_reason,
      benefit_receipt_delete_after = now(),
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'rejected', true,
    'object_key', v_order.benefit_receipt_key,
    'reason', v_reason
  );
END;
$function$;

-- 4a. The first approval releases the hold ---------------------------------------------------
-- The previous definition released it when the order became 'paid'. An approved advance (the
-- part due up front; the balance is collected on delivery) releases it as well.

CREATE OR REPLACE FUNCTION public.trg_orders_payment_fulfillment_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new text := lower(COALESCE(NEW.payment_status, ''));
  v_old text := lower(COALESCE(OLD.payment_status, ''));
BEGIN
  IF (v_new = 'paid' AND v_old <> 'paid')
     OR (v_new = 'partially_paid' AND v_old NOT IN ('paid', 'partially_paid')) THEN
    IF NEW.fulfillment_status IN ('ON_HOLD', 'on_hold', 'unassigned') THEN
      NEW.fulfillment_status := 'NEEDS_PACKING';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4b. The customer is told once, at the first approval ---------------------------------------
-- The previous definitions, with the "payment approved" condition changed from "became paid"
-- to "was approved for the first time" (paid or partially paid, from neither).

CREATE OR REPLACE FUNCTION public.automate_order_email_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_order_email_event(NEW.id, NEW.brand_id, 'order_placed');
    RETURN NEW;
  END IF;

  IF lower(COALESCE(NEW.payment_method, '')) IN (
       'benefit',
       'benefitpay',
       'benefit_pay',
       'bank_transfer'
     )
     AND lower(COALESCE(NEW.payment_status, '')) IN ('paid', 'partially_paid')
     AND lower(COALESCE(OLD.payment_status, '')) NOT IN ('paid', 'partially_paid') THEN
    PERFORM public.enqueue_order_email_event(
      NEW.id,
      NEW.brand_id,
      'benefit_payment_approved'
    );
  END IF;

  IF lower(COALESCE(NEW.payment_method, '')) IN (
       'benefit',
       'benefitpay',
       'benefit_pay',
       'bank_transfer'
     )
     AND NEW.benefit_receipt_rejected_at IS NOT NULL
     AND OLD.benefit_receipt_rejected_at IS NULL THEN
    PERFORM public.enqueue_order_email_event(
      NEW.id,
      NEW.brand_id,
      'benefit_payment_rejected'
    );
  END IF;

  IF (
    (lower(COALESCE(NEW.status, '')) = 'completed'
      AND lower(COALESCE(OLD.status, '')) <> 'completed')
    OR (
      lower(COALESCE(NEW.fulfillment_status, '')) IN ('delivered', 'completed')
      AND lower(COALESCE(OLD.fulfillment_status, '')) NOT IN ('delivered', 'completed')
    )
  ) THEN
    PERFORM public.enqueue_order_email_event(
      NEW.id,
      NEW.brand_id,
      'order_delivered'
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.automate_order_whatsapp_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.whatsapp_transactional_opt_in_at IS NULL THEN RETURN NEW; END IF;

  IF lower(COALESCE(NEW.payment_method, '')) IN (
       'benefit', 'benefitpay', 'benefit_pay', 'bank_transfer'
     )
     AND lower(COALESCE(NEW.payment_status, '')) IN ('paid', 'partially_paid')
     AND lower(COALESCE(OLD.payment_status, '')) NOT IN ('paid', 'partially_paid') THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'benefit_payment_approved');
  END IF;

  IF lower(COALESCE(NEW.payment_method, '')) IN (
       'benefit', 'benefitpay', 'benefit_pay', 'bank_transfer'
     )
     AND NEW.benefit_receipt_rejected_at IS NOT NULL
     AND OLD.benefit_receipt_rejected_at IS NULL THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'benefit_payment_rejected');
  END IF;

  IF lower(COALESCE(NEW.fulfillment_method, '')) = 'pickup'
     AND lower(COALESCE(NEW.fulfillment_status, '')) = 'ready_for_pickup'
     AND lower(COALESCE(OLD.fulfillment_status, '')) <> 'ready_for_pickup' THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'ready_for_pickup');
  END IF;

  -- Shipping messages are for deliveries, not pickups or appointments.
  IF lower(COALESCE(NEW.fulfillment_method, '')) NOT IN ('pickup', 'appointment')
     AND lower(COALESCE(NEW.fulfillment_status, '')) IN (
       'shipped', 'assigned', 'out_for_delivery', 'ready_for_delivery'
     )
     AND lower(COALESCE(OLD.fulfillment_status, '')) NOT IN (
       'shipped', 'assigned', 'out_for_delivery', 'ready_for_delivery'
     ) THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'out_for_delivery');
  END IF;

  IF lower(COALESCE(NEW.fulfillment_method, '')) = 'pickup'
     AND (
       lower(COALESCE(NEW.fulfillment_status, '')) IN ('picked_up', 'completed')
       OR lower(COALESCE(NEW.status, '')) = 'completed'
     )
     AND lower(COALESCE(OLD.fulfillment_status, '')) NOT IN ('picked_up', 'completed')
     AND lower(COALESCE(OLD.status, '')) <> 'completed' THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'order_picked_up');
  ELSIF lower(COALESCE(NEW.fulfillment_method, '')) NOT IN ('pickup', 'appointment')
     AND (
       lower(COALESCE(NEW.fulfillment_status, '')) IN ('delivered', 'completed')
       OR lower(COALESCE(NEW.status, '')) = 'completed'
     )
     AND lower(COALESCE(OLD.fulfillment_status, '')) NOT IN ('delivered', 'completed')
     AND lower(COALESCE(OLD.status, '')) <> 'completed' THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'order_delivered');
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. Orders already written in a half state -------------------------------------------------

-- Transfer orders placed under an advance rule that the list marked fully paid: nothing was
-- recorded as collected and the transfer was never verified. They become what the approval
-- would have recorded (the advance, with the balance still due). Two today: Pura #1101 and
-- ZH #1001; an order whose customer chose to pay everything owes its whole total up front and
-- is not touched.
UPDATE public.orders AS o
SET payment_status = 'partially_paid',
    advance_paid = due.amount,
    benefit_verified_at = now(),
    updated_at = now()
FROM (
  SELECT id, public.order_advance_due(id) AS amount
  FROM public.orders
  WHERE payment_status = 'paid'
    AND COALESCE(advance_paid, 0) = 0
    AND benefit_verified_at IS NULL
    AND advance_percent IS NOT NULL
    AND channel = 'storefront'
    AND lower(COALESCE(payment_method, '')) IN ('benefit', 'benefitpay', 'benefit_pay', 'bank_transfer')
    AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'canceled', 'completed')
) AS due
WHERE o.id = due.id
  AND due.amount IS NOT NULL
  AND due.amount > 0
  AND due.amount < o.total;

-- Paid orders that never recorded what was collected (a card paid in full, an order delivered
-- from its own page): everything was collected.
UPDATE public.orders
SET advance_paid = total
WHERE lower(COALESCE(payment_status, '')) = 'paid'
  AND total > 0
  AND COALESCE(advance_paid, 0) < total;

-- An advance approved before this change left its order on hold.
UPDATE public.orders
SET fulfillment_status = 'NEEDS_PACKING'
WHERE lower(COALESCE(payment_status, '')) = 'partially_paid'
  AND fulfillment_status IN ('ON_HOLD', 'on_hold', 'unassigned')
  AND lower(COALESCE(status, '')) NOT IN ('cancelled', 'canceled', 'completed', 'draft');
