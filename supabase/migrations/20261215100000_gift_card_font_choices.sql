-- Card fonts chosen, never uploaded again (the owner's request of 2026-11-21: "do I upload every
-- time I want to change the font?"). A store's card fonts were one upload per language, and a new
-- upload replaced the last for good. Now, kept with the other choices in
-- `gift_card_settings.card_designs`:
--   fonts          {ar, en}: the gift cards' font in that language: one of the store's uploads
--                  {url, name}, or one of the platform's faces under /fonts {face}; nothing for the
--                  cards' own faces (as before);
--   message_fonts  {ar, en}: a gift message card's font, the same choices, and {face: 'own'} for
--                  the cards' own faces; nothing for the gift cards' font;
--   font_library   [{url, name}]: the store's uploads, kept to choose again (at most 12 sent, and
--                  any upload chosen above that is not among them).
-- A face is one of the platform's (`CARD_FACE_LIST` in src/features/gift-card-design/lib/card-faces.ts;
-- Inter has no Arabic letters, so it is an English choice only); an upload is the store's own file,
-- as before.
--
-- `set_gift_card_designs` is redefined from the live one (migration 20261108100000, checked against
-- the database on 2026-11-21) with these kept; `storefront_gift_card_designs` reads the message
-- card's fonts too (the kit staff print with reads it); the list of uploads is read by staff from
-- the table, as the settings screen alone needs it.

-- One font choice cleaned: an upload of the store's own (its name kept short and plain), a face
-- offered for that language, or, where `p_own`, the cards' own faces; else nothing.
CREATE OR REPLACE FUNCTION public.gift_card_font_choice(
  p_brand_id uuid,
  p_value jsonb,
  p_lang text,
  p_own boolean
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_value IS NULL OR jsonb_typeof(p_value) <> 'object' THEN NULL
    WHEN COALESCE(p_value ->> 'url', '') ~ (
      '^https://[a-z0-9.-]+/brands/' || p_brand_id::text
      || '/font/[0-9a-f-]{36}[.](woff2|woff|ttf|otf)$'
    ) THEN jsonb_build_object(
      'url', p_value ->> 'url',
      'name', NULLIF(
        left(btrim(regexp_replace(COALESCE(p_value ->> 'name', ''), '[[:cntrl:]<>"]', '', 'g')), 60),
        ''
      )
    )
    WHEN p_value ->> 'face' = ANY (
      CASE WHEN p_lang = 'ar'
           THEN ARRAY['kaff', 'bukra', 'zarid', 'readex', 'tajawal']
           ELSE ARRAY['kaff', 'bukra', 'zarid', 'readex', 'tajawal', 'inter'] END
    ) THEN jsonb_build_object('face', p_value ->> 'face')
    WHEN p_own AND p_value ->> 'face' = 'own' THEN jsonb_build_object('face', 'own')
  END
$function$;

REVOKE ALL ON FUNCTION public.gift_card_font_choice(uuid, jsonb, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_card_font_choice(uuid, jsonb, text, boolean) TO service_role;

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
  v_scale numeric := 1;
  v_fonts jsonb := '{}'::jsonb;
  v_message_fonts jsonb := '{}'::jsonb;
  v_library jsonb;
  v_lang text;
  v_font jsonb;
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

  -- The gift cards' fonts and the message card's, each language apart.
  FOREACH v_lang IN ARRAY ARRAY['ar', 'en'] LOOP
    v_font := public.gift_card_font_choice(p_brand_id, p_designs -> 'fonts' -> v_lang, v_lang, false);
    IF v_font IS NOT NULL THEN
      v_fonts := v_fonts || jsonb_build_object(v_lang, v_font);
    END IF;
    v_font := public.gift_card_font_choice(
      p_brand_id, p_designs -> 'message_fonts' -> v_lang, v_lang, true
    );
    IF v_font IS NOT NULL THEN
      v_message_fonts := v_message_fonts || jsonb_build_object(v_lang, v_font);
    END IF;
  END LOOP;

  -- The store's uploads, to choose again: the first twelve it sent (each address once, in its
  -- order), then any upload chosen above that is not among them.
  SELECT COALESCE(jsonb_agg(u.font ORDER BY u.ord), '[]'::jsonb) INTO v_library
    FROM (
      SELECT d.font, d.ord
        FROM (
          SELECT DISTINCT ON (c.font ->> 'url') c.font, c.ord
            FROM (
              SELECT public.gift_card_font_choice(p_brand_id, x.value, 'en', false) AS font, x.ord
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(p_designs -> 'font_library') = 'array'
                       THEN p_designs -> 'font_library' ELSE '[]'::jsonb END
                ) WITH ORDINALITY AS x(value, ord)
            ) c
           WHERE c.font ? 'url'
           ORDER BY c.font ->> 'url', c.ord
        ) d
       ORDER BY d.ord
       LIMIT 12
    ) u;
  SELECT v_library || COALESCE(jsonb_agg(p.font ORDER BY p.ord), '[]'::jsonb) INTO v_library
    FROM (
      SELECT DISTINCT ON (t.font ->> 'url') t.font, t.ord
        FROM (VALUES
          (v_fonts -> 'ar', 1), (v_fonts -> 'en', 2),
          (v_message_fonts -> 'ar', 3), (v_message_fonts -> 'en', 4)
        ) AS t(font, ord)
       WHERE t.font ? 'url'
       ORDER BY t.font ->> 'url', t.ord
    ) p
   WHERE NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(v_library) l WHERE l.value ->> 'url' = p.font ->> 'url'
   );

  v_clean := jsonb_build_object(
    'off', v_off,
    'signature', v_signature,
    'photo_products', v_products,
    'logo_scale', v_scale,
    'fonts', v_fonts,
    'message_fonts', v_message_fonts,
    'font_library', v_library
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

-- What a card is drawn with, now with the message card's fonts.
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
                  THEN s.card_designs -> 'fonts' ELSE '{}'::jsonb END,
    'message_fonts', CASE WHEN jsonb_typeof(s.card_designs -> 'message_fonts') = 'object'
                          THEN s.card_designs -> 'message_fonts' ELSE '{}'::jsonb END
  )
    FROM public.brands b
    LEFT JOIN public.gift_card_settings s ON s.brand_id = b.id
   WHERE b.id = p_brand_id AND b.is_active = true;
$function$;

REVOKE ALL ON FUNCTION public.storefront_gift_card_designs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_gift_card_designs(uuid) TO anon, authenticated, service_role;
