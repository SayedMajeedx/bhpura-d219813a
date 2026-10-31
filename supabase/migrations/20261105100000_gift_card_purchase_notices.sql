-- Gift cards bought online, refined (the owner's review of 2026-10-31, after step four).
--
-- 1. Nothing a shopper buys can be lost. The shopper chooses how the code reaches them: by
--    WhatsApp (their phone is then required) or by email (their email is then required). An email
--    buyer is written to (received, ready with its code, declined); a WhatsApp buyer's code is sent
--    by a person from the Gift cards page, which records it (`code_sent_at`). A signed-in shopper's
--    purchase is linked to their account (`buyer_user_id`), where its code shows once paid
--    (`storefront_my_gift_cards`).
-- 2. The store hears of every purchase as it does of an order: an email to its admins and
--    notification recipients (the Worker sends the outbox `gift_card_purchase_events`) and an alert
--    on the installed admin (`push_notification_events` kind `gift_card_new`, on by default).

-- 1. The purchase -------------------------------------------------------------------------------

ALTER TABLE public.gift_card_purchases
  ADD COLUMN IF NOT EXISTS delivery_channel text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'ar',
  ADD COLUMN IF NOT EXISTS buyer_user_id uuid,
  ADD COLUMN IF NOT EXISTS code_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS code_sent_by uuid;

-- The phone is required only for a code sent by WhatsApp: its own check is replaced by one on the
-- delivery chosen.
DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT con.conname FROM pg_constraint con
     WHERE con.conrelid = 'public.gift_card_purchases'::regclass AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) LIKE '%buyer_phone%'
  LOOP
    EXECUTE format('ALTER TABLE public.gift_card_purchases DROP CONSTRAINT %I', v_name);
  END LOOP;
END $$;
ALTER TABLE public.gift_card_purchases ALTER COLUMN buyer_phone DROP NOT NULL;
ALTER TABLE public.gift_card_purchases
  ADD CONSTRAINT gift_card_purchases_buyer_phone_check
    CHECK (buyer_phone IS NULL OR char_length(buyer_phone) BETWEEN 6 AND 32),
  ADD CONSTRAINT gift_card_purchases_delivery_check
    CHECK (
      (delivery_channel = 'whatsapp' AND buyer_phone IS NOT NULL)
      OR (delivery_channel = 'email' AND buyer_email IS NOT NULL)
    ),
  ADD CONSTRAINT gift_card_purchases_lang_check CHECK (lang IN ('ar', 'en'));

CREATE INDEX IF NOT EXISTS gift_card_purchases_buyer_user
  ON public.gift_card_purchases (buyer_user_id) WHERE buyer_user_id IS NOT NULL;

GRANT SELECT (delivery_channel, lang, buyer_user_id, code_sent_at, code_sent_by)
  ON public.gift_card_purchases TO authenticated;

