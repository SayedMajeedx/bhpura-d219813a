-- A printed gift card is printed by the store, never by the buyer (the owner's decision of
-- 2026-11-08): a shopper who wants it on paper asks the store to print and deliver it, and pays
-- the store's own fee for that on top of the card's value. The card holds its value only: the fee
-- pays for the printing and the delivery, it is never on the card.
--
-- The store turns printing on and sets its fee (`gift_card_settings.print_enabled`, `print_fee`,
-- written by `set_gift_card_print`, staff who may change settings). A purchase that asks for it
-- (`gift_card_purchases.print_by_store`) carries the fee as it was then, where to deliver and a
-- number to call there; what it costs the buyer is `total_due` (value plus fee), which the card
-- charge and the transfer check read. Staff record the card printed, then delivered
-- (`set_gift_card_print_step`).

-- 1. What the store offers -----------------------------------------------------------------------

ALTER TABLE public.gift_card_settings
  ADD COLUMN IF NOT EXISTS print_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_fee numeric(12, 3) NOT NULL DEFAULT 0;
ALTER TABLE public.gift_card_settings
  DROP CONSTRAINT IF EXISTS gift_card_settings_print_fee_check;
ALTER TABLE public.gift_card_settings
  ADD CONSTRAINT gift_card_settings_print_fee_check CHECK (print_fee >= 0 AND print_fee <= 1000);

CREATE OR REPLACE FUNCTION public.set_gift_card_print(
  p_brand_id uuid,
  p_enabled boolean,
  p_fee numeric
)
RETURNS public.gift_card_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fee numeric(12, 3) := round(COALESCE(p_fee, 0), 3);
  v_row public.gift_card_settings;
BEGIN
  IF p_brand_id IS NULL OR NOT public.can_access_brand(p_brand_id)
     OR NOT public.has_permission('manage_settings') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_fee < 0 OR v_fee > 1000 THEN
    RAISE EXCEPTION 'GIFT_CARD_PRINT_FEE_INVALID';
  END IF;

  INSERT INTO public.gift_card_settings (brand_id, print_enabled, print_fee, updated_at, updated_by)
  VALUES (p_brand_id, COALESCE(p_enabled, false), v_fee, now(), auth.uid())
  ON CONFLICT (brand_id) DO UPDATE
    SET print_enabled = EXCLUDED.print_enabled, print_fee = EXCLUDED.print_fee,
        updated_at = now(), updated_by = auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_gift_card_print(uuid, boolean, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_gift_card_print(uuid, boolean, numeric) TO authenticated, service_role;

-- What a visitor reads (migration 20261104100000's function) with the printing offer added.
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
     AND cardinality(s.amounts) > 0
     AND (COALESCE(bs.card_enabled, false) OR COALESCE(bs.benefit_enabled, false));
$function$;

REVOKE ALL ON FUNCTION public.storefront_gift_card_offer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_gift_card_offer(text) TO anon, authenticated, service_role;

-- 2. A purchase the store prints -------------------------------------------------------------------

ALTER TABLE public.gift_card_purchases
  ADD COLUMN IF NOT EXISTS print_by_store boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_fee numeric(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS print_address text,
  ADD COLUMN IF NOT EXISTS print_phone text,
  ADD COLUMN IF NOT EXISTS printed_at timestamptz,
  ADD COLUMN IF NOT EXISTS printed_by uuid,
  ADD COLUMN IF NOT EXISTS print_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS print_delivered_by uuid;
ALTER TABLE public.gift_card_purchases
  ADD COLUMN IF NOT EXISTS total_due numeric(12, 3) GENERATED ALWAYS AS (amount + print_fee) STORED;

ALTER TABLE public.gift_card_purchases DROP CONSTRAINT IF EXISTS gift_card_purchases_print_check;
ALTER TABLE public.gift_card_purchases
  ADD CONSTRAINT gift_card_purchases_print_check CHECK (
    print_fee >= 0 AND print_fee <= 1000
    AND (print_by_store OR (print_fee = 0 AND printed_at IS NULL AND print_delivered_at IS NULL))
    AND (NOT print_by_store OR (print_address IS NOT NULL AND print_phone IS NOT NULL))
    AND (print_address IS NULL OR char_length(print_address) BETWEEN 3 AND 400)
    AND (print_phone IS NULL OR char_length(print_phone) BETWEEN 6 AND 32)
  );

GRANT SELECT (print_by_store, print_fee, print_address, print_phone, printed_at, printed_by,
  print_delivered_at, print_delivered_by, total_due)
  ON public.gift_card_purchases TO authenticated;

-- A shopper's purchase (migration 20261107100000's function): a purchase asking the store to
-- print it (`p_buyer.print`: where to deliver and a number there) takes the store's fee as it is
-- now, and only while the store prints. Nothing else changed.
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
    print_by_store, print_fee, print_address, print_phone
  ) VALUES (
    v_brand, v_amount, v_offer ->> 'currency', p_method, v_name, v_phone, v_email,
    left(NULLIF(btrim(p_buyer ->> 'recipient'), ''), 120),
    left(NULLIF(btrim(p_buyer ->> 'message'), ''), 300),
    v_receipt.object_key, v_channel, v_lang, p_user_id, v_design,
    v_print, v_print_fee, v_print_address, v_print_phone
  ) RETURNING * INTO v_purchase;

  RETURN jsonb_build_object('id', v_purchase.id, 'token', v_purchase.token, 'brand_id', v_brand);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_gift_card_purchase(text, numeric, text, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_gift_card_purchase(text, numeric, text, jsonb, uuid, uuid) TO service_role;

-- 3. Staff record the printing --------------------------------------------------------------------

-- 'printed' once it is on paper, 'delivered' once it reached its address (delivered is printed
-- too). Only for a paid purchase the store prints; pressing again changes nothing.
CREATE OR REPLACE FUNCTION public.set_gift_card_print_step(p_purchase_id uuid, p_step text)
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
  IF NOT v_purchase.print_by_store THEN
    RAISE EXCEPTION 'PURCHASE_NOT_PRINTED_BY_STORE';
  END IF;
  IF v_purchase.status <> 'paid' THEN
    RAISE EXCEPTION 'PURCHASE_NOT_PAID';
  END IF;
  IF p_step NOT IN ('printed', 'delivered') THEN
    RAISE EXCEPTION 'GIFT_CARD_PRINT_STEP_INVALID';
  END IF;

  UPDATE public.gift_card_purchases
     SET printed_at = COALESCE(printed_at, now()),
         printed_by = CASE WHEN printed_at IS NULL THEN auth.uid() ELSE printed_by END,
         print_delivered_at = CASE WHEN p_step = 'delivered' THEN COALESCE(print_delivered_at, now()) ELSE print_delivered_at END,
         print_delivered_by = CASE WHEN p_step = 'delivered' AND print_delivered_at IS NULL THEN auth.uid() ELSE print_delivered_by END
   WHERE id = v_purchase.id
   RETURNING * INTO v_purchase;

  RETURN jsonb_build_object('printed_at', v_purchase.printed_at, 'delivered_at', v_purchase.print_delivered_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.set_gift_card_print_step(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_gift_card_print_step(uuid, text) TO authenticated, service_role;
