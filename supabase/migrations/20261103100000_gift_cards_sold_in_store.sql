-- Gift cards, step three (docs/gift-cards-plan.md): a card sold in the store, and the reports'
-- lines for cards.
--
-- The owner's decision (2026-10-31): cards are sold in the store first. A card sold is money the
-- store holds until it is spent (a liability), not a sale: no order, no VAT, nothing in the sales
-- figures. The sale is counted when the card is spent, on the order it pays, at its full price
-- and VAT, as every other payment is. So a card says how it was paid when it was sold (cash, the
-- card machine, a transfer), or that it was given (a present, a goodwill credit: nothing came in).
--
-- The reports read the cards' own ledger (`gift_card_movements`): what was sold and given in a
-- period, what was spent and given back on released orders, what was written off, and what the
-- cards held at the period's end (the sum of every move before it: the liability on that day).

ALTER TABLE public.gift_cards
  ADD COLUMN IF NOT EXISTS paid_with text
    CHECK (paid_with IS NULL OR paid_with IN ('cash', 'card', 'transfer'));

COMMENT ON COLUMN public.gift_cards.paid_with IS
  'How the card was paid for when it was sold (cash, card machine, transfer); null when it was given.';

-- The issue function from step one (migration 20261101100000), with how it was paid: a new last
-- argument, so the old one is dropped first (two versions would make a call ambiguous).
DROP FUNCTION IF EXISTS public.issue_gift_card(uuid, numeric, text, text, text, date, uuid);

CREATE OR REPLACE FUNCTION public.issue_gift_card(
  p_brand_id uuid,
  p_amount numeric,
  p_recipient_name text DEFAULT NULL,
  p_purchaser_name text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_expires_on date DEFAULT NULL,
  p_source_order_id uuid DEFAULT NULL,
  p_paid_with text DEFAULT NULL
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
  v_paid_with text := NULLIF(lower(btrim(COALESCE(p_paid_with, ''))), '');
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
  IF v_paid_with IS NOT NULL AND v_paid_with NOT IN ('cash', 'card', 'transfer') THEN
    RAISE EXCEPTION 'GIFT_CARD_PAID_WITH_INVALID';
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
        purchaser_name, note, source_order_id, issued_by, paid_with
      ) VALUES (
        p_brand_id, public.new_gift_card_code(), COALESCE(v_currency, 'BHD'), round(p_amount, 3),
        round(p_amount, 3), p_expires_on, NULLIF(btrim(p_recipient_name), ''),
        NULLIF(btrim(p_purchaser_name), ''), NULLIF(btrim(p_note), ''), p_source_order_id, auth.uid(),
        v_paid_with
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

REVOKE ALL ON FUNCTION public.issue_gift_card(uuid, numeric, text, text, text, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_gift_card(uuid, numeric, text, text, text, date, uuid, text)
  TO authenticated, service_role;

-- The cards' figures for several periods (the monthly statement's months, the month pack's
-- month), for finance staff (`reporting_brand_id`: signed in, active, view_financials, the
-- caller's store). Each period: what was sold (and by how it was paid) and given, what was spent
-- on orders net of what released orders gave back, what was written off, and what the cards held
-- at its end. And, as of now, what active cards hold, in how many cards, and how much of it sits
-- on cards past their end date.
CREATE OR REPLACE FUNCTION public.rpc_reporting_gift_cards(
  p_periods jsonb,
  p_brand_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid := public.reporting_brand_id(p_brand_slug);
  v_period jsonb;
  v_from timestamptz;
  v_to timestamptz;
  v_periods jsonb := '[]'::jsonb;
  v_now jsonb;
BEGIN
  IF p_periods IS NULL OR jsonb_typeof(p_periods) <> 'array'
     OR jsonb_array_length(p_periods) = 0 OR jsonb_array_length(p_periods) > 36 THEN
    RAISE EXCEPTION 'INVALID_PERIODS';
  END IF;

  FOR v_period IN SELECT value FROM jsonb_array_elements(p_periods) LOOP
    v_from := (v_period ->> 'from')::timestamptz;
    v_to := (v_period ->> 'to')::timestamptz;
    IF v_from IS NULL OR v_to IS NULL OR v_to <= v_from THEN
      RAISE EXCEPTION 'INVALID_PERIODS';
    END IF;

    v_periods := v_periods || jsonb_build_array((
      SELECT jsonb_build_object(
        'from', v_from,
        'to', v_to,
        'sold', COALESCE(sum(m.amount) FILTER (
          WHERE m.kind = 'issued' AND c.paid_with IS NOT NULL AND m.created_at >= v_from), 0),
        'sold_count', count(*) FILTER (
          WHERE m.kind = 'issued' AND c.paid_with IS NOT NULL AND m.created_at >= v_from),
        'sold_cash', COALESCE(sum(m.amount) FILTER (
          WHERE m.kind = 'issued' AND c.paid_with = 'cash' AND m.created_at >= v_from), 0),
        'sold_card', COALESCE(sum(m.amount) FILTER (
          WHERE m.kind = 'issued' AND c.paid_with = 'card' AND m.created_at >= v_from), 0),
        'sold_transfer', COALESCE(sum(m.amount) FILTER (
          WHERE m.kind = 'issued' AND c.paid_with = 'transfer' AND m.created_at >= v_from), 0),
        'given', COALESCE(sum(m.amount) FILTER (
          WHERE m.kind = 'issued' AND c.paid_with IS NULL AND m.created_at >= v_from), 0),
        'spent', COALESCE(-sum(m.amount) FILTER (
          WHERE m.kind IN ('redeemed', 'returned') AND m.created_at >= v_from), 0),
        'written_off', COALESCE(-sum(m.amount) FILTER (
          WHERE m.kind = 'voided' AND m.created_at >= v_from), 0),
        'held_at_end', COALESCE(sum(m.amount), 0)
      )
      FROM public.gift_card_movements m
      JOIN public.gift_cards c ON c.id = m.gift_card_id
      WHERE m.brand_id = v_brand AND m.created_at < v_to
    ));
  END LOOP;

  SELECT jsonb_build_object(
    'held', COALESCE(sum(balance) FILTER (
      WHERE expires_on IS NULL OR expires_on >= current_date), 0),
    'held_cards', count(*) FILTER (
      WHERE balance > 0 AND (expires_on IS NULL OR expires_on >= current_date)),
    'held_expired', COALESCE(sum(balance) FILTER (WHERE expires_on < current_date), 0)
  ) INTO v_now
  FROM public.gift_cards
  WHERE brand_id = v_brand AND status = 'active';

  RETURN jsonb_build_object('periods', v_periods, 'now', v_now);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_reporting_gift_cards(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_gift_cards(jsonb, text) TO authenticated, service_role;
