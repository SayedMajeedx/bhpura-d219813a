-- A gift that arrives when the buyer chooses (improvement 3 of the final report, 2026-11-27,
-- second part): a birthday, Eid. The buyer picks a day and time and how it reaches the person it
-- is for: by email, sent by the system from the store's customer mailbox at that time, or by
-- WhatsApp, which a person at the store sends (there is no WhatsApp connection) once it is due.
--
--   - `gift_card_purchases.send_at`, `send_channel`, `recipient_email`, `recipient_phone`: set once,
--     right after the purchase is written, by `set_gift_card_purchase_schedule` (server-only, the
--     purchase's own token); `recipient_sent_at` when it went.
--   - An email gift that is due and paid becomes an event of the purchase outbox (`gift_due`,
--     queued by `enqueue_due_gift_sends`, which the Worker runs before it sends the outbox): its
--     first email is the gift link to the person it is for, its second tells the buyer it went.
--     `finish_gift_card_purchase_event` records it sent only when the gift's email really went (a
--     store with no mailbox skips it, and the store is then shown it to send by hand).
--   - Staff record a gift they sent by hand with `mark_gift_card_recipient_sent`.
-- A purchase not paid, cancelled or whose card was voided sends nothing.

-- 1. The schedule ---------------------------------------------------------------------------
ALTER TABLE public.gift_card_purchases
  ADD COLUMN IF NOT EXISTS send_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_channel text,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS recipient_sent_at timestamptz;

ALTER TABLE public.gift_card_purchases
  DROP CONSTRAINT IF EXISTS gift_card_purchases_send_channel_check,
  ADD CONSTRAINT gift_card_purchases_send_channel_check
    CHECK (send_channel IS NULL OR send_channel IN ('email', 'whatsapp')),
  DROP CONSTRAINT IF EXISTS gift_card_purchases_schedule_whole,
  ADD CONSTRAINT gift_card_purchases_schedule_whole CHECK (
    (send_at IS NULL) = (send_channel IS NULL)
    AND (send_channel IS DISTINCT FROM 'email' OR recipient_email IS NOT NULL)
    AND (send_channel IS DISTINCT FROM 'whatsapp' OR recipient_phone IS NOT NULL)
  );

COMMENT ON COLUMN public.gift_card_purchases.send_at IS
  'When the buyer wants the gift to reach the person it is for (null: the buyer sends it).';

-- Staff read a purchase column by column (its token is the buyer''s alone).
GRANT SELECT (send_at, send_channel, recipient_email, recipient_phone, recipient_sent_at)
  ON public.gift_card_purchases TO authenticated;

CREATE INDEX IF NOT EXISTS gift_card_purchases_due_idx
  ON public.gift_card_purchases (send_at)
  WHERE send_at IS NOT NULL AND recipient_sent_at IS NULL;

