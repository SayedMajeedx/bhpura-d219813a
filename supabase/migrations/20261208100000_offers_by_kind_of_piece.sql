-- Automatic offers by the kind of piece, and the best offer for each piece (the owner's request of
-- 2026-11-14).
--
-- Pura put some of its ready-made pieces on sale with its partner shop and wanted the same price
-- online: on the chosen products' ready pieces, never on a piece tailored to the customer's
-- measurements. Two things stood in the way:
--
-- 1. An offer could not tell a ready piece from a made-to-order one. It now says which it is for
--    (`store_offers.pieces`: 'any', as before; 'ready'; 'made_to_order'), and every line it is
--    weighed against says what it is: `made_to_order` is the order line's own mark
--    (order_items.location = 'custom', which the order builder sets for a made-to-order product
--    unless the shopper chose a ready size, `tailored: false`), and the checkout's preview works
--    it out from the cart by the builder's own rule (20261005130000: the product is made to order
--    and the item does not say tailored: false).
--
-- 2. An order got one automatic offer, the one that saved most, so a cart holding a partner
--    piece at 30% and a tailored abaya under the store-wide 20% lost one of them. Now each piece
--    takes the best percentage offer that reaches it (the owner's decision: what a shopper
--    expects, and what the storefront already showed on each card, `offer-price.ts`), each offer
--    capped by its own max_discount over the pieces it took; an offer's minimum amount or pieces
--    is still asked of every line it reaches. A fixed amount off and buy X get Y stay one per
--    order: the order takes the pieces' percentages together or the single best other offer,
--    whichever saves more. Against a typed code the total is weighed as before
--    (business_settings.offers_combine), and free delivery still applies alongside.
--
-- Redefined from the live functions with only these changes, marked ADDED: store_offer_reaches,
-- store_offers_outcome, apply_store_offers, storefront_offers_preview, storefront_active_offers.
-- A booking's lines carry no mark and read as ready pieces (a service is not made to order).

ALTER TABLE public.store_offers
  ADD COLUMN IF NOT EXISTS pieces text NOT NULL DEFAULT 'any'
    CHECK (pieces IN ('any', 'ready', 'made_to_order'));

COMMENT ON COLUMN public.store_offers.pieces IS
  'Which pieces the offer is for: any, ready (in stock), or made_to_order (made to the customer''s order).';

