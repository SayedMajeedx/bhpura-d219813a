-- Gift cards: an amount the buyer chooses in the store's range, and the store's gift add-ons with
-- a card it prints and delivers (the owner's request of 2026-11-12).
--
-- 1. The amount. A store sells cards from a least to a most amount, in whole units of its
--    currency (`gift_card_settings.min_amount` / `max_amount`); the shop draws a slider with a
--    field to type the amount. The list of amounts (`amounts`) stays for a page open across the
--    release: a store's list becomes its range below, and a purchase is checked against the range
--    when there is one, else against the list.
-- 2. The add-ons. A card the store prints and delivers may go with the store's gift add-ons (a
--    bouquet, chocolates: `gift_addons`, the gift orders' own). The buyer sends only ids and
--    quantities (`p_buyer.print.addons`); the database prices them from the store's rows, keeps
--    what was chosen on the purchase (`addons`, names and prices as sold) and its sum
--    (`addons_total`), and the buyer pays the card, the printing fee and the add-ons
--    (`total_due`). The card holds its value only.
-- 3. The money. Add-ons are sales of the store's, as the printing fee is (migration
--    20261126100000): VAT inside at the rate kept on the purchase, counted the day it is paid in
--    `rpc_reporting_gift_card_services`, which the overview and the statement read.

-- 1. The store's range -----------------------------------------------------------------------------

ALTER TABLE public.gift_card_settings
  ADD COLUMN IF NOT EXISTS min_amount numeric(12, 3),
  ADD COLUMN IF NOT EXISTS max_amount numeric(12, 3);

ALTER TABLE public.gift_card_settings DROP CONSTRAINT IF EXISTS gift_card_settings_range_check;
ALTER TABLE public.gift_card_settings ADD CONSTRAINT gift_card_settings_range_check CHECK (
  (min_amount IS NULL AND max_amount IS NULL)
  OR (min_amount >= 1 AND max_amount <= 100000 AND min_amount <= max_amount
      AND min_amount = trunc(min_amount) AND max_amount = trunc(max_amount))
);

-- A store's list becomes its range: from its least amount to its most, in whole units.
UPDATE public.gift_card_settings s
   SET min_amount = r.lo, max_amount = r.hi
  FROM (
    SELECT brand_id,
           GREATEST(1, ceil((SELECT min(a) FROM unnest(amounts) a))) AS lo,
           floor((SELECT max(a) FROM unnest(amounts) a)) AS hi
      FROM public.gift_card_settings
     WHERE cardinality(amounts) > 0
  ) r
 WHERE s.brand_id = r.brand_id AND s.min_amount IS NULL AND r.lo <= r.hi AND r.hi <= 100000;

-- Staff who may change settings set what is sold online. The function of 20261104100000 with the
-- range: given, it is the store's amounts and the list may be empty; not given (a page open across
-- the release sends four arguments), the range is kept as it is. Replaced, not overloaded, so the
-- four-argument call reaches this one.
DROP FUNCTION IF EXISTS public.set_gift_card_settings(uuid, boolean, numeric[], integer);

