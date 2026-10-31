-- Gift cards, step two (docs/gift-cards-plan.md): a shopper pays with a gift card at checkout,
-- and the card charge and the transfer approval ask only for what the card leaves.
--
-- A card is a payment (the owner's decision of 2026-10-31): its part is money collected
-- (`orders.advance_paid`, `orders.gift_card_paid`), so what a card charge or a transfer still has
-- to bring is what the order asks up front (its advance, a booking's deposit, else its total) less
-- what cards paid. The card charge works that out in `orderChargePlan`
-- (src/lib/payments/charge-plan.ts); this migration teaches the transfer approval the same.

-- One place takes a card on an order, for staff and for checkout alike: at most the card's balance
-- and what the order still owes (or the amount asked, when less), a move on the card, and the
-- order's collected money and payment state. Server-only: the two functions below decide who may.
CREATE OR REPLACE FUNCTION public.gift_card_take_on_order(
  p_order_id uuid,
  p_code text,
  p_amount numeric,
  p_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders;
  v_card public.gift_cards;
  v_owed numeric;
  v_take numeric;
  v_status text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  SELECT * INTO v_card FROM public.gift_cards
   WHERE brand_id = v_order.brand_id AND code = public.gift_card_code_typed(p_code)
   FOR UPDATE;
  IF v_card.id IS NULL THEN
    RAISE EXCEPTION 'GIFT_CARD_NOT_FOUND';
  END IF;
  IF v_card.status = 'voided' THEN
    RAISE EXCEPTION 'GIFT_CARD_VOIDED';
  END IF;
  IF v_card.expires_on IS NOT NULL AND v_card.expires_on < current_date THEN
    RAISE EXCEPTION 'GIFT_CARD_EXPIRED';
  END IF;
  IF v_card.balance <= 0 THEN
    RAISE EXCEPTION 'GIFT_CARD_EMPTY';
  END IF;
  IF upper(COALESCE(NULLIF(btrim(v_order.currency), ''), v_card.currency)) <> upper(v_card.currency) THEN
    RAISE EXCEPTION 'GIFT_CARD_CURRENCY';
  END IF;

  v_status := lower(COALESCE(v_order.status, ''));
  IF v_status IN ('draft', 'cancelled', 'canceled', 'refunded', 'voided', 'failed', 'returned')
     OR lower(COALESCE(v_order.payment_status, '')) = 'refunded' THEN
    RAISE EXCEPTION 'ORDER_NOT_PAYABLE';
  END IF;

  v_owed := round(COALESCE(v_order.total, 0) - COALESCE(v_order.advance_paid, 0), 3);
  IF v_owed <= 0 THEN
    RAISE EXCEPTION 'ORDER_NOTHING_OWED';
  END IF;
  IF p_amount IS NOT NULL AND p_amount <= 0 THEN
    RAISE EXCEPTION 'GIFT_CARD_AMOUNT_INVALID';
  END IF;

  v_take := least(v_card.balance, v_owed, COALESCE(round(p_amount, 3), v_owed));

  INSERT INTO public.gift_card_movements (gift_card_id, brand_id, kind, amount, order_id, created_by)
  VALUES (v_card.id, v_card.brand_id, 'redeemed', -v_take, v_order.id, p_by);
  UPDATE public.gift_cards SET balance = balance - v_take WHERE id = v_card.id;

  UPDATE public.orders
     SET gift_card_paid = COALESCE(gift_card_paid, 0) + v_take,
         advance_paid = COALESCE(advance_paid, 0) + v_take,
         payment_status = CASE
           WHEN COALESCE(advance_paid, 0) + v_take >= total THEN 'paid'
           ELSE 'partially_paid'
         END
   WHERE id = v_order.id;

  RETURN jsonb_build_object(
    'amount', v_take,
    'balance', v_card.balance - v_take,
    'owed', v_owed - v_take
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.gift_card_take_on_order(uuid, text, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_card_take_on_order(uuid, text, numeric, uuid) TO service_role;

-- Staff take a card on one of their store's orders. On a card order a part payment still waits:
-- a card charge already started would be checked against the amount it was started for.
CREATE OR REPLACE FUNCTION public.redeem_gift_card_on_order(
  p_order_id uuid,
  p_code text,
  p_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders;
  v_card public.gift_cards;
  v_owed numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.id IS NULL OR NOT public.gift_card_staff(v_order.brand_id) THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF lower(COALESCE(v_order.payment_method, '')) IN ('card', 'tap') THEN
    SELECT * INTO v_card FROM public.gift_cards
     WHERE brand_id = v_order.brand_id AND code = public.gift_card_code_typed(p_code);
    v_owed := round(COALESCE(v_order.total, 0) - COALESCE(v_order.advance_paid, 0), 3);
    IF v_card.id IS NOT NULL AND v_owed > 0
       AND least(v_card.balance, COALESCE(round(p_amount, 3), v_owed)) < v_owed THEN
      RAISE EXCEPTION 'GIFT_CARD_MUST_COVER_ONLINE';
    END IF;
  END IF;

  RETURN public.gift_card_take_on_order(p_order_id, p_code, p_amount, auth.uid());
END;
$function$;

REVOKE ALL ON FUNCTION public.redeem_gift_card_on_order(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_gift_card_on_order(uuid, text, numeric) TO authenticated, service_role;

-- A shopper's card on the order they have just placed, called by the server
-- (`redeemGiftCardAtCheckout`, which checks the order's confirmation token): a storefront order
-- of the last hour, nothing paid yet and no card on it, before any card charge or transfer.
CREATE OR REPLACE FUNCTION public.redeem_gift_card_at_checkout(p_order_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.id IS NULL OR v_order.channel IS DISTINCT FROM 'storefront'
     OR v_order.created_at < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  IF lower(COALESCE(v_order.payment_status, '')) NOT IN ('', 'unpaid', 'pending')
     OR COALESCE(v_order.advance_paid, 0) > 0 OR COALESCE(v_order.gift_card_paid, 0) > 0 THEN
    RAISE EXCEPTION 'ORDER_ALREADY_PAYING';
  END IF;
  RETURN public.gift_card_take_on_order(p_order_id, p_code, NULL, NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.redeem_gift_card_at_checkout(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_gift_card_at_checkout(uuid, text) TO service_role;

-- What a card holds, for the checkout's preview (the server asks, rate-limited): its balance,
-- currency and end date while it can pay, nothing for any other code.
CREATE OR REPLACE FUNCTION public.gift_card_balance_for_checkout(p_slug text, p_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('balance', c.balance, 'currency', c.currency, 'expires_on', c.expires_on)
    FROM public.gift_cards c
    JOIN public.brands b ON b.id = c.brand_id
   WHERE b.slug = p_slug
     AND c.code = public.gift_card_code_typed(p_code)
     AND c.status = 'active'
     AND c.balance > 0
     AND (c.expires_on IS NULL OR c.expires_on >= current_date);
$function$;

REVOKE ALL ON FUNCTION public.gift_card_balance_for_checkout(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_card_balance_for_checkout(text, text) TO service_role;

-- The transfer approval (the live copy of migration 20261026100000) with two changes for cards:
-- a part paid by gift cards alone is not the transfer already approved, and the approval adds to
-- what was collected rather than writing over it.
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
  -- Paid, or a part paid beyond what gift cards paid: the transfer was approved already.
  IF v_order.payment_status = 'paid'
     OR (v_order.payment_status = 'partially_paid'
         AND COALESCE(v_order.advance_paid, 0) > COALESCE(v_order.gift_card_paid, 0) + 0.0005) THEN
    RETURN jsonb_build_object('approved', true, 'already_paid', true);
  END IF;

  -- An order placed under an advance rule is paid in part: the advance is recorded and
  -- the balance stays due. Nothing is owed in advance when the rule does not reach it.
  -- Without an advance, a booking's own deposit is what its transfer paid (the card charge
  -- reads the two in the same order: orderChargePlan). What gift cards paid counts towards it.
  v_advance := public.order_advance_due(p_order_id);
  IF v_advance IS NULL THEN
    SELECT b.deposit_amount INTO v_advance
      FROM public.bookings b
     WHERE b.order_id = p_order_id AND b.deposit_amount > 0
     LIMIT 1;
  END IF;
  v_part := v_advance IS NOT NULL AND v_advance < v_order.total;

  UPDATE public.orders
  SET status = 'confirmed',
      payment_status = CASE WHEN v_part THEN 'partially_paid' ELSE 'paid' END,
      advance_paid = CASE
        WHEN v_part THEN GREATEST(v_advance, COALESCE(advance_paid, 0))
        ELSE total
      END,
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
    -- The payment is recorded, and the booking was not confirmed: its day was taken
    -- after its hold ran out (sync_bookings_with_order).
    'slot_taken', EXISTS (
      SELECT 1 FROM public.bookings b
       WHERE b.order_id = p_order_id AND b.late_payment_slot_taken_at IS NOT NULL
    ),
    'receipt_delete_after', CASE
      WHEN v_order.benefit_receipt_key IS NOT NULL THEN now() + interval '30 days'
    END
  );
END;
$function$;
