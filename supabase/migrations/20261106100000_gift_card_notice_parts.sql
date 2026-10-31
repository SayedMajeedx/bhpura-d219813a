-- A gift card purchase's emails are sent once each (the owner's report of 2026-10-31: the buyer
-- received "gift card request received" four times, a minute apart, and on after the approval).
--
-- Each event of a purchase sends up to two emails: the buyer's and the store's. Migration
-- 20261105100000 recorded an event as one thing, so when the store's email failed the whole event
-- was tried again a minute later, and the buyer's email, already delivered, went again with it,
-- up to five times. Now each part is recorded on its own (`customer_done`, `store_done`): a retry
-- sends only what has not gone. A failed part waits longer each time (5, 20, 45 then 80 minutes),
-- and its reason stays in `last_error`.

ALTER TABLE public.gift_card_purchase_events
  ADD COLUMN IF NOT EXISTS customer_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS store_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

-- The events already tried: their buyer's email went (it is what was received again and again),
-- so it is not sent another time; only a store email still owed is tried again.
UPDATE public.gift_card_purchase_events
   SET customer_done = true
 WHERE attempts > 0
   AND status IN ('failed', 'processing');

-- The Worker takes the events waiting (migration 20261105100000's function), now leaving a failed
-- one alone until its next attempt is due, and saying which of its emails already went.
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

-- An event's emails as they went: each part done is kept done; with an error the event is tried
-- again later (only for what is left), else it is processed. A Worker still sending the two
-- arguments alone marks both parts by the error, as before.
DROP FUNCTION IF EXISTS public.finish_gift_card_purchase_event(uuid, text);

CREATE OR REPLACE FUNCTION public.finish_gift_card_purchase_event(
  p_event_id uuid,
  p_error text DEFAULT NULL,
  p_customer_done boolean DEFAULT NULL,
  p_store_done boolean DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
   WHERE e.id = p_event_id;
$function$;

REVOKE ALL ON FUNCTION public.finish_gift_card_purchase_event(uuid, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_gift_card_purchase_event(uuid, text, boolean, boolean) TO service_role;
