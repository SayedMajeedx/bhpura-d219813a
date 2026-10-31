-- Gift card designs (the owner's brief of 2026-10-31: minimal but luxurious, with the variety
-- Apple, Airbnb and Sephora give their cards; the store curates and the buyer picks).
--
-- A card is drawn by the app from the store's own colours, logo and photos (src/features/
-- gift-card-design): a design is a composition on a tone, the occasion gives its words. What the
-- buyer chose is kept on the purchase (`gift_card_purchases.design`), so the card looks the same on
-- the purchase's page, in the shopper's account, on the store's screens and on paper. What the
-- store chose is `gift_card_settings.card_designs`: the designs it turned off, its signature card,
-- and the products whose photos the photo designs use (its newest with a photo until it chooses).

-- 1. The columns ---------------------------------------------------------------------------------

ALTER TABLE public.gift_card_purchases
  ADD COLUMN IF NOT EXISTS design jsonb;
ALTER TABLE public.gift_card_purchases
  DROP CONSTRAINT IF EXISTS gift_card_purchases_design_check;
ALTER TABLE public.gift_card_purchases
  ADD CONSTRAINT gift_card_purchases_design_check
  CHECK (design IS NULL OR (jsonb_typeof(design) = 'object' AND octet_length(design::text) <= 2000));
GRANT SELECT (design) ON public.gift_card_purchases TO authenticated;

ALTER TABLE public.gift_card_settings
  ADD COLUMN IF NOT EXISTS card_designs jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.gift_card_settings
  DROP CONSTRAINT IF EXISTS gift_card_settings_card_designs_check;
ALTER TABLE public.gift_card_settings
  ADD CONSTRAINT gift_card_settings_card_designs_check
  CHECK (jsonb_typeof(card_designs) = 'object' AND octet_length(card_designs::text) <= 4000);

-- 2. The store's photos for the photo designs ----------------------------------------------------

-- A product's photo as the storefront reads it: its main picture, else its gallery's first.
CREATE OR REPLACE FUNCTION public.gift_card_product_photo(p_image_url text, p_media jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    NULLIF(btrim(p_image_url), ''),
    (SELECT NULLIF(btrim(m ->> 'url'), '')
       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_media) = 'array' THEN p_media ELSE '[]'::jsonb END) m
      WHERE COALESCE(m ->> 'type', 'image') = 'image' AND NULLIF(btrim(m ->> 'url'), '') IS NOT NULL
      LIMIT 1)
  );
$function$;

