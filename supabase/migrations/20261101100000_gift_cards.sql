-- Gift cards, step one (docs/gift-cards-plan.md): a store issues cards and its staff take them as
-- payment on an order. A card is a payment, never a discount (the owner's decision of
-- 2026-10-31): the order keeps its full price and its VAT, and the card's part is money collected
-- (`orders.advance_paid`, with `orders.gift_card_paid` saying how much of it came from cards).
--
-- A card's balance moves only through the functions below, and every move is a row of
-- `gift_card_movements`, so the balance is always the sum of its moves. No screen writes either
-- table. Staff with `manage_orders` issue, void and take cards; the checkout comes in step two.
--
-- Until step two teaches the card charge and the transfer approval about a card's part, a card
-- that pays an order by card or by transfer must pay all that is still owed (a transfer or a card
-- charge after it would ask for the whole total again); on a cash, pickup or staff order it may
-- pay a part and the rest is collected as before (`courier_complete_delivery` collects what is
-- left). When an order is cancelled, refunded, voided or failed, what cards paid goes back to the
-- cards, never to cash.

CREATE TABLE IF NOT EXISTS public.gift_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  -- As printed and sent: XXXX-XXXX-XXXX from letters and digits that cannot be misread.
  code text NOT NULL,
  currency text NOT NULL,
  initial_amount numeric(12, 3) NOT NULL CHECK (initial_amount > 0 AND initial_amount <= 100000),
  balance numeric(12, 3) NOT NULL CHECK (balance >= 0 AND balance <= initial_amount),
  expires_on date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  recipient_name text CHECK (char_length(recipient_name) <= 120),
  purchaser_name text CHECK (char_length(purchaser_name) <= 120),
  note text CHECK (char_length(note) <= 500),
  -- The order that sold the card, when it was sold through one.
  source_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  issued_by uuid,
  issued_at timestamptz NOT NULL DEFAULT now(),
  voided_by uuid,
  voided_at timestamptz,
  void_reason text CHECK (char_length(void_reason) <= 500),
  UNIQUE (brand_id, code)
);

CREATE INDEX IF NOT EXISTS gift_cards_brand_issued ON public.gift_cards (brand_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS public.gift_card_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id uuid NOT NULL REFERENCES public.gift_cards(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  -- issued (+), redeemed (−, on an order), returned (+, from a released order), voided (−).
  kind text NOT NULL CHECK (kind IN ('issued', 'redeemed', 'returned', 'voided')),
  amount numeric(12, 3) NOT NULL CHECK (amount <> 0),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  note text CHECK (char_length(note) <= 500)
);

CREATE INDEX IF NOT EXISTS gift_card_movements_card ON public.gift_card_movements (gift_card_id, created_at);
CREATE INDEX IF NOT EXISTS gift_card_movements_order ON public.gift_card_movements (order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gift_card_paid numeric(12, 3) NOT NULL DEFAULT 0;

-- Staff read their store's cards and moves; nobody writes them but the functions below.
ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_card_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gift_cards, public.gift_card_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gift_cards, public.gift_card_movements TO authenticated;
GRANT ALL ON TABLE public.gift_cards, public.gift_card_movements TO service_role;

DROP POLICY IF EXISTS "Staff read their store's gift cards" ON public.gift_cards;
CREATE POLICY "Staff read their store's gift cards" ON public.gift_cards
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));
DROP POLICY IF EXISTS "Staff read their store's gift card moves" ON public.gift_card_movements;
CREATE POLICY "Staff read their store's gift card moves" ON public.gift_card_movements
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

-- A new card's code: twelve characters from 31 that cannot be misread (no 0/O, 1/I/L), in three
-- groups, about 59 bits of chance.
CREATE OR REPLACE FUNCTION public.new_gift_card_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public'
AS $function$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_code text := '';
BEGIN
  FOR i IN 0..11 LOOP
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 31) + 1, 1);
    IF i IN (3, 7) THEN
      v_code := v_code || '-';
    END IF;
  END LOOP;
  RETURN v_code;
END;
$function$;

REVOKE ALL ON FUNCTION public.new_gift_card_code() FROM PUBLIC, anon, authenticated;

