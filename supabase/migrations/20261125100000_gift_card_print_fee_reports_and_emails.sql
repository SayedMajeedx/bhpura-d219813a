-- The store's fee for printing and delivering a gift card (migration 20261124100000), where the
-- money is read: the reports, the purchase's emails and the store's alert.
--
-- The fee is the store's income for a service, never money held on a card: the report of gift
-- cards gives it per period apart from what cards hold (`print_fees`, `print_count`, counted on
-- the day the purchase was paid). The emails and the alert name what the buyer paid (the card's
-- value plus the fee) and, for a card the store prints, where it goes.

-- 1. The report of gift cards (migration 20261104100000's function) with the printing fees -------

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
    ) || (
      SELECT jsonb_build_object(
        'print_fees', COALESCE(sum(p.print_fee), 0),
        'print_count', count(*)
      )
      FROM public.gift_card_purchases p
      WHERE p.brand_id = v_brand AND p.status = 'paid' AND p.print_by_store
        AND p.paid_at >= v_from AND p.paid_at < v_to
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

-- 2. What the emails are given (migration 20261106100000's function) with the printing ----------

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
      'print_phone', p.print_phone
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

-- 3. The store's alert (migration 20261105100000's trigger) says what was paid ------------------

CREATE OR REPLACE FUNCTION public.gift_card_purchase_notices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event text;
  -- What the buyer paid: the card's value, plus the printing fee when the store prints it.
  v_amount text := trim(to_char(NEW.amount + COALESCE(NEW.print_fee, 0), 'FM999999990.000')) || ' ' || NEW.currency
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
        'print_by_store', NEW.print_by_store, 'print_fee', NEW.print_fee)
    )
    ON CONFLICT (brand_id, dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.gift_card_purchase_notices() FROM PUBLIC, anon, authenticated;