-- The photos a store's photo designs may use: the products it chose, in its order, else its six
-- newest products on sale with a photo.
CREATE OR REPLACE FUNCTION public.gift_card_store_photos(p_brand_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_chosen jsonb;
  v_photos text[];
BEGIN
  SELECT s.card_designs -> 'photo_products' INTO v_chosen
    FROM public.gift_card_settings s WHERE s.brand_id = p_brand_id;
  IF jsonb_typeof(v_chosen) = 'array' AND jsonb_array_length(v_chosen) > 0 THEN
    SELECT array_agg(photo ORDER BY ord) INTO v_photos
      FROM (
        SELECT public.gift_card_product_photo(p.image_url, p.media) AS photo, c.ord
          FROM jsonb_array_elements_text(v_chosen) WITH ORDINALITY AS c(id, ord)
          JOIN public.products p
            ON p.id::text = c.id AND p.brand_id = p_brand_id AND p.is_active = true
      ) chosen
     WHERE photo IS NOT NULL;
  END IF;
  IF v_photos IS NULL THEN
    SELECT array_agg(photo ORDER BY created_at DESC) INTO v_photos
      FROM (
        SELECT public.gift_card_product_photo(p.image_url, p.media) AS photo, p.created_at
          FROM public.products p
         WHERE p.brand_id = p_brand_id AND p.is_active = true
           AND public.gift_card_product_photo(p.image_url, p.media) IS NOT NULL
         ORDER BY p.created_at DESC
         LIMIT 6
      ) newest;
  END IF;
  RETURN COALESCE(v_photos, '{}');
END;
$function$;

REVOKE ALL ON FUNCTION public.gift_card_product_photo(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gift_card_store_photos(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_card_store_photos(uuid) TO service_role;

-- 3. What the store chose, and what anyone drawing a card reads -----------------------------------

-- Staff who may change settings choose the designs: the ones turned off, the signature card, the
-- products whose photos are used. What is saved is cleaned: known designs only, the store's own
-- products, at most twelve.
CREATE OR REPLACE FUNCTION public.set_gift_card_designs(p_brand_id uuid, p_designs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pattern text := '^(signature|type|photo|pattern|block):(brand|black|cream|white)$';
  v_off jsonb;
  v_signature text;
  v_products jsonb;
  v_clean jsonb;
BEGIN
  IF p_brand_id IS NULL OR NOT public.can_access_brand(p_brand_id)
     OR NOT public.has_permission('manage_settings') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(DISTINCT d), '[]'::jsonb) INTO v_off
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p_designs -> 'off') = 'array' THEN p_designs -> 'off' ELSE '[]'::jsonb END
    ) d
   WHERE d ~ v_pattern;
  v_signature := p_designs ->> 'signature';
  IF v_signature IS NOT NULL AND (v_signature !~ v_pattern OR v_off ? v_signature) THEN
    v_signature := NULL;
  END IF;
  SELECT COALESCE(jsonb_agg(p.id::text ORDER BY c.ord), '[]'::jsonb) INTO v_products
    FROM (
      SELECT x.id, min(x.ord) AS ord
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(p_designs -> 'photo_products') = 'array'
               THEN p_designs -> 'photo_products' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS x(id, ord)
       GROUP BY x.id
       ORDER BY min(x.ord)
       LIMIT 12
    ) c
    JOIN public.products p ON p.id::text = c.id AND p.brand_id = p_brand_id;
  v_clean := jsonb_build_object('off', v_off, 'signature', v_signature, 'photo_products', v_products);

  INSERT INTO public.gift_card_settings AS s (brand_id, card_designs, updated_at, updated_by)
  VALUES (p_brand_id, v_clean, now(), auth.uid())
  ON CONFLICT (brand_id) DO UPDATE
     SET card_designs = EXCLUDED.card_designs, updated_at = now(), updated_by = auth.uid();
  RETURN v_clean;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_gift_card_designs(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_gift_card_designs(uuid, jsonb) TO authenticated, service_role;

-- What a card is drawn with, for anyone who sees one (the buyer, the person it is for, staff): the
-- designs turned off, the signature card and the photos. Nothing a store has not put on its
-- storefront already.
CREATE OR REPLACE FUNCTION public.storefront_gift_card_designs(p_brand_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'off', COALESCE(s.card_designs -> 'off', '[]'::jsonb),
    'signature', s.card_designs -> 'signature',
    'photo_products', COALESCE(s.card_designs -> 'photo_products', '[]'::jsonb),
    'photos', to_jsonb(public.gift_card_store_photos(b.id))
  )
    FROM public.brands b
    LEFT JOIN public.gift_card_settings s ON s.brand_id = b.id
   WHERE b.id = p_brand_id AND b.is_active = true;
$function$;

REVOKE ALL ON FUNCTION public.storefront_gift_card_designs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_gift_card_designs(uuid) TO anon, authenticated, service_role;

-- 4. The buyer's choice --------------------------------------------------------------------------

-- A design as a buyer sends it, cleaned: a known composition and tone, portrait or landscape, the
-- card's language, who it is from, one of the store's own photos, and whether they will print it.
-- Nothing sent keeps nothing; anything malformed is refused.
CREATE OR REPLACE FUNCTION public.gift_card_design_clean(p_brand_id uuid, p_design jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_occasion text;
  v_design text;
  v_orientation text;
  v_language text;
  v_from text;
  v_photo text;
  v_print boolean;
BEGIN
  IF p_design IS NULL OR jsonb_typeof(p_design) = 'null' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_design) <> 'object' THEN
    RAISE EXCEPTION 'GIFT_CARD_DESIGN_INVALID';
  END IF;
  v_occasion := COALESCE(NULLIF(p_design ->> 'occasion', ''), 'gift');
  v_design := p_design ->> 'design';
  v_orientation := COALESCE(NULLIF(p_design ->> 'orientation', ''), 'portrait');
  v_language := COALESCE(NULLIF(p_design ->> 'language', ''), 'ar');
  v_from := left(NULLIF(btrim(p_design ->> 'from'), ''), 80);
  v_photo := NULLIF(p_design ->> 'photo', '');
  v_print := jsonb_typeof(p_design -> 'print') = 'boolean' AND (p_design ->> 'print')::boolean;
  IF v_occasion !~ '^[a-z_]{1,32}$'
     OR v_design IS NULL OR v_design !~ '^(signature|type|photo|pattern|block):(brand|black|cream|white)$'
     OR v_orientation NOT IN ('portrait', 'landscape')
     OR v_language NOT IN ('ar', 'en', 'both') THEN
    RAISE EXCEPTION 'GIFT_CARD_DESIGN_INVALID';
  END IF;
  IF v_photo IS NOT NULL AND NOT (v_photo = ANY (public.gift_card_store_photos(p_brand_id))) THEN
    v_photo := NULL;
  END IF;
  RETURN jsonb_build_object(
    'occasion', v_occasion,
    'design', v_design,
    'orientation', v_orientation,
    'language', v_language,
    'from', v_from,
    'photo', v_photo,
    'print', v_print
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.gift_card_design_clean(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_card_design_clean(uuid, jsonb) TO service_role;

-- A shopper's purchase (migration 20261105100000's function) keeps the design they chose.
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
    recipient_name, message, receipt_key, delivery_channel, lang, buyer_user_id, design
  ) VALUES (
    v_brand, v_amount, v_offer ->> 'currency', p_method, v_name, v_phone, v_email,
    left(NULLIF(btrim(p_buyer ->> 'recipient'), ''), 120),
    left(NULLIF(btrim(p_buyer ->> 'message'), ''), 300),
    v_receipt.object_key, v_channel, v_lang, p_user_id, v_design
  ) RETURNING * INTO v_purchase;

  RETURN jsonb_build_object('id', v_purchase.id, 'token', v_purchase.token, 'brand_id', v_brand);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_gift_card_purchase(text, numeric, text, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_gift_card_purchase(text, numeric, text, jsonb, uuid, uuid) TO service_role;

-- A signed-in shopper's own cards (migration 20261105100000's function) with their design.
DROP FUNCTION IF EXISTS public.storefront_my_gift_cards(uuid);

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
  card_status text,
  design jsonb
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
         CASE WHEN p.status = 'paid' THEN c.status END,
         p.design
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