-- Set by the server once the purchase is written, with the purchase's own token.
CREATE OR REPLACE FUNCTION public.set_gift_card_purchase_schedule(
  p_purchase_id uuid,
  p_token text,
  p_send_at timestamptz,
  p_channel text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.gift_card_purchases%ROWTYPE;
  v_email text := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_phone text := NULLIF(regexp_replace(COALESCE(p_phone, ''), '[^0-9+]', '', 'g'), '');
BEGIN
  SELECT * INTO v_purchase FROM public.gift_card_purchases
   WHERE id = p_purchase_id AND token = p_token
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PURCHASE_NOT_FOUND';
  END IF;
  IF v_purchase.status NOT IN ('pending', 'paid') OR v_purchase.send_at IS NOT NULL THEN
    RAISE EXCEPTION 'GIFT_SCHEDULE_CLOSED';
  END IF;
  IF p_send_at IS NULL OR p_send_at < now() + interval '5 minutes'
     OR p_send_at > now() + interval '366 days' THEN
    RAISE EXCEPTION 'GIFT_SCHEDULE_TIME';
  END IF;
  IF p_channel = 'email' THEN
    IF v_email IS NULL OR length(v_email) > 200 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RAISE EXCEPTION 'GIFT_SCHEDULE_EMAIL';
    END IF;
    v_phone := NULL;
  ELSIF p_channel = 'whatsapp' THEN
    IF v_phone IS NULL OR length(regexp_replace(v_phone, '\D', '', 'g')) NOT BETWEEN 8 AND 15 THEN
      RAISE EXCEPTION 'GIFT_SCHEDULE_PHONE';
    END IF;
    v_email := NULL;
  ELSE
    RAISE EXCEPTION 'GIFT_SCHEDULE_CHANNEL';
  END IF;

  UPDATE public.gift_card_purchases
     SET send_at = p_send_at, send_channel = p_channel,
         recipient_email = v_email, recipient_phone = v_phone
   WHERE id = v_purchase.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_gift_card_purchase_schedule(uuid, text, timestamptz, text, text, text)
  FROM PUBLIC, anon, authenticated;

-- 2. Due email gifts join the outbox ---------------------------------------------------------
ALTER TABLE public.gift_card_purchase_events
  DROP CONSTRAINT IF EXISTS gift_card_purchase_events_event_check,
  ADD CONSTRAINT gift_card_purchase_events_event_check
    CHECK (event IN ('placed', 'paid', 'cancelled', 'gift_due'));

CREATE OR REPLACE FUNCTION public.enqueue_due_gift_sends()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.gift_card_purchase_events (purchase_id, brand_id, event)
  SELECT p.id, p.brand_id, 'gift_due'
    FROM public.gift_card_purchases p
    JOIN public.gift_cards c ON c.id = p.gift_card_id AND c.status = 'active'
   WHERE p.status = 'paid'
     AND p.send_channel = 'email'
     AND p.send_at <= now()
     AND p.recipient_sent_at IS NULL
  ON CONFLICT (purchase_id, event) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_due_gift_sends() FROM PUBLIC, anon, authenticated;

-- The live claim (migration 20261206100000) with what a due gift needs: where it goes, and the
-- card's gift link once paid.
CREATE OR REPLACE FUNCTION public.claim_gift_card_purchase_events(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      'addons_total', p.addons_total,
      -- ADDED (20261230100000): a scheduled gift.
      'send_at', p.send_at,
      'send_channel', p.send_channel,
      'recipient_email', p.recipient_email,
      -- The giver, only as the buyer wrote it on the card (the gift page names no one else).
      'gift_from', NULLIF(btrim(COALESCE(p.design ->> 'from', '')), ''),
      'gift_token', CASE WHEN p.status = 'paid' AND c.status = 'active' THEN c.share_token END
    ) ORDER BY e.created_at)
      FROM public.gift_card_purchase_events e
      JOIN public.gift_card_purchases p ON p.id = e.purchase_id
      JOIN public.brands b ON b.id = p.brand_id
      LEFT JOIN public.business_settings bs ON bs.brand_id = p.brand_id
      LEFT JOIN public.gift_cards c ON c.id = p.gift_card_id
     WHERE e.id = ANY (COALESCE(v_ids, '{}'))
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_gift_card_purchase_events(integer) FROM PUBLIC, anon, authenticated;

-- The live finish (migration 20261106100000), which also records a due gift sent when its email
-- went (`p_gift_sent`; a skipped email is not a sent gift).
DROP FUNCTION IF EXISTS public.finish_gift_card_purchase_event(uuid, text, boolean, boolean);
CREATE FUNCTION public.finish_gift_card_purchase_event(
  p_event_id uuid,
  p_error text DEFAULT NULL,
  p_customer_done boolean DEFAULT NULL,
  p_store_done boolean DEFAULT NULL,
  p_gift_sent boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase uuid;
  v_event text;
BEGIN
  UPDATE public.gift_card_purchase_events e
     SET customer_done = e.customer_done OR COALESCE(p_customer_done, p_error IS NULL),
         store_done = e.store_done OR COALESCE(p_store_done, p_error IS NULL),
         status = CASE WHEN p_error IS NULL THEN 'processed' ELSE 'failed' END,
         last_error = left(p_error, 1000),
         processed_at = CASE WHEN p_error IS NULL THEN now() ELSE e.processed_at END,
         next_attempt_at = CASE
           WHEN p_error IS NULL THEN NULL
           ELSE now() + make_interval(mins => 5 * GREATEST(e.attempts, 1) * GREATEST(e.attempts, 1))
         END
   WHERE e.id = p_event_id
  RETURNING e.purchase_id, e.event INTO v_purchase, v_event;

  IF v_event = 'gift_due' AND p_gift_sent IS TRUE THEN
    UPDATE public.gift_card_purchases
       SET recipient_sent_at = COALESCE(recipient_sent_at, now())
     WHERE id = v_purchase;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finish_gift_card_purchase_event(uuid, text, boolean, boolean, boolean)
  FROM PUBLIC, anon, authenticated;

-- 3. A gift a person at the store sent by hand ------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_gift_card_recipient_sent(p_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF v_purchase.send_at IS NULL THEN
    RAISE EXCEPTION 'GIFT_NOT_SCHEDULED';
  END IF;
  UPDATE public.gift_card_purchases
     SET recipient_sent_at = COALESCE(recipient_sent_at, now())
   WHERE id = v_purchase.id;
  RETURN jsonb_build_object('sent', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_gift_card_recipient_sent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_gift_card_recipient_sent(uuid) TO authenticated, service_role;
