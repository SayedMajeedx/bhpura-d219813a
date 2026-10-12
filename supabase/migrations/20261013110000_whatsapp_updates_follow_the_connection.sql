-- WhatsApp order updates follow the store's own connection, not a store's name.
--
-- The checkout of one store (the code said `slug = 'pura'`) offered "Send me updates for this
-- order on WhatsApp" whether or not anything could be sent: that store's WhatsApp connection is
-- switched off, has no number and no active message, so a shopper who ticked the box was
-- promised messages that nothing would send. Three database functions carried the same name.
--
-- 1. storefront_whatsapp_updates_ready(brand): one answer to "can this store send WhatsApp
--    order updates now": a connection that is on, with a number, and an active "order placed"
--    message in its language. The checkout shows the box only then, and the consent is recorded
--    only then.
-- 2. The three functions below are the live ones with the store's name taken out. Each already
--    asked for the store's own enabled connection (or now asks through the function above), so
--    nothing changes for any store today: none has a connection that is on.

CREATE OR REPLACE FUNCTION public.storefront_whatsapp_updates_ready(p_brand_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.whatsapp_integrations i
    JOIN public.whatsapp_templates t
      ON t.brand_id = i.brand_id
     AND t.event_type = 'order_placed'
     AND t.language = i.default_language
     AND t.active = true
    WHERE i.brand_id = p_brand_id
      AND i.enabled = true
      AND i.provider = 'meta'
      AND i.phone_number_id IS NOT NULL
  );
$$;

COMMENT ON FUNCTION public.storefront_whatsapp_updates_ready(uuid) IS
  'Whether a store can send WhatsApp order updates now. Says yes or no and nothing else: the checkout asks it before offering the opt-in.';

-- A visitor's checkout asks it; it reveals one boolean about a public storefront.
GRANT EXECUTE ON FUNCTION public.storefront_whatsapp_updates_ready(uuid) TO anon, authenticated;

-- ── The consent: recorded only for a store that can send ────────────────────
CREATE OR REPLACE FUNCTION public.record_order_whatsapp_opt_in(p_order_id uuid, p_confirmation_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated boolean;
BEGIN
  UPDATE public.orders o
  SET whatsapp_transactional_opt_in_at = COALESCE(
        whatsapp_transactional_opt_in_at,
        now()
      )
  FROM public.brands b
  WHERE o.id = p_order_id
    AND o.brand_id = b.id
    AND public.storefront_whatsapp_updates_ready(o.brand_id)
    AND o.confirmation_email_token = p_confirmation_token;

  v_updated := FOUND;
  IF v_updated THEN
    PERFORM public.enqueue_order_whatsapp_event(p_order_id, 'order_placed');
  END IF;
  RETURN v_updated;
END;
$function$;

-- ── The queue: the store's own enabled connection is the gate ───────────────
CREATE OR REPLACE FUNCTION public.enqueue_order_whatsapp_event(p_order_id uuid, p_event_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_integration public.whatsapp_integrations%ROWTYPE;
  v_template public.whatsapp_templates%ROWTYPE;
  v_recipient text;
  v_customer_name text;
BEGIN
  SELECT o.*
  INTO v_order
  FROM public.orders o
  JOIN public.brands b ON b.id = o.brand_id
  WHERE o.id = p_order_id
    AND o.whatsapp_transactional_opt_in_at IS NOT NULL;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT *
  INTO v_integration
  FROM public.whatsapp_integrations
  WHERE brand_id = v_order.brand_id
    AND enabled = true
    AND provider = 'meta'
    AND phone_number_id IS NOT NULL;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT *
  INTO v_template
  FROM public.whatsapp_templates
  WHERE brand_id = v_order.brand_id
    AND event_type = p_event_type
    AND language = v_integration.default_language
    AND active = true;

  IF NOT FOUND THEN RETURN; END IF;

  v_recipient := public.normalize_whatsapp_recipient(v_order.customer_phone_snapshot);
  IF v_recipient IS NULL THEN RETURN; END IF;

  v_customer_name := COALESCE(NULLIF(trim(v_order.customer_name_snapshot), ''), 'Customer');

  INSERT INTO public.whatsapp_outbox (
    brand_id,
    order_id,
    event_type,
    language,
    recipient,
    template_name,
    parameters
  ) VALUES (
    v_order.brand_id,
    v_order.id,
    p_event_type,
    v_template.language,
    v_recipient,
    v_template.meta_template_name,
    jsonb_build_array(
      v_customer_name,
      v_order.invoice_number::text,
      concat(v_order.currency, ' ', to_char(v_order.total, 'FM999999990.000'))
    )
  )
  ON CONFLICT (order_id, event_type, recipient, language) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_outbox_event(p_event_id uuid)
 RETURNS TABLE(event_id uuid, brand_id uuid, recipient text, template_name text, language text, parameters jsonb, phone_number_id text, graph_api_version text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH claimed AS (
    UPDATE public.whatsapp_outbox o
    SET status = 'processing',
        attempts = attempts + 1,
        last_error = NULL,
        updated_at = now()
    FROM public.whatsapp_integrations i, public.brands b
    WHERE o.id = p_event_id
      AND o.brand_id = i.brand_id
      AND b.id = o.brand_id
      AND i.enabled = true
      AND i.phone_number_id IS NOT NULL
      AND o.status IN ('pending', 'failed')
      AND o.attempts < 5
      AND o.next_attempt_at <= now()
    RETURNING o.id, o.brand_id, o.recipient, o.template_name,
              o.language, o.parameters, i.phone_number_id,
              i.graph_api_version
  )
  SELECT * FROM claimed;
$function$;