-- ── Whether an offer reaches a line ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.store_offer_reaches(p_offer jsonb, p_line jsonb, p_get boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT NOT (COALESCE((p_offer ->> 'exclude_sale_items')::boolean, false)
              AND COALESCE((p_line ->> 'on_sale')::boolean, false))
    -- ADDED (20261208100000): a ready piece or one made to order, as the offer asks.
    AND CASE COALESCE(p_offer ->> 'pieces', 'any')
      WHEN 'ready' THEN NOT COALESCE((p_line ->> 'made_to_order')::boolean, false)
      WHEN 'made_to_order' THEN COALESCE((p_line ->> 'made_to_order')::boolean, false)
      ELSE true
    END
    AND CASE
      WHEN p_get AND (jsonb_array_length(COALESCE(p_offer -> 'get_product_ids', '[]'::jsonb)) > 0
                      OR jsonb_array_length(COALESCE(p_offer -> 'get_category_slugs', '[]'::jsonb)) > 0)
        THEN COALESCE((p_offer -> 'get_product_ids') ? (p_line ->> 'product_id'), false)
          OR COALESCE((p_offer -> 'get_category_slugs') ? (p_line ->> 'category'), false)
      WHEN jsonb_array_length(COALESCE(p_offer -> 'product_ids', '[]'::jsonb)) = 0
           AND jsonb_array_length(COALESCE(p_offer -> 'category_slugs', '[]'::jsonb)) = 0
        THEN true
      ELSE COALESCE((p_offer -> 'product_ids') ? (p_line ->> 'product_id'), false)
        OR COALESCE((p_offer -> 'category_slugs') ? (p_line ->> 'category'), false)
    END
$function$;

-- ── What a cart gets ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.store_offers_outcome(
  p_offers jsonb,
  p_lines jsonb,
  p_mode text,
  p_code_discount numeric,
  p_fulfillment text,
  p_country text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  o jsonb;
  v_saving numeric;
  v_best jsonb;
  v_best_saving numeric := 0;
  v_free jsonb;
  v_subtotal numeric;
  v_code numeric := greatest(COALESCE(p_code_discount, 0), 0);
  v_keep boolean;
  v_offer numeric;
  v_applied jsonb := '[]'::jsonb;
  -- ADDED (20261208100000): the percentage offers that qualify, and what they take together.
  v_percent jsonb := '[]'::jsonb;
  v_pieces numeric := 0;
  v_pieces_applied jsonb := '[]'::jsonb;
  v_chosen jsonb;
  v_left numeric;
  a jsonb;
  v_amount numeric;
BEGIN
  SELECT COALESCE(sum((l ->> 'line_total')::numeric), 0)
    INTO v_subtotal
    FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS l
   WHERE (l ->> 'quantity')::integer > 0;

  FOR o IN SELECT value FROM jsonb_array_elements(COALESCE(p_offers, '[]'::jsonb)) LOOP
    v_saving := public.store_offer_saving(o, p_lines);
    CONTINUE WHEN v_saving IS NULL;
    IF o ->> 'kind' = 'free_delivery' THEN
      IF v_free IS NULL
         AND p_fulfillment = 'delivery'
         AND (NOT COALESCE((o ->> 'local_only')::boolean, true) OR COALESCE(p_country, 'BH') = 'BH') THEN
        v_free := o;
      END IF;
    ELSE
      IF o ->> 'kind' = 'discount' AND o ->> 'discount_type' = 'percentage' THEN
        v_percent := v_percent || jsonb_build_array(o);
      END IF;
      IF v_saving > v_best_saving THEN
        v_best := o;
        v_best_saving := v_saving;
      END IF;
    END IF;
  END LOOP;

  -- ADDED (20261208100000): each piece its best percentage offer (the highest; the older offer on
  -- a tie), each offer on the pieces it took, capped by its own max_discount.
  IF jsonb_array_length(v_percent) > 1 THEN
    WITH lines AS (
      SELECT ord, line
        FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) WITH ORDINALITY AS t(line, ord)
       WHERE (line ->> 'quantity')::integer > 0
    ), offers AS (
      SELECT ord AS oord, offer FROM jsonb_array_elements(v_percent) WITH ORDINALITY AS t(offer, ord)
    ), picked AS (
      SELECT DISTINCT ON (l.ord) l.ord, l.line, f.oord, f.offer
        FROM lines l
        JOIN offers f ON public.store_offer_reaches(f.offer, l.line)
       ORDER BY l.ord, (f.offer ->> 'discount_value')::numeric DESC, f.oord
    ), per_offer AS (
      SELECT oord, offer, sum((line ->> 'line_total')::numeric) AS total
        FROM picked GROUP BY oord, offer
    ), amounts AS (
      SELECT oord, offer,
             least(round(total * (offer ->> 'discount_value')::numeric / 100, 3),
                   COALESCE((offer ->> 'max_discount')::numeric, total),
                   total) AS amount
        FROM per_offer
    )
    SELECT COALESCE(sum(amount), 0),
           COALESCE(jsonb_agg(jsonb_build_object(
             'id', offer -> 'id', 'kind', offer ->> 'kind',
             'name_ar', offer ->> 'name_ar', 'name_en', offer ->> 'name_en', 'amount', amount)
             ORDER BY oord) FILTER (WHERE amount > 0), '[]'::jsonb)
      INTO v_pieces, v_pieces_applied
      FROM amounts;
  END IF;

  IF v_pieces > v_best_saving THEN
    v_best_saving := v_pieces;
    v_chosen := v_pieces_applied;
  ELSIF v_best IS NOT NULL THEN
    v_chosen := jsonb_build_array(jsonb_build_object(
      'id', v_best -> 'id', 'kind', v_best ->> 'kind',
      'name_ar', v_best ->> 'name_ar', 'name_en', v_best ->> 'name_en', 'amount', v_best_saving));
  ELSE
    v_chosen := '[]'::jsonb;
  END IF;

  v_code := least(v_code, v_subtotal);
  IF p_mode = 'together' THEN
    v_keep := v_code > 0;
    v_offer := least(v_best_saving, greatest(v_subtotal - v_code, 0));
  ELSIF p_mode = 'code_first' THEN
    v_keep := v_code > 0;
    v_offer := CASE WHEN v_keep THEN 0 ELSE v_best_saving END;
  ELSE
    v_keep := v_code > 0 AND v_code >= v_best_saving;
    v_offer := CASE WHEN v_keep THEN 0 ELSE v_best_saving END;
  END IF;

  -- ADDED (20261208100000): the offers applied, each its own part; what a code leaves room for
  -- comes off the last ones first.
  v_left := v_offer;
  FOR a IN SELECT value FROM jsonb_array_elements(v_chosen) LOOP
    v_amount := least((a ->> 'amount')::numeric, v_left);
    EXIT WHEN v_amount <= 0;
    v_applied := v_applied || jsonb_build_array(a || jsonb_build_object('amount', v_amount));
    v_left := v_left - v_amount;
  END LOOP;
  IF v_free IS NOT NULL THEN
    v_applied := v_applied || jsonb_build_array(jsonb_build_object(
      'id', v_free -> 'id', 'kind', 'free_delivery',
      'name_ar', v_free ->> 'name_ar', 'name_en', v_free ->> 'name_en', 'amount', 0));
  END IF;

  RETURN jsonb_build_object(
    'offer_discount', v_offer,
    'code_discount', CASE WHEN v_keep THEN v_code ELSE 0 END,
    'code_kept', v_keep,
    'code_dropped', v_code > 0 AND NOT v_keep,
    'free_delivery', v_free IS NOT NULL,
    'applied', v_applied
  );
END;
$function$;

-- ── The order builder's step ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_store_offers(p_order_id uuid, p_fulfillment text, p_country text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_mode text;
  v_lines jsonb;
  v_has_code boolean;
  v_out jsonb;
BEGIN
  IF current_setting('boutq.booking_order', true) = 'on' THEN
    RETURN jsonb_build_object('offer_discount', 0, 'code_discount', 0, 'code_kept', true,
      'code_dropped', false, 'free_delivery', false, 'applied', '[]'::jsonb);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(s.offers_combine, 'best') INTO v_mode
    FROM public.business_settings s WHERE s.brand_id = v_order.brand_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'product_id', oi.product_id,
           'category', p.category,
           'quantity', oi.quantity,
           'line_total', oi.line_total,
           'on_sale', COALESCE(COALESCE(pv.original_price, 0) > pv.selling_price, false),
           -- ADDED (20261208100000): a piece made to the customer's order.
           'made_to_order', COALESCE(oi.location = 'custom', false)
         ) ORDER BY oi.id), '[]'::jsonb)
    INTO v_lines
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
   WHERE oi.order_id = p_order_id;

  v_has_code := v_order.promo_code_id IS NOT NULL OR NULLIF(btrim(COALESCE(v_order.promo_code, '')), '') IS NOT NULL;

  v_out := public.store_offers_outcome(
    -- ADDED (20261205100000): an area offer only for an address in one of its areas.
    public.store_offers_for_area(
      public.store_offers_live(v_order.brand_id, now()),
      v_order.delivery_address_snapshot ->> 'region',
      p_country
    ),
    v_lines,
    COALESCE(v_mode, 'best'),
    CASE WHEN v_has_code THEN v_order.discount ELSE 0 END,
    p_fulfillment,
    p_country
  );

  UPDATE public.orders
     SET discount = CASE WHEN v_has_code THEN 0 ELSE discount END
                    + (v_out ->> 'code_discount')::numeric
                    + (v_out ->> 'offer_discount')::numeric,
         offer_discount = (v_out ->> 'offer_discount')::numeric,
         applied_offers = v_out -> 'applied',
         promo_code = CASE WHEN (v_out ->> 'code_dropped')::boolean THEN NULL ELSE promo_code END,
         promo_code_id = CASE WHEN (v_out ->> 'code_dropped')::boolean THEN NULL ELSE promo_code_id END
   WHERE id = p_order_id;

  RETURN v_out;