CREATE OR REPLACE FUNCTION public.set_gift_card_settings(
  p_brand_id uuid,
  p_sell_online boolean,
  p_amounts numeric[],
  p_valid_months integer DEFAULT NULL,
  p_min_amount numeric DEFAULT NULL,
  p_max_amount numeric DEFAULT NULL
)
RETURNS public.gift_card_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_amounts numeric(12, 3)[];
  v_row public.gift_card_settings;
  v_min numeric(12, 3);
  v_max numeric(12, 3);
  v_range boolean := p_min_amount IS NOT NULL OR p_max_amount IS NOT NULL;
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

  IF v_range THEN
    v_min := p_min_amount;
    v_max := p_max_amount;
    IF v_min IS NULL OR v_max IS NULL OR v_min < 1 OR v_max > 100000 OR v_min > v_max
       OR v_min <> trunc(v_min) OR v_max <> trunc(v_max) THEN
      RAISE EXCEPTION 'GIFT_CARD_RANGE_INVALID';
    END IF;
  ELSE
    SELECT s.min_amount, s.max_amount INTO v_min, v_max
      FROM public.gift_card_settings s WHERE s.brand_id = p_brand_id;
  END IF;

  IF COALESCE(p_sell_online, false) AND cardinality(v_amounts) = 0 AND v_min IS NULL THEN
    RAISE EXCEPTION 'GIFT_CARD_AMOUNTS_REQUIRED';
  END IF;
  IF p_valid_months IS NOT NULL AND (p_valid_months < 1 OR p_valid_months > 60) THEN
    RAISE EXCEPTION 'GIFT_CARD_VALIDITY_INVALID';
  END IF;

  INSERT INTO public.gift_card_settings (brand_id, sell_online, amounts, valid_months,
    min_amount, max_amount, updated_at, updated_by)
  VALUES (p_brand_id, COALESCE(p_sell_online, false), v_amounts, p_valid_months, v_min, v_max,
    now(), auth.uid())
  ON CONFLICT (brand_id) DO UPDATE
    SET sell_online = EXCLUDED.sell_online, amounts = EXCLUDED.amounts,
        valid_months = EXCLUDED.valid_months, min_amount = EXCLUDED.min_amount,
        max_amount = EXCLUDED.max_amount, updated_at = now(), updated_by = auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_gift_card_settings(uuid, boolean, numeric[], integer, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_gift_card_settings(uuid, boolean, numeric[], integer, numeric, numeric)
  TO authenticated, service_role;

-- What a visitor reads (migration 20261124100000's function) with the range.
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
    'min_amount', s.min_amount,
    'max_amount', s.max_amount,
    'currency', COALESCE(NULLIF(btrim(bs.currency), ''), 'BHD'),
    'valid_months', s.valid_months,
    'card', COALESCE(bs.card_enabled, false),
    'benefit', COALESCE(bs.benefit_enabled, false),
    'print', s.print_enabled,
    'print_fee', s.print_fee
  )
    FROM public.brands b
    JOIN public.gift_card_settings s ON s.brand_id = b.id
    JOIN public.business_settings bs ON bs.brand_id = b.id
   WHERE b.slug = p_slug
     AND b.is_active = true
     AND s.sell_online = true
     AND (cardinality(s.amounts) > 0 OR s.min_amount IS NOT NULL)
     AND (COALESCE(bs.card_enabled, false) OR COALESCE(bs.benefit_enabled, false));
$function$;

REVOKE ALL ON FUNCTION public.storefront_gift_card_offer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_gift_card_offer(text) TO anon, authenticated, service_role;

-- 2. Add-ons on a purchase ---------------------------------------------------------------------

ALTER TABLE public.gift_card_purchases
  ADD COLUMN IF NOT EXISTS addons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS addons_total numeric(12, 3) NOT NULL DEFAULT 0;

ALTER TABLE public.gift_card_purchases DROP CONSTRAINT IF EXISTS gift_card_purchases_addons_check;
ALTER TABLE public.gift_card_purchases ADD CONSTRAINT gift_card_purchases_addons_check CHECK (
  jsonb_typeof(addons) = 'array' AND jsonb_array_length(addons) <= 20
  AND addons_total >= 0 AND addons_total <= 100000
  AND (print_by_store OR (addons_total = 0 AND jsonb_array_length(addons) = 0))
);

-- What the buyer pays: the card, the printing fee and the add-ons.
ALTER TABLE public.gift_card_purchases DROP COLUMN IF EXISTS total_due;
ALTER TABLE public.gift_card_purchases
  ADD COLUMN total_due numeric(12, 3) GENERATED ALWAYS AS (amount + print_fee + addons_total) STORED;

GRANT SELECT (addons, addons_total, total_due) ON public.gift_card_purchases TO authenticated;

-- The VAT rate is kept for add-ons as for the fee (migration 20261126100000's trigger).
CREATE OR REPLACE FUNCTION public.gift_card_purchases_print_tax_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.print_by_store AND (COALESCE(NEW.print_fee, 0) > 0 OR COALESCE(NEW.addons_total, 0) > 0) THEN
    SELECT GREATEST(0, LEAST(100, COALESCE(bs.default_tax_rate, 0)))
      INTO NEW.print_tax_rate
      FROM public.business_settings bs
     WHERE bs.brand_id = NEW.brand_id;
    NEW.print_tax_rate := COALESCE(NEW.print_tax_rate, 0);
  ELSE
    NEW.print_tax_rate := 0;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.gift_card_purchases_print_tax_rate() FROM PUBLIC, anon, authenticated;

-- A shopper's purchase (migration 20261124100000's function) with the range and the add-ons:
-- an amount in whole units between the store's least and most (else one of its listed amounts),
-- and, on a card the store prints, the add-ons in `p_buyer.print.addons` ([{id, quantity}], at
-- most 20, 1 to 10 each), priced from the store's own available rows (GIFT_ADDON_UNAVAILABLE).
CREATE OR REPLACE FUNCTION public.create_gift_card_purchase(
  p_slug text,
  p_amount numeric,
  p_method text,
  p_buyer jsonb,
  p_receipt_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
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
  v_email text := lower(NULLIF(btrim(p_buyer ->> 'email'), ''));
  v_channel text := COALESCE(NULLIF(p_buyer ->> 'delivery', ''), 'whatsapp');
  v_lang text := CASE WHEN p_buyer ->> 'lang' = 'en' THEN 'en' ELSE 'ar' END;
  v_receipt public.pending_benefit_receipts%ROWTYPE;
  v_purchase public.gift_card_purchases;
  v_design jsonb;
  v_print boolean := COALESCE(jsonb_typeof(p_buyer -> 'print') = 'object', false);
  v_print_address text;
  v_print_phone text;
  v_print_fee numeric(12, 3) := 0;
  v_asked jsonb;
  v_item jsonb;
  v_qty integer;
  v_addon public.gift_addons%ROWTYPE;
  v_addons jsonb := '[]'::jsonb;
  v_addons_total numeric(12, 3) := 0;
BEGIN
  IF v_offer IS NULL THEN
    RAISE EXCEPTION 'GIFT_CARDS_NOT_SOLD';
  END IF;
  v_brand := (v_offer ->> 'brand_id')::uuid;
  IF v_offer ->> 'min_amount' IS NOT NULL THEN
    IF v_amount <> trunc(v_amount) OR v_amount < (v_offer ->> 'min_amount')::numeric
       OR v_amount > (v_offer ->> 'max_amount')::numeric THEN
      RAISE EXCEPTION 'GIFT_CARD_AMOUNT_NOT_OFFERED';
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_offer -> 'amounts') a WHERE a::numeric = v_amount) THEN
    RAISE EXCEPTION 'GIFT_CARD_AMOUNT_NOT_OFFERED';
  END IF;
  IF p_method NOT IN ('card', 'benefit') OR NOT COALESCE((v_offer ->> p_method)::boolean, false) THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_DISABLED';
  END IF;
  v_design := public.gift_card_design_clean(v_brand, p_buyer -> 'design');
  IF v_channel NOT IN ('whatsapp', 'email') THEN
    RAISE EXCEPTION 'GIFT_CARD_DELIVERY_INVALID';
  END IF;
  IF v_phone IS NOT NULL AND char_length(v_phone) NOT BETWEEN 6 AND 32 THEN
    v_phone := NULL;
  END IF;
  IF v_email IS NOT NULL AND (char_length(v_email) > 200
     OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$') THEN
    RAISE EXCEPTION 'GIFT_CARD_EMAIL_INVALID';
  END IF;
  IF v_name IS NULL OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'GIFT_CARD_BUYER_INVALID';
  END IF;
  IF v_channel = 'whatsapp' AND v_phone IS NULL THEN
    RAISE EXCEPTION 'GIFT_CARD_PHONE_REQUIRED';
  END IF;
  IF v_channel = 'email' AND v_email IS NULL THEN
    RAISE EXCEPTION 'GIFT_CARD_EMAIL_REQUIRED';
  END IF;

  -- Printed by the store: only while it prints, to an address with a number to call there.
  IF v_print THEN
    IF NOT COALESCE((v_offer ->> 'print')::boolean, false) THEN
      RAISE EXCEPTION 'GIFT_CARD_PRINT_NOT_OFFERED';
    END IF;
    v_print_address := left(NULLIF(btrim(p_buyer -> 'print' ->> 'address'), ''), 400);
    v_print_phone := NULLIF(regexp_replace(COALESCE(p_buyer -> 'print' ->> 'phone', ''), '[^0-9+]', '', 'g'), '');
    IF v_print_address IS NULL OR char_length(v_print_address) < 3 THEN
      RAISE EXCEPTION 'GIFT_CARD_PRINT_ADDRESS_REQUIRED';
    END IF;
    IF v_print_phone IS NULL OR char_length(v_print_phone) NOT BETWEEN 6 AND 32 THEN
      RAISE EXCEPTION 'GIFT_CARD_PRINT_PHONE_REQUIRED';
    END IF;
    v_print_fee := round(COALESCE((v_offer ->> 'print_fee')::numeric, 0), 3);

    -- The add-ons that go with it, priced from the store's rows.
    v_asked := p_buyer -> 'print' -> 'addons';
    IF v_asked IS NOT NULL AND jsonb_typeof(v_asked) <> 'null' THEN
      IF jsonb_typeof(v_asked) <> 'array' OR jsonb_array_length(v_asked) > 20 THEN
        RAISE EXCEPTION 'GIFT_ADDON_UNAVAILABLE';
      END IF;
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_asked) LOOP
        v_qty := CASE WHEN (v_item ->> 'quantity') ~ '^[0-9]{1,3}$' THEN (v_item ->> 'quantity')::integer END;
        IF v_qty IS NULL OR v_qty < 1 OR v_qty > 10 OR (v_item ->> 'id') !~* '^[0-9a-f-]{36}$' THEN
          RAISE EXCEPTION 'GIFT_ADDON_UNAVAILABLE';
        END IF;
        SELECT * INTO v_addon FROM public.gift_addons a
         WHERE a.id = (v_item ->> 'id')::uuid AND a.brand_id = v_brand
           AND a.is_available AND a.archived_at IS NULL;
        IF NOT FOUND OR v_addons @> jsonb_build_array(jsonb_build_object('id', v_addon.id)) THEN
          RAISE EXCEPTION 'GIFT_ADDON_UNAVAILABLE';
        END IF;
        v_addons := v_addons || jsonb_build_array(jsonb_build_object(
          'id', v_addon.id, 'name_ar', v_addon.name_ar, 'name_en', v_addon.name_en,
          'price', v_addon.price, 'quantity', v_qty));
        v_addons_total := v_addons_total + v_addon.price * v_qty;
      END LOOP;
    END IF;
  END IF;
  -- The design says the same, so every screen drawing it reads one answer.
  IF v_design IS NOT NULL THEN
    v_design := jsonb_set(v_design, '{print}', to_jsonb(v_print));
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
    recipient_name, message, receipt_key, delivery_channel, lang, buyer_user_id, design,
    print_by_store, print_fee, print_address, print_phone, addons, addons_total
  ) VALUES (
    v_brand, v_amount, v_offer ->> 'currency', p_method, v_name, v_phone, v_email,
    left(NULLIF(btrim(p_buyer ->> 'recipient'), ''), 120),
    left(NULLIF(btrim(p_buyer ->> 'message'), ''), 300),
    v_receipt.object_key, v_channel, v_lang, p_user_id, v_design,
    v_print, v_print_fee, v_print_address, v_print_phone, v_addons, v_addons_total
  ) RETURNING * INTO v_purchase;

  RETURN jsonb_build_object('id', v_purchase.id, 'token', v_purchase.token, 'brand_id', v_brand);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_gift_card_purchase(text, numeric, text, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_gift_card_purchase(text, numeric, text, jsonb, uuid, uuid) TO service_role;

-- 3. The money: add-ons are sales, as the printing fee (migration 20261126100000's function) --

CREATE OR REPLACE FUNCTION public.rpc_reporting_gift_card_services(
  p_start_date timestamptz,
  p_end_date timestamptz,
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
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'currency', s.currency,
      'service_gross', s.gross,
      'service_sales', s.net,
      'service_vat', s.gross - s.net,
      'service_count', s.n
    ) ORDER BY s.currency)
    FROM (
      SELECT p.currency,
             sum(p.print_fee + p.addons_total) AS gross,
             sum((p.print_fee + p.addons_total) * 100 / (100 + p.print_tax_rate)) AS net,
             count(*) AS n
        FROM public.gift_card_purchases p
       WHERE p.brand_id = v_brand AND p.status = 'paid' AND p.print_by_store AND (p.print_fee > 0 OR p.addons_total > 0)
         AND p.paid_at >= p_start_date AND p.paid_at < p_end_date
       GROUP BY p.currency
    ) s
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_reporting_gift_card_services(timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_reporting_gift_card_services(timestamptz, timestamptz, text)
  TO authenticated, service_role;

-- The emails (migration 20261125100000's function) are told the add-ons.

CREATE OR REPLACE FUNCTION public.claim_gift_card_purchase_events(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  WITH waiting AS (
    SELECT e.id FROM public.gift_card_purchase_events e
     WHERE e.attempts < 5
       AND (e.status = 'pending'
            OR (e.status = 'failed' AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= now()))
            OR (e.status = 'processing' AND e.claimed_at < now() - interval '10 minutes'))
     ORDER BY e.created_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 50))
     FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.gift_card_purchase_events e
       SET status = 'processing', attempts = e.attempts + 1, claimed_at = now()
      FROM waiting w
     WHERE e.id = w.id
    RETURNING e.id
  )
  SELECT array_agg(id) INTO v_ids FROM claimed;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'event_id', e.id,
      'event', e.event,
      'customer_done', e.customer_done,
      'store_done', e.store_done,
      'purchase_id', p.id,
      'brand_id', p.brand_id,
      'slug', b.slug,
      'store_name', COALESCE(NULLIF(bs.business_name, ''), b.name_en, b.slug),
      'sender_name', NULLIF(bs.email_sender_name, ''),
      'amount', p.amount,
      'currency', p.currency,
      'payment_method', p.payment_method,
      'delivery_channel', p.delivery_channel,
      'lang', p.lang,
      'buyer_name', p.buyer_name,
      'buyer_phone', p.buyer_phone,
      'buyer_email', p.buyer_email,
      'recipient_name', p.recipient_name,
      'message', p.message,
      'cancel_reason', p.cancel_reason,
      'token', p.token,
      'code', CASE WHEN p.status = 'paid' THEN c.code END,
      'expires_on', CASE WHEN p.status = 'paid' THEN c.expires_on END,
      'print_by_store', p.print_by_store,
      'print_fee', p.print_fee,
      'print_address', p.print_address,
      'print_phone', p.print_phone,
      'addons', p.addons,
      'addons_total', p.addons_total
    ) ORDER BY e.created_at)
      FROM public.gift_card_purchase_events e
      JOIN public.gift_card_purchases p ON p.id = e.purchase_id
      JOIN public.brands b ON b.id = p.brand_id
      LEFT JOIN public.business_settings bs ON bs.brand_id = p.brand_id
      LEFT JOIN public.gift_cards c ON c.id = p.gift_card_id
     WHERE e.id = ANY (COALESCE(v_ids, '{}'))
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_gift_card_purchase_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gift_card_purchase_events(integer) TO service_role;

