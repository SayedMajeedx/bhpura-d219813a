-- Gift card designs: the logo's size and the cards' own fonts (the owner's request of 2026-10-31,
-- after the designs went live: "an option to adjust the size of [the logo] and make sure all are
-- perfectly aligned", and fonts uploaded only for the cards, Arabic and English apart).
--
-- Both are the store's choices, kept with the others in `gift_card_settings.card_designs`:
--   logo_scale  how large the store's mark is drawn on every card, 0.5 to 2 (1 as designed);
--   fonts       {ar, en}: a font the store uploaded for the cards' large words in that language,
--               {url, name}, or nothing for the cards' own faces.
-- A font's address is kept only when it is one of the store's own uploads (the platform's media
-- host, the store's folder, a font file), as the uploader names it: a card is printed with it.
--
-- `set_gift_card_designs` and `storefront_gift_card_designs` (migration 20261107100000) are
-- redefined from that migration with these two kept and read.

CREATE OR REPLACE FUNCTION public.set_gift_card_designs(p_brand_id uuid, p_designs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pattern text := '^(signature|type|photo|pattern|block):(brand|black|cream|white)$';
  v_font_pattern text := '^https://[a-z0-9.-]+/brands/' || p_brand_id::text
    || '/font/[0-9a-f-]{36}[.](woff2|woff|ttf|otf)$';
  v_off jsonb;
  v_signature text;
  v_products jsonb;
  v_scale numeric := 1;
  v_fonts jsonb := '{}'::jsonb;
  v_lang text;
  v_font jsonb;
  v_name text;
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

  -- The logo's size: a number from a half to twice as designed, in steps of a twentieth.
  IF jsonb_typeof(p_designs -> 'logo_scale') = 'number' THEN
    v_scale := round(LEAST(GREATEST((p_designs ->> 'logo_scale')::numeric, 0.5), 2) * 20) / 20;
  END IF;

  -- The cards' fonts: the store's own uploads only, with a short name for the screens.
  FOREACH v_lang IN ARRAY ARRAY['ar', 'en'] LOOP
    v_font := p_designs -> 'fonts' -> v_lang;
    IF jsonb_typeof(v_font) = 'object' AND COALESCE(v_font ->> 'url', '') ~ v_font_pattern THEN
      v_name := left(btrim(regexp_replace(COALESCE(v_font ->> 'name', ''), '[[:cntrl:]<>"]', '', 'g')), 60);
      v_fonts := v_fonts || jsonb_build_object(
        v_lang,
        jsonb_build_object('url', v_font ->> 'url', 'name', NULLIF(v_name, ''))
      );
    END IF;
  END LOOP;

  v_clean := jsonb_build_object(
    'off', v_off,
    'signature', v_signature,
    'photo_products', v_products,
    'logo_scale', v_scale,
    'fonts', v_fonts
  );

  INSERT INTO public.gift_card_settings AS s (brand_id, card_designs, updated_at, updated_by)
  VALUES (p_brand_id, v_clean, now(), auth.uid())
  ON CONFLICT (brand_id) DO UPDATE
     SET card_designs = EXCLUDED.card_designs, updated_at = now(), updated_by = auth.uid();
  RETURN v_clean;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_gift_card_designs(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_gift_card_designs(uuid, jsonb) TO authenticated, service_role;

-- What a card is drawn with, now with the logo's size and the cards' fonts.
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
    'photos', to_jsonb(public.gift_card_store_photos(b.id)),
    'logo_scale', CASE WHEN jsonb_typeof(s.card_designs -> 'logo_scale') = 'number'
                       THEN s.card_designs -> 'logo_scale' ELSE to_jsonb(1) END,
    'fonts', CASE WHEN jsonb_typeof(s.card_designs -> 'fonts') = 'object'
                  THEN s.card_designs -> 'fonts' ELSE '{}'::jsonb END
  )
    FROM public.brands b
    LEFT JOIN public.gift_card_settings s ON s.brand_id = b.id
   WHERE b.id = p_brand_id AND b.is_active = true;
$function$;

REVOKE ALL ON FUNCTION public.storefront_gift_card_designs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_gift_card_designs(uuid) TO anon, authenticated, service_role;