END;
$function$;

-- ── The checkout's preview ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.storefront_offers_preview(p_brand_slug text, p_items jsonb, p_promo_code text DEFAULT NULL::text, p_fulfillment text DEFAULT 'delivery'::text, p_country text DEFAULT NULL::text, p_region text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_id uuid;
  v_mode text;
  v_lines jsonb;
  v_items jsonb;
  v_subtotal numeric;
  v_promo jsonb;
  v_code numeric := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) > 100 THEN
    RAISE EXCEPTION 'INVALID_ITEMS';
  END IF;

  SELECT b.id, COALESCE(s.offers_combine, 'best')
    INTO v_brand_id, v_mode
    FROM public.brands b
    LEFT JOIN public.business_settings s ON s.brand_id = b.id
   WHERE b.slug = p_brand_slug AND b.is_active;
  IF v_brand_id IS NULL THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;

  WITH asked AS (
    SELECT ord,
           NULLIF(i ->> 'variant_id', '')::uuid AS variant_id,
           least(greatest(COALESCE((i ->> 'quantity')::integer, 0), 0), 1000) AS quantity,
           round(greatest(COALESCE((i ->> 'line_total')::numeric, 0), 0), 3) AS line_total,
           -- ADDED (20261208100000): the shopper chose a ready size (the builder's own reading).
           COALESCE(i ->> 'tailored', 'true') <> 'false' AS tailored
      FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(i, ord)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'product_id', pv.product_id,
           'category', p.category,
           'quantity', a.quantity,
           'line_total', a.line_total,
           'on_sale', COALESCE(COALESCE(pv.original_price, 0) > pv.selling_price, false),
           -- ADDED (20261208100000): made to order as the order builder will write it.
           'made_to_order', COALESCE(p.is_made_to_order, false) AND a.tailored
         ) ORDER BY a.ord), '[]'::jsonb),
         COALESCE(jsonb_agg(jsonb_build_object('variant_id', a.variant_id, 'line_total', a.line_total)
           ORDER BY a.ord), '[]'::jsonb),
         COALESCE(sum(a.line_total), 0)
    INTO v_lines, v_items, v_subtotal
    FROM asked a
    JOIN public.product_variants pv ON pv.id = a.variant_id AND pv.brand_id = v_brand_id
    JOIN public.products p ON p.id = pv.product_id
   WHERE a.quantity > 0;

  IF NULLIF(btrim(COALESCE(p_promo_code, '')), '') IS NOT NULL THEN
    v_promo := public.validate_promo_code(p_brand_slug, p_promo_code, v_subtotal, v_items, NULL);
    IF COALESCE((v_promo ->> 'valid')::boolean, false) THEN
      v_code := COALESCE((v_promo ->> 'discount_amount')::numeric, 0);
    END IF;
  END IF;

  RETURN public.store_offers_outcome(
    public.store_offers_for_area(public.store_offers_live(v_brand_id, now()), left(p_region, 64), p_country),
    v_lines, v_mode, v_code, p_fulfillment,
    NULLIF(upper(btrim(COALESCE(p_country, ''))), '')
  ) || jsonb_build_object('subtotal', v_subtotal, 'mode', v_mode);