-- The store's alert (migration 20261125100000's trigger) says what was paid, add-ons included.

CREATE OR REPLACE FUNCTION public.gift_card_purchase_notices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event text;
  -- What the buyer paid: the card's value, plus the printing fee and add-ons when the store prints it.
  v_amount text := trim(to_char(NEW.amount + COALESCE(NEW.print_fee, 0) + COALESCE(NEW.addons_total, 0), 'FM999999990.000')) || ' ' || NEW.currency
    || CASE WHEN NEW.print_by_store THEN ' · مطبوعة' ELSE '' END;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'placed';
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('paid', 'cancelled') THEN
    v_event := NEW.status;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.gift_card_purchase_events (purchase_id, brand_id, event)
  VALUES (NEW.id, NEW.brand_id, v_event)
  ON CONFLICT (purchase_id, event) DO NOTHING;

  IF (v_event = 'placed' AND NEW.payment_method = 'benefit')
     OR (v_event = 'paid' AND NEW.payment_method = 'card') THEN
    INSERT INTO public.push_notification_events (
      brand_id, event_type, entity_type, entity_id, dedupe_key, title, body, target_url, payload
    ) VALUES (
      NEW.brand_id, 'gift_card_new', 'gift_card_purchase', NEW.id,
      'gift-card-' || v_event || ':' || NEW.id,
      CASE WHEN v_event = 'placed' THEN 'بطاقة هدية: تحويل بانتظار التحقق' ELSE 'بيعت بطاقة هدية على المتجر' END,
      NEW.buyer_name || ' — ' || v_amount,
      '/gift-cards',
      jsonb_build_object('purchase_id', NEW.id, 'amount', NEW.amount, 'currency', NEW.currency,
        'method', NEW.payment_method, 'delivery', NEW.delivery_channel,
        'print_by_store', NEW.print_by_store, 'print_fee', NEW.print_fee,
        'addons_total', NEW.addons_total)
    )
    ON CONFLICT (brand_id, dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.gift_card_purchase_notices() FROM PUBLIC, anon, authenticated;