-- A shopper's purchase, written by the server (`startGiftCardPurchase`): step four's function
-- (migration 20261104100000) with the delivery chosen, the language, and the shopper's account when
-- they are signed in (the server checks their session; a browser cannot name an account).
DROP FUNCTION IF EXISTS public.create_gift_card_purchase(text, numeric, text, jsonb, uuid);

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
    recipient_name, message, receipt_key, delivery_channel, lang, buyer_user_id
  ) VALUES (
    v_brand, v_amount, v_offer ->> 'currency', p_method, v_name, v_phone, v_email,
    left(NULLIF(btrim(p_buyer ->> 'recipient'), ''), 120),
    left(NULLIF(btrim(p_buyer ->> 'message'), ''), 300),
    v_receipt.object_key, v_channel, v_lang, p_user_id
  ) RETURNING * INTO v_purchase;

  RETURN jsonb_build_object('id', v_purchase.id, 'token', v_purchase.token, 'brand_id', v_brand);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_gift_card_purchase(text, numeric, text, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_gift_card_purchase(text, numeric, text, jsonb, uuid, uuid) TO service_role;

-- Staff record that a paid card's code was sent to its buyer on WhatsApp (a person sends it).
CREATE OR REPLACE FUNCTION public.mark_gift_card_purchase_sent(p_purchase_id uuid)
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
  IF v_purchase.status <> 'paid' THEN
    RAISE EXCEPTION 'PURCHASE_NOT_PAID';
  END IF;
  UPDATE public.gift_card_purchases
     SET code_sent_at = COALESCE(code_sent_at, now()), code_sent_by = COALESCE(code_sent_by, auth.uid())
   WHERE id = v_purchase.id;
  RETURN jsonb_build_object('sent', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_gift_card_purchase_sent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_gift_card_purchase_sent(uuid) TO authenticated, service_role;

-- A signed-in shopper's own cards in this store: what they bought, where it stands, and the code
-- and what is left on it once paid. Nothing of anyone else's.
CREATE OR REPLACE FUNCTION public.storefront_my_gift_cards(p_brand_id uuid)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  amount numeric,
  currency text,
  status text,
  payment_method text,
  delivery_channel text,
  recipient_name text,
  code text,
  balance numeric,
  expires_on date,
  card_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id, p.created_at, p.amount, p.currency, p.status, p.payment_method, p.delivery_channel,
         p.recipient_name,
         CASE WHEN p.status = 'paid' THEN c.code END,
         CASE WHEN p.status = 'paid' THEN c.balance END,
         CASE WHEN p.status = 'paid' THEN c.expires_on END,
         CASE WHEN p.status = 'paid' THEN c.status END
    FROM public.gift_card_purchases p
    LEFT JOIN public.gift_cards c ON c.id = p.gift_card_id
   WHERE auth.uid() IS NOT NULL
     AND p.buyer_user_id = auth.uid()
     AND p.brand_id = p_brand_id
   ORDER BY p.created_at DESC
   LIMIT 100;
$function$;

REVOKE ALL ON FUNCTION public.storefront_my_gift_cards(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storefront_my_gift_cards(uuid) TO authenticated, service_role;

-- 2. What the store and the buyer are told -------------------------------------------------------

-- Each event of a purchase, once; the Worker sends the emails (`processGiftCardNotices`).
CREATE TABLE IF NOT EXISTS public.gift_card_purchase_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.gift_card_purchases(id) ON DELETE CASCADE,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('placed', 'paid', 'cancelled')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  UNIQUE (purchase_id, event)
);

CREATE INDEX IF NOT EXISTS gift_card_purchase_events_waiting
  ON public.gift_card_purchase_events (created_at) WHERE status IN ('pending', 'failed', 'processing');

ALTER TABLE public.gift_card_purchase_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gift_card_purchase_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.gift_card_purchase_events TO service_role;

-- The installed admin's alert kind for a gift card (on by default, like a new order).
ALTER TABLE public.push_notification_events
  DROP CONSTRAINT IF EXISTS push_notification_events_event_type_check;
ALTER TABLE public.push_notification_events
  ADD CONSTRAINT push_notification_events_event_type_check CHECK (event_type = ANY (ARRAY[
    'order_new', 'order_updated', 'review_due', 'review_completed', 'low_stock', 'system_failure',
    'booking_new', 'gift_card_new'
  ]));

ALTER TABLE public.web_push_subscriptions
  ALTER COLUMN preferences SET DEFAULT '{"order_new": true, "order_new_staff": false, "booking_new": true, "gift_card_new": true, "order_updated": false, "review_due": false, "review_completed": false, "low_stock": false, "system_failure": false}'::jsonb;
UPDATE public.web_push_subscriptions
   SET preferences = '{"gift_card_new": true}'::jsonb || preferences
 WHERE NOT (preferences ? 'gift_card_new');

-- A person sets their own device's choices: migration 20261028110000's function, with the gift
-- card kind known.
CREATE OR REPLACE FUNCTION public.set_web_push_alert_choices(p_endpoint text, p_choices jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_known text[] := ARRAY['order_new', 'order_new_staff', 'booking_new', 'gift_card_new',
    'order_updated', 'review_due', 'review_completed', 'low_stock', 'system_failure'];
  v_key text;
  v_value jsonb;
  v_clean jsonb := '{}'::jsonb;
  v_saved jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF jsonb_typeof(p_choices) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_CHOICES'; END IF;
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_choices) LOOP
    IF v_key = ANY (v_known) AND jsonb_typeof(v_value) = 'boolean' THEN
      v_clean := v_clean || jsonb_build_object(v_key, v_value);
    END IF;
  END LOOP;
  UPDATE public.web_push_subscriptions
     SET preferences = preferences || v_clean, updated_at = now()
   WHERE endpoint = p_endpoint AND user_id = auth.uid()
  RETURNING preferences INTO v_saved;
  IF v_saved IS NULL THEN RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND'; END IF;
  RETURN v_saved;
END;
$$;
REVOKE ALL ON FUNCTION public.set_web_push_alert_choices(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_web_push_alert_choices(text, jsonb) TO authenticated;

-- A purchase's events, whoever moved it: placed when written, paid when its card is issued,
-- cancelled when the store declines it. The admin is alerted to a transfer to check and to a card
-- paid on the store (a transfer the staff approved needs no alert: they did it).
CREATE OR REPLACE FUNCTION public.gift_card_purchase_notices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event text;
  v_amount text := trim(to_char(NEW.amount, 'FM999999990.000')) || ' ' || NEW.currency;
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
        'method', NEW.payment_method, 'delivery', NEW.delivery_channel)
    )
    ON CONFLICT (brand_id, dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.gift_card_purchase_notices() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_gift_card_purchase_notices ON public.gift_card_purchases;
CREATE TRIGGER trg_gift_card_purchase_notices
AFTER INSERT OR UPDATE OF status ON public.gift_card_purchases
FOR EACH ROW EXECUTE FUNCTION public.gift_card_purchase_notices();

-- The Worker takes the events waiting (a few at a time, each tried at most five times; one left
-- "processing" for ten minutes is taken again), with everything its emails say.
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
       AND (e.status IN ('pending', 'failed')
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
      'expires_on', CASE WHEN p.status = 'paid' THEN c.expires_on END
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

-- An event's emails went (or did not: its error, to be tried again).
CREATE OR REPLACE FUNCTION public.finish_gift_card_purchase_event(p_event_id uuid, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.gift_card_purchase_events
     SET status = CASE WHEN p_error IS NULL THEN 'processed' ELSE 'failed' END,
         last_error = left(p_error, 1000),
         processed_at = CASE WHEN p_error IS NULL THEN now() ELSE processed_at END
   WHERE id = p_event_id;
$function$;

REVOKE ALL ON FUNCTION public.finish_gift_card_purchase_event(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_gift_card_purchase_event(uuid, text) TO service_role;
