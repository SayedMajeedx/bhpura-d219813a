-- Staff take a gift card on an order typed in the admin (the owner's report of 2026-11-23: "no
-- way to pay by gift card in the admin"). An order typed in the admin is saved as a draft and
-- stays one until its first stage step, and the card was refused on a draft (ORDER_NOT_PAYABLE),
-- so the order page never offered it on the order a customer at the counter wanted to pay.
--
-- Taking a card on a draft now confirms it first, in the same transaction, as approving a
-- transfer does (`approve_benefit_payment` sets the order `confirmed`): the order is placed, its
-- stock is held by the stock engine (a draft holds none) and it counts as sold. A card that
-- cannot be taken (unknown, empty, expired, another currency, nothing owed) leaves the draft as
-- it was, since the whole call is undone. A shopper's card at checkout is not touched
-- (`redeem_gift_card_at_checkout`), and `gift_card_take_on_order` keeps refusing a draft.
--
-- The live definition of migration 20261102100000 with the draft step added and `confirmed` in
-- the answer.
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
  v_confirmed boolean := false;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
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

  -- A draft is confirmed before the card is taken: paying for it places it.
  IF lower(COALESCE(v_order.status, '')) = 'draft' THEN
    UPDATE public.orders SET status = 'confirmed', updated_at = now() WHERE id = p_order_id;
    v_confirmed := true;
  END IF;

  RETURN public.gift_card_take_on_order(p_order_id, p_code, p_amount, auth.uid())
    || jsonb_build_object('confirmed', v_confirmed);
END;
$function$;

REVOKE ALL ON FUNCTION public.redeem_gift_card_on_order(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_gift_card_on_order(uuid, text, numeric) TO authenticated, service_role;