END;
$function$;

-- ── What a shopper reads ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.storefront_active_offers(p_brand_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', o.id, 'kind', o.kind, 'name_ar', o.name_ar, 'name_en', o.name_en,
           'ends_at', o.ends_at, 'min_subtotal', o.min_subtotal, 'min_items', o.min_items,
           'product_ids', o.product_ids, 'category_slugs', o.category_slugs,
           'exclude_sale_items', o.exclude_sale_items,
           'discount_type', o.discount_type, 'discount_value', o.discount_value,
           'max_discount', o.max_discount,
           'buy_quantity', o.buy_quantity, 'get_quantity', o.get_quantity,
           'get_product_ids', o.get_product_ids, 'get_category_slugs', o.get_category_slugs,
           'get_percent', o.get_percent, 'max_sets', o.max_sets, 'local_only', o.local_only,
           'regions', o.regions,
           -- ADDED (20261208100000)
           'pieces', o.pieces
         ) ORDER BY o.created_at, o.id), '[]'::jsonb)
    FROM public.store_offers o
    JOIN public.brands b ON b.id = o.brand_id AND b.is_active
   WHERE b.slug = p_brand_slug
     AND o.is_active
     AND (o.starts_at IS NULL OR o.starts_at <= now())
     AND (o.ends_at IS NULL OR o.ends_at > now())
$function$;