-- A code as a person may type it: any case, with or without its dashes or spaces.
CREATE OR REPLACE FUNCTION public.gift_card_code_typed(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN length(regexp_replace(upper(COALESCE(p_code, '')), '[^A-Z0-9]', '', 'g')) = 12 THEN
      substr(regexp_replace(upper(p_code), '[^A-Z0-9]', '', 'g'), 1, 4) || '-' ||
      substr(regexp_replace(upper(p_code), '[^A-Z0-9]', '', 'g'), 5, 4) || '-' ||
      substr(regexp_replace(upper(p_code), '[^A-Z0-9]', '', 'g'), 9, 4)
    ELSE NULL
  END;
$function$;

-- Who may handle a store's cards: its staff with manage_orders.
CREATE OR REPLACE FUNCTION public.gift_card_staff(p_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT p_brand_id IS NOT NULL
     AND public.can_access_brand(p_brand_id)
     AND public.has_permission('manage_orders');
$function$;

REVOKE ALL ON FUNCTION public.gift_card_staff(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.issue_gift_card(
  p_brand_id uuid,
  p_amount numeric,
  p_recipient_name text DEFAULT NULL,
  p_purchaser_name text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_expires_on date DEFAULT NULL,
  p_source_order_id uuid DEFAULT NULL
)
RETURNS public.gift_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_currency text;
  v_card public.gift_cards;
  v_try integer := 0;
BEGIN
  IF NOT public.gift_card_staff(p_brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'GIFT_CARD_AMOUNT_INVALID';
  END IF;
  IF p_expires_on IS NOT NULL AND p_expires_on < current_date THEN
    RAISE EXCEPTION 'GIFT_CARD_EXPIRY_PAST';
  END IF;
  IF p_source_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = p_source_order_id AND brand_id = p_brand_id
  ) THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  SELECT COALESCE(NULLIF(btrim(currency), ''), 'BHD') INTO v_currency
    FROM public.business_settings WHERE brand_id = p_brand_id;

  LOOP
    v_try := v_try + 1;
    BEGIN
      INSERT INTO public.gift_cards (
        brand_id, code, currency, initial_amount, balance, expires_on, recipient_name,
        purchaser_name, note, source_order_id, issued_by
      ) VALUES (
        p_brand_id, public.new_gift_card_code(), COALESCE(v_currency, 'BHD'), round(p_amount, 3),
        round(p_amount, 3), p_expires_on, NULLIF(btrim(p_recipient_name), ''),
        NULLIF(btrim(p_purchaser_name), ''), NULLIF(btrim(p_note), ''), p_source_order_id, auth.uid()
      ) RETURNING * INTO v_card;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= 5 THEN RAISE; END IF;
    END;
  END LOOP;

  INSERT INTO public.gift_card_movements (gift_card_id, brand_id, kind, amount, order_id, created_by)
  VALUES (v_card.id, p_brand_id, 'issued', v_card.initial_amount, p_source_order_id, auth.uid());

  RETURN v_card;
END;
$function$;

REVOKE ALL ON FUNCTION public.issue_gift_card(uuid, numeric, text, text, text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_gift_card(uuid, numeric, text, text, text, date, uuid)
  TO authenticated, service_role;

-- A card taken out of use: what it held is written off (a move of its own), and it stays on record
-- with who and why.
CREATE OR REPLACE FUNCTION public.void_gift_card(p_card_id uuid, p_reason text)
RETURNS public.gift_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_card public.gift_cards;
BEGIN
  SELECT * INTO v_card FROM public.gift_cards WHERE id = p_card_id FOR UPDATE;
  IF v_card.id IS NULL OR NOT public.gift_card_staff(v_card.brand_id) THEN
    RAISE EXCEPTION 'GIFT_CARD_NOT_FOUND';
  END IF;
  IF v_card.status = 'voided' THEN
    RAISE EXCEPTION 'GIFT_CARD_VOIDED';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'GIFT_CARD_REASON_REQUIRED';
  END IF;

  IF v_card.balance > 0 THEN
    INSERT INTO public.gift_card_movements (gift_card_id, brand_id, kind, amount, created_by, note)
    VALUES (v_card.id, v_card.brand_id, 'voided', -v_card.balance, auth.uid(), btrim(p_reason));
  END IF;

  UPDATE public.gift_cards
     SET status = 'voided', balance = 0, voided_by = auth.uid(), voided_at = now(),
         void_reason = left(btrim(p_reason), 500)
   WHERE id = v_card.id
  RETURNING * INTO v_card;
  RETURN v_card;
END;
$function$;

REVOKE ALL ON FUNCTION public.void_gift_card(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_gift_card(uuid, text) TO authenticated, service_role;

-- A card taken as payment on one of the store's orders: at most its balance and what the order
-- still owes (or the amount asked, when less). The card's part is money collected, so the order's
-- payment state follows (`trg_orders_payment_amounts` settles paid against part paid).
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
  v_take numeric;
  v_status text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL OR NOT public.gift_card_staff(v_order.brand_id) THEN
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

  -- A card charge or a transfer still to come would ask for the whole total again: until the
  -- checkout's step, a card on such an order pays all that is owed.
  IF lower(COALESCE(v_order.payment_method, '')) IN ('card', 'benefit') AND v_take < v_owed THEN
    RAISE EXCEPTION 'GIFT_CARD_MUST_COVER_ONLINE';
  END IF;

  INSERT INTO public.gift_card_movements (gift_card_id, brand_id, kind, amount, order_id, created_by)
  VALUES (v_card.id, v_card.brand_id, 'redeemed', -v_take, v_order.id, auth.uid());
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

REVOKE ALL ON FUNCTION public.redeem_gift_card_on_order(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_gift_card_on_order(uuid, text, numeric) TO authenticated, service_role;

-- An order that is cancelled, refunded, voided or failed gives back what cards paid on it, to the
-- cards (a voided card takes nothing back). The order's collected money and payment state drop by
-- the same amount, whoever wrote the row. Named to run after trg_orders_payment_amounts.
CREATE OR REPLACE FUNCTION public.orders_gift_cards_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_released_before boolean;
  v_released_now boolean;
  v_move record;
  v_left numeric;
BEGIN
  IF COALESCE(NEW.gift_card_paid, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  v_released_before := lower(COALESCE(OLD.status, '')) IN ('cancelled', 'canceled', 'refunded', 'voided', 'failed')
    OR lower(COALESCE(OLD.payment_status, '')) = 'refunded';
  v_released_now := lower(COALESCE(NEW.status, '')) IN ('cancelled', 'canceled', 'refunded', 'voided', 'failed')
    OR lower(COALESCE(NEW.payment_status, '')) = 'refunded';
  IF v_released_before OR NOT v_released_now THEN
    RETURN NEW;
  END IF;

  -- Each card gets back what it paid on this order and has not had back yet.
  FOR v_move IN
    SELECT m.gift_card_id, -sum(m.amount) AS owed
      FROM public.gift_card_movements m
     WHERE m.order_id = NEW.id AND m.kind IN ('redeemed', 'returned')
     GROUP BY m.gift_card_id
    HAVING -sum(m.amount) > 0
  LOOP
    UPDATE public.gift_cards
       SET balance = least(initial_amount, balance + v_move.owed)
     WHERE id = v_move.gift_card_id AND status = 'active';
    IF FOUND THEN
      INSERT INTO public.gift_card_movements (gift_card_id, brand_id, kind, amount, order_id, created_by)
      VALUES (v_move.gift_card_id, NEW.brand_id, 'returned', v_move.owed, NEW.id, auth.uid());
    END IF;
  END LOOP;

  v_left := greatest(0, COALESCE(NEW.advance_paid, 0) - NEW.gift_card_paid);
  NEW.advance_paid := v_left;
  NEW.gift_card_paid := 0;
  IF lower(COALESCE(NEW.payment_status, '')) IN ('paid', 'partially_paid', 'partial') THEN
    NEW.payment_status := CASE WHEN v_left <= 0 THEN 'unpaid' ELSE 'partially_paid' END;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.orders_gift_cards_return() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_z_gift_cards_return ON public.orders;
CREATE TRIGGER trg_orders_z_gift_cards_return
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_gift_cards_return();

-- The new column can be read by staff like the order's other money columns.
GRANT SELECT (gift_card_paid) ON public.orders TO authenticated;
