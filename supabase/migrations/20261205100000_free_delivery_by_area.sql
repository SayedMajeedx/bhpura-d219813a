-- Free delivery for chosen areas (the owner's request of 2026-11-12: Sadad was missing from the
-- area list, a customer could not choose it, and the store wants a week of free delivery to Sadad
-- and the areas around it). A free-delivery offer may now name the areas of Bahrain it reaches
-- (store_offers.regions, the values of src/lib/bahrain-regions.ts: 'sadad', 'hamad_town', ...).
-- None named = every area, as before. An offer that names areas reaches a delivery inside Bahrain
-- whose address is in one of them; its dates (starts_at, ends_at) already bound it in time.
--
-- The rule stays the database's: store_offers_for_area drops the area offers a delivery is not
-- for, before store_offers_outcome weighs what is left. The order builder reads the area from the
-- order's own delivery address (orders.delivery_address_snapshot, written as the order is
-- inserted), never from the browser; the checkout's preview takes the area the shopper chose.

ALTER TABLE public.store_offers
  ADD COLUMN IF NOT EXISTS regions text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.store_offers DROP CONSTRAINT IF EXISTS store_offers_regions_shape;
ALTER TABLE public.store_offers ADD CONSTRAINT store_offers_regions_shape CHECK (
  cardinality(regions) <= 150
  AND char_length(array_to_string(regions, ',')) <= 4000
  AND (cardinality(regions) = 0 OR kind = 'free_delivery')
);

-- The offers a delivery to this area may get: every offer but an area offer for another area (or
-- an area offer at all when the delivery leaves Bahrain or names no area).
CREATE OR REPLACE FUNCTION public.store_offers_for_area(p_offers jsonb, p_region text, p_country text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(o ORDER BY ord), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(p_offers, '[]'::jsonb)) WITH ORDINALITY AS t(o, ord)
   WHERE jsonb_array_length(COALESCE(o -> 'regions', '[]'::jsonb)) = 0
      OR (COALESCE(NULLIF(upper(btrim(COALESCE(p_country, ''))), ''), 'BH') = 'BH'
          AND NULLIF(btrim(COALESCE(p_region, '')), '') IS NOT NULL
          AND (o -> 'regions') ? btrim(p_region))
$$;

REVOKE ALL ON FUNCTION public.store_offers_for_area(jsonb, text, text) FROM PUBLIC, anon, authenticated;

-- ── The order builder ───────────────────────────────────────────────────────────────────────────
-- 20261028120000's apply_store_offers with the area offers filtered by the order's own address.
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
           'on_sale', COALESCE(COALESCE(pv.original_price, 0) > pv.selling_price, false)
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
-- 20261027100000's storefront_offers_preview with the area the shopper chose. The five-argument
-- function is replaced, not overloaded: a page open across the release still calls it by name with
-- five arguments and reaches this one (p_region defaults to none), where two would be ambiguous.
DROP FUNCTION IF EXISTS public.storefront_offers_preview(text, jsonb, text, text, text);

CREATE OR REPLACE FUNCTION public.storefront_offers_preview(
  p_brand_slug text,
  p_items jsonb,
  p_promo_code text DEFAULT NULL,
  p_fulfillment text DEFAULT 'delivery',
  p_country text DEFAULT NULL,
  p_region text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
           round(greatest(COALESCE((i ->> 'line_total')::numeric, 0), 0), 3) AS line_total
      FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(i, ord)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'product_id', pv.product_id,
           'category', p.category,
           'quantity', a.quantity,
           'line_total', a.line_total,
           'on_sale', COALESCE(COALESCE(pv.original_price, 0) > pv.selling_price, false)
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
$$;

GRANT EXECUTE ON FUNCTION public.storefront_offers_preview(text, jsonb, text, text, text, text) TO anon, authenticated;

-- ── What a shopper reads ────────────────────────────────────────────────────────────────────────
-- 20261027100000's storefront_active_offers with the areas, so a shopper reads which areas an
-- offer is for and the cart does not promise it to everyone.
CREATE OR REPLACE FUNCTION public.storefront_active_offers(p_brand_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
           'regions', o.regions
         ) ORDER BY o.created_at, o.id), '[]'::jsonb)
    FROM public.store_offers o
    JOIN public.brands b ON b.id = o.brand_id AND b.is_active
   WHERE b.slug = p_brand_slug
     AND o.is_active
     AND (o.starts_at IS NULL OR o.starts_at <= now())
     AND (o.ends_at IS NULL OR o.ends_at > now())
$$;

GRANT EXECUTE ON FUNCTION public.storefront_active_offers(text) TO anon, authenticated;
