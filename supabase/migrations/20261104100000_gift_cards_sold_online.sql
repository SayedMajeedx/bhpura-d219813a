-- Gift cards, step four (docs/gift-cards-plan.md): a shopper buys a gift card on the storefront.
--
-- A card sold is money the store holds, not a sale (the owner's decision, 2026-10-31), so an
-- online sale is not an order: no VAT, no stock, no points, nothing in the sales figures. It is a
-- purchase of its own (`gift_card_purchases`): the shopper picks one of the amounts the store
-- offers and pays by card (Tap) or by BenefitPay transfer with its receipt. When the payment is
-- confirmed (the gateway for a card, the store's staff for a transfer) the card is issued once,
-- in the store's currency, saying how it was paid (`paid_with` 'online' or 'transfer'), and step
-- three's reports count it as money held. The sale is counted when the card is spent.
--
-- What a store offers is `gift_card_settings` (off until the store turns it on, its amounts and
-- how long a card bought online lasts), edited by staff who may change settings.

-- 1. What the store offers -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gift_card_settings (
  brand_id uuid PRIMARY KEY REFERENCES public.brands(id) ON DELETE CASCADE,
  sell_online boolean NOT NULL DEFAULT false,
  -- The amounts a shopper picks from (1 to 8, each above zero).
  amounts numeric(12, 3)[] NOT NULL DEFAULT '{}'::numeric(12, 3)[],
  -- How long a card bought online lasts, in months; null: no end date.
  valid_months integer CHECK (valid_months IS NULL OR valid_months BETWEEN 1 AND 60),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.gift_card_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gift_card_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gift_card_settings TO authenticated;
GRANT ALL ON TABLE public.gift_card_settings TO service_role;
DROP POLICY IF EXISTS "Staff read their store's gift card settings" ON public.gift_card_settings;
CREATE POLICY "Staff read their store's gift card settings" ON public.gift_card_settings
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

-- A card bought online says so (the reports split what was sold by how it was paid).
DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT con.conname FROM pg_constraint con
     WHERE con.conrelid = 'public.gift_cards'::regclass AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) LIKE '%paid_with%'
  LOOP
    EXECUTE format('ALTER TABLE public.gift_cards DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;
ALTER TABLE public.gift_cards ADD CONSTRAINT gift_cards_paid_with_check
  CHECK (paid_with IS NULL OR paid_with IN ('cash', 'card', 'transfer', 'online'));

-- Staff who may change settings set what is sold online.
CREATE OR REPLACE FUNCTION public.set_gift_card_settings(
  p_brand_id uuid,
  p_sell_online boolean,
  p_amounts numeric[],
  p_valid_months integer DEFAULT NULL
)
RETURNS public.gift_card_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_amounts numeric(12, 3)[];
  v_row public.gift_card_settings;
BEGIN
  IF p_brand_id IS NULL OR NOT public.can_access_brand(p_brand_id)
     OR NOT public.has_permission('manage_settings') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(a ORDER BY a), '{}') INTO v_amounts
    FROM (SELECT DISTINCT round(x, 3) AS a FROM unnest(COALESCE(p_amounts, '{}')) x) s;
  IF EXISTS (SELECT 1 FROM unnest(v_amounts) a WHERE a <= 0 OR a > 100000)
     OR cardinality(v_amounts) > 8 THEN
    RAISE EXCEPTION 'GIFT_CARD_AMOUNTS_INVALID';
  END IF;
  IF COALESCE(p_sell_online, false) AND cardinality(v_amounts) = 0 THEN
    RAISE EXCEPTION 'GIFT_CARD_AMOUNTS_REQUIRED';
  END IF;
  IF p_valid_months IS NOT NULL AND (p_valid_months < 1 OR p_valid_months > 60) THEN
    RAISE EXCEPTION 'GIFT_CARD_VALIDITY_INVALID';
  END IF;

  INSERT INTO public.gift_card_settings (brand_id, sell_online, amounts, valid_months, updated_at, updated_by)
  VALUES (p_brand_id, COALESCE(p_sell_online, false), v_amounts, p_valid_months, now(), auth.uid())
  ON CONFLICT (brand_id) DO UPDATE
    SET sell_online = EXCLUDED.sell_online, amounts = EXCLUDED.amounts,
        valid_months = EXCLUDED.valid_months, updated_at = now(), updated_by = auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_gift_card_settings(uuid, boolean, numeric[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_gift_card_settings(uuid, boolean, numeric[], integer)
  TO authenticated, service_role;

-- What a visitor may read: the store's offer while it sells cards online and takes a card or
-- BenefitPay. Nothing for a store that does not.
CREATE OR REPLACE FUNCTION public.storefront_gift_card_offer(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'brand_id', b.id,
    'amounts', to_jsonb(s.amounts),
    'currency', COALESCE(NULLIF(btrim(bs.currency), ''), 'BHD'),
    'valid_months', s.valid_months,
    'card', COALESCE(bs.card_enabled, false),
    'benefit', COALESCE(bs.benefit_enabled, false)
  )
    FROM public.brands b
    JOIN public.gift_card_settings s ON s.brand_id = b.id
    JOIN public.business_settings bs ON bs.brand_id = b.id
   WHERE b.slug = p_slug
     AND b.is_active = true
     AND s.sell_online = true
     AND cardinality(s.amounts) > 0
     AND (COALESCE(bs.card_enabled, false) OR COALESCE(bs.benefit_enabled, false));
$function$;

REVOKE ALL ON FUNCTION public.storefront_gift_card_offer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_gift_card_offer(text) TO anon, authenticated, service_role;

-- 2. A purchase -----------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gift_card_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  amount numeric(12, 3) NOT NULL CHECK (amount > 0 AND amount <= 100000),
  currency text NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('card', 'benefit')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled', 'expired')),
  buyer_name text NOT NULL CHECK (char_length(buyer_name) BETWEEN 1 AND 120),
  buyer_phone text NOT NULL CHECK (char_length(buyer_phone) BETWEEN 6 AND 32),
  buyer_email text CHECK (char_length(buyer_email) <= 200),
  recipient_name text CHECK (char_length(recipient_name) <= 120),
  message text CHECK (char_length(message) <= 300),
  -- Proves the shopper's own browser: the status page and the card charge ask for it.
  token text NOT NULL DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  gateway_reference text,
  receipt_key text,
  gift_card_id uuid REFERENCES public.gift_cards(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  settled_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text CHECK (char_length(cancel_reason) <= 500)
);

CREATE INDEX IF NOT EXISTS gift_card_purchases_brand_created
  ON public.gift_card_purchases (brand_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS gift_card_purchases_one_card
  ON public.gift_card_purchases (gift_card_id) WHERE gift_card_id IS NOT NULL;

ALTER TABLE public.gift_card_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gift_card_purchases FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, brand_id, amount, currency, payment_method, status, buyer_name, buyer_phone,
  buyer_email, recipient_name, message, gateway_reference, receipt_key, gift_card_id, created_at,
  paid_at, settled_by, cancelled_at, cancelled_by, cancel_reason)
  ON public.gift_card_purchases TO authenticated;
GRANT ALL ON TABLE public.gift_card_purchases TO service_role;
DROP POLICY IF EXISTS "Staff read their store's gift card purchases" ON public.gift_card_purchases;
CREATE POLICY "Staff read their store's gift card purchases" ON public.gift_card_purchases
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

-- A shopper's purchase, written by the server (`startGiftCardPurchase`, rate-limited): one of the
-- store's amounts, a method the store takes, who buys it and for whom; a transfer brings its
-- uploaded receipt, used once. Answers the purchase and its token.
CREATE OR REPLACE FUNCTION public.create_gift_card_purchase(
  p_slug text,
  p_amount numeric,
  p_method text,
  p_buyer jsonb,
  p_receipt_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offer jsonb := public.storefront_gift_card_offer(p_slug);
  v_brand uuid;
  v_amount numeric(12, 3) := round(p_amount, 3);
  v_name text := NULLIF(btrim(p_buyer ->> 'name'), '');
  v_phone text := NULLIF(regexp_replace(COALESCE(p_buyer ->> 'phone', ''), '[^0-9+]', '', 'g'), '');
  v_receipt public.pending_benefit_receipts%ROWTYPE;
  v_purchase public.gift_card_purchases;
BEGIN
  IF v_offer IS NULL THEN
    RAISE EXCEPTION 'GIFT_CARDS_NOT_SOLD';
  END IF;
  v_brand := (v_offer ->> 'brand_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_offer -> 'amounts') a WHERE a::numeric = v_amount) THEN
    RAISE EXCEPTION 'GIFT_CARD_AMOUNT_NOT_OFFERED';
  END IF;
  IF p_method NOT IN ('card', 'benefit') OR NOT COALESCE((v_offer ->> p_method)::boolean, false) THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_DISABLED';
  END IF;
  IF v_name IS NULL OR char_length(v_name) > 120 OR v_phone IS NULL
     OR char_length(v_phone) NOT BETWEEN 6 AND 32 THEN
    RAISE EXCEPTION 'GIFT_CARD_BUYER_INVALID';
  END IF;
  -- A script inventing purchases fills nothing: at most 300 started an hour per store.
  IF (SELECT count(*) FROM public.gift_card_purchases
       WHERE brand_id = v_brand AND created_at > now() - interval '1 hour') >= 300 THEN
    RAISE EXCEPTION 'GIFT_CARD_PURCHASES_BUSY';
  END IF;

  IF p_method = 'benefit' THEN
    SELECT * INTO v_receipt FROM public.pending_benefit_receipts
     WHERE id = p_receipt_id AND brand_id = v_brand AND uploaded_at IS NOT NULL
       AND consumed_at IS NULL AND expires_at > now()
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BENEFIT_RECEIPT_INVALID';
    END IF;
    UPDATE public.pending_benefit_receipts SET consumed_at = now() WHERE id = v_receipt.id;
  ELSIF p_receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'UNEXPECTED_BENEFIT_RECEIPT';
  END IF;

  INSERT INTO public.gift_card_purchases (
    brand_id, amount, currency, payment_method, buyer_name, buyer_phone, buyer_email,
    recipient_name, message, receipt_key
  ) VALUES (
    v_brand, v_amount, v_offer ->> 'currency', p_method, v_name, v_phone,
    left(NULLIF(btrim(p_buyer ->> 'email'), ''), 200),
    left(NULLIF(btrim(p_buyer ->> 'recipient'), ''), 120),
    left(NULLIF(btrim(p_buyer ->> 'message'), ''), 300),
    v_receipt.object_key
  ) RETURNING * INTO v_purchase;

  RETURN jsonb_build_object('id', v_purchase.id, 'token', v_purchase.token, 'brand_id', v_brand);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_gift_card_purchase(text, numeric, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_gift_card_purchase(text, numeric, text, jsonb, uuid) TO service_role;

-- 3. Issuing a card: one place, for staff and for a paid purchase ----------------------------------

CREATE OR REPLACE FUNCTION public.gift_card_issue_internal(
  p_brand_id uuid,
  p_amount numeric,
  p_recipient_name text,
  p_purchaser_name text,
  p_note text,
  p_expires_on date,
  p_source_order_id uuid,
  p_paid_with text,
  p_by uuid
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
        NULLIF(btrim(p_purchaser_name), ''), NULLIF(btrim(p_note), ''), p_source_order_id, p_by,
        p_paid_with
      ) RETURNING * INTO v_card;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= 5 THEN RAISE; END IF;
    END;
  END LOOP;

  INSERT INTO public.gift_card_movements (gift_card_id, brand_id, kind, amount, order_id, created_by)
  VALUES (v_card.id, p_brand_id, 'issued', v_card.initial_amount, p_source_order_id, p_by);

  RETURN v_card;
END;
$function$;

REVOKE ALL ON FUNCTION public.gift_card_issue_internal(uuid, numeric, text, text, text, date, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_card_issue_internal(uuid, numeric, text, text, text, date, uuid, text, uuid) TO service_role;

-- Staff issuing a card: step three's function (migration 20261103100000), its checks kept, the
-- writing moved to the one place above.
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
  -- 'online' is the storefront's alone: staff record what they took in the store.
  IF v_paid_with IS NOT NULL AND v_paid_with NOT IN ('cash', 'card', 'transfer') THEN
    RAISE EXCEPTION 'GIFT_CARD_PAID_WITH_INVALID';
  END IF;
  IF p_source_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = p_source_order_id AND brand_id = p_brand_id
  ) THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  RETURN public.gift_card_issue_internal(
    p_brand_id, p_amount, p_recipient_name, p_purchaser_name, p_note, p_expires_on,
    p_source_order_id, v_paid_with, auth.uid()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.issue_gift_card(uuid, numeric, text, text, text, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_gift_card(uuid, numeric, text, text, text, date, uuid, text)
  TO authenticated, service_role;

-- A purchase's payment is in: its card is issued, once. A card payment arriving after its
-- purchase expired still issues it (the money was taken); a cancelled purchase does not.
-- Called by the server for a card payment the gateway confirmed, and by the staff approval below.
CREATE OR REPLACE FUNCTION public.settle_gift_card_purchase(
  p_purchase_id uuid,
  p_reference text DEFAULT NULL,
  p_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_purchase public.gift_card_purchases;
  v_months integer;
  v_card public.gift_cards;
BEGIN
  SELECT * INTO v_purchase FROM public.gift_card_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF v_purchase.id IS NULL THEN
    RAISE EXCEPTION 'PURCHASE_NOT_FOUND';
  END IF;
  IF v_purchase.status = 'paid' THEN
    SELECT * INTO v_card FROM public.gift_cards WHERE id = v_purchase.gift_card_id;
    RETURN jsonb_build_object('card_id', v_card.id, 'code', v_card.code, 'already', true);
  END IF;
  IF v_purchase.status = 'cancelled' THEN
    RAISE EXCEPTION 'PURCHASE_CANCELLED';
  END IF;

  SELECT valid_months INTO v_months FROM public.gift_card_settings WHERE brand_id = v_purchase.brand_id;

  v_card := public.gift_card_issue_internal(
    v_purchase.brand_id, v_purchase.amount, v_purchase.recipient_name, v_purchase.buyer_name,
    NULL,
    CASE WHEN v_months IS NULL THEN NULL ELSE (current_date + make_interval(months => v_months))::date END,
    NULL,
    CASE WHEN v_purchase.payment_method = 'card' THEN 'online' ELSE 'transfer' END,
    p_by
  );

  UPDATE public.gift_card_purchases
     SET status = 'paid', paid_at = now(), gift_card_id = v_card.id, settled_by = p_by,
         gateway_reference = COALESCE(gateway_reference, p_reference)
   WHERE id = v_purchase.id;

  RETURN jsonb_build_object('card_id', v_card.id, 'code', v_card.code, 'already', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_gift_card_purchase(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_gift_card_purchase(uuid, text, uuid) TO service_role;

-- Staff approve a transfer purchase once its receipt is checked: its card is issued.
CREATE OR REPLACE FUNCTION public.approve_gift_card_purchase(p_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_purchase public.gift_card_purchases;
BEGIN
  SELECT * INTO v_purchase FROM public.gift_card_purchases WHERE id = p_purchase_id;
  IF v_purchase.id IS NULL OR NOT public.gift_card_staff(v_purchase.brand_id) THEN
    RAISE EXCEPTION 'PURCHASE_NOT_FOUND';
  END IF;
  IF v_purchase.payment_method <> 'benefit' THEN
    RAISE EXCEPTION 'PURCHASE_NOT_A_TRANSFER';
  END IF;
  IF v_purchase.status NOT IN ('pending', 'paid') THEN
    RAISE EXCEPTION 'PURCHASE_NOT_PENDING';
  END IF;
  RETURN public.settle_gift_card_purchase(p_purchase_id, NULL, auth.uid());
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_gift_card_purchase(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_gift_card_purchase(uuid) TO authenticated, service_role;

-- Staff turn down a purchase still waiting (a transfer that never came): it stays on record
-- with who and why. A paid purchase is never cancelled here: its card is voided instead.
CREATE OR REPLACE FUNCTION public.cancel_gift_card_purchase(p_purchase_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_purchase public.gift_card_purchases;
BEGIN
  SELECT * INTO v_purchase FROM public.gift_card_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF v_purchase.id IS NULL OR NOT public.gift_card_staff(v_purchase.brand_id) THEN
    RAISE EXCEPTION 'PURCHASE_NOT_FOUND';
  END IF;
  IF v_purchase.status NOT IN ('pending', 'expired') THEN
    RAISE EXCEPTION 'PURCHASE_NOT_PENDING';
  END IF;
  IF char_length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'GIFT_CARD_REASON_REQUIRED';
  END IF;
  UPDATE public.gift_card_purchases
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = left(btrim(p_reason), 500)
   WHERE id = v_purchase.id;
  RETURN jsonb_build_object('cancelled', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_gift_card_purchase(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_gift_card_purchase(uuid, text) TO authenticated, service_role;

-- A card purchase left at the gateway for a day is over (a transfer waits for the store).
CREATE OR REPLACE FUNCTION public.expire_gift_card_purchases()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.gift_card_purchases SET status = 'expired'
   WHERE status = 'pending' AND payment_method = 'card' AND created_at < now() - interval '1 day';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.expire_gift_card_purchases() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_gift_card_purchases() TO service_role;

DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gift_card_purchases_expire_nightly') THEN
      PERFORM cron.unschedule('gift_card_purchases_expire_nightly');
    END IF;
    PERFORM cron.schedule(
      'gift_card_purchases_expire_nightly',
      '23 3 * * *',
      'SELECT public.expire_gift_card_purchases();'
    );
  END IF;
END $$;

-- 4. The reports: cards bought online, beside cash, card machine and transfer ----------------------
-- Step three's function (migration 20261103100000) with one more figure.
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
        'sold_online', COALESCE(sum(m.amount) FILTER (
          WHERE m.kind = 'issued' AND c.paid_with = 'online' AND m.created_at >= v_from), 0),
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
