-- Undoing a gift card's payment on an order (the owner's report of 2026-11-23: "I used a wrong
-- gift card and there is no way to revert the payment now, not in the order page or the gift card
-- page"). A card's payment was only ever given back when its order was released
-- (`orders_gift_cards_return`), so a card taken by mistake stayed spent on an order that was going
-- ahead.
--
-- `undo_gift_card_payment` gives one card back all it still holds on one order (what it paid less
-- what was given back), the order staying as it is otherwise:
--   * the card gets the amount back (a `returned` move naming the order, its balance up, never
--     above what it was issued with), so it can pay again;
--   * the order's collected money and what cards paid go down by the same amount, and its payment
--     state follows (unpaid with nothing left collected, else paid in part); another payment on it
--     (cash typed by staff, an approved transfer) is kept;
--   * the order's activity says which card and how much.
-- An order a card confirmed from a draft stays confirmed: its stock was held and the right card can
-- pay it next. A voided card takes nothing back (its money was written off), so its payment is not
-- undone (`GIFT_CARD_VOIDED`). Staff who handle orders (`gift_card_staff`), one call per card.
-- The reports count spent cards as redeemed plus returned moves, so an undone payment nets out.
CREATE OR REPLACE FUNCTION public.undo_gift_card_payment(p_order_id uuid, p_card_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders;
  v_card public.gift_cards;
  v_held numeric;
  v_paid numeric;
  v_balance numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR NOT public.gift_card_staff(v_order.brand_id) THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  SELECT * INTO v_card FROM public.gift_cards
   WHERE id = p_card_id AND brand_id = v_order.brand_id
   FOR UPDATE;
  IF v_card.id IS NULL THEN
    RAISE EXCEPTION 'GIFT_CARD_NOT_FOUND';
  END IF;

  SELECT round(COALESCE(-sum(m.amount), 0), 3) INTO v_held
    FROM public.gift_card_movements m
   WHERE m.order_id = v_order.id AND m.gift_card_id = v_card.id
     AND m.kind IN ('redeemed', 'returned');
  IF v_held <= 0 THEN
    RAISE EXCEPTION 'GIFT_CARD_NOTHING_TO_UNDO';
  END IF;
  IF v_card.status = 'voided' THEN
    RAISE EXCEPTION 'GIFT_CARD_VOIDED';
  END IF;

  v_balance := least(v_card.initial_amount, v_card.balance + v_held);
  INSERT INTO public.gift_card_movements (gift_card_id, brand_id, kind, amount, order_id, created_by, note)
  VALUES (v_card.id, v_card.brand_id, 'returned', v_held, v_order.id, auth.uid(), 'Payment undone');
  UPDATE public.gift_cards SET balance = v_balance WHERE id = v_card.id;

  v_paid := greatest(0, round(COALESCE(v_order.advance_paid, 0) - v_held, 3));
  UPDATE public.orders
     SET gift_card_paid = greatest(0, COALESCE(gift_card_paid, 0) - v_held),
         advance_paid = v_paid,
         payment_status = CASE
           WHEN v_paid <= 0 THEN 'unpaid'
           WHEN v_paid < COALESCE(total, 0) THEN 'partially_paid'
           ELSE 'paid'
         END,
         updated_at = now()
   WHERE id = v_order.id;

  INSERT INTO public.activity_logs (brand_id, user_id, action, message_en, message_ar, order_id)
  VALUES (
    v_order.brand_id,
    auth.uid(),
    'gift_card_payment_undone',
    format('Gift card payment undone: %s back to card …%s.', v_held, right(v_card.code, 4)),
    format('أُلغي الدفع ببطاقة الهدية: أُعيد %s إلى البطاقة …%s.', v_held, right(v_card.code, 4)),
    v_order.id
  );

  RETURN jsonb_build_object(
    'amount', v_held,
    'balance', v_balance,
    'owed', round(greatest(0, COALESCE(v_order.total, 0) - v_paid), 3)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.undo_gift_card_payment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_gift_card_payment(uuid, uuid) TO authenticated, service_role;
