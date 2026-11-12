-- Gift add-ons: flower bouquets and the like, priced by the store (step two of the owner's request
-- of 2026-11-11 for gift orders).
--
-- A store lists what a shopper may add to a gift order (a bouquet, chocolates, a box), each with
-- its name in both languages, a picture and a price, switched available or not (the owner's
-- decision: no stock count). Checkout sends the ids of those chosen, never a price; the order
-- builder's gift step (`apply_order_gift`, redefined here from 20261202100000 with the add-ons
-- added) prices each from the store's own row and writes it as an order line under its own names,
-- after the code and the offers, so neither reaches it (the owner's decision), and before the tax.
-- An add-on is removed by archiving it, so an order that holds one still names it.

-- 1. The store's add-ons ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gift_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name_ar text NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 1 AND 80),
  name_en text NOT NULL CHECK (char_length(btrim(name_en)) BETWEEN 1 AND 80),
  description_ar text CHECK (char_length(description_ar) <= 200),
  description_en text CHECK (char_length(description_en) <= 200),
  image_url text CHECK (image_url IS NULL OR (image_url ~ '^https://' AND char_length(image_url) <= 1000)),
  price numeric(12, 3) NOT NULL CHECK (price > 0 AND price <= 10000),
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gift_addons_brand ON public.gift_addons (brand_id, sort_order, created_at);

ALTER TABLE public.gift_addons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gift_addons FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gift_addons TO authenticated;
GRANT ALL ON TABLE public.gift_addons TO service_role;
DROP POLICY IF EXISTS "Staff read their store's gift add-ons" ON public.gift_addons;
CREATE POLICY "Staff read their store's gift add-ons" ON public.gift_addons
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

-- Staff who may change the store's settings add one, or change one by its id (the last argument).
CREATE OR REPLACE FUNCTION public.save_gift_addon(
  p_brand_id uuid,
  p_name_ar text,
  p_name_en text,
  p_description_ar text,
  p_description_en text,
  p_image_url text,
  p_price numeric,
  p_is_available boolean,
  p_sort_order integer,
  p_id uuid DEFAULT NULL
)
RETURNS public.gift_addons
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.gift_addons;
  v_name_ar text := NULLIF(btrim(COALESCE(p_name_ar, '')), '');
  v_name_en text := NULLIF(btrim(COALESCE(p_name_en, '')), '');
  v_image text := NULLIF(btrim(COALESCE(p_image_url, '')), '');
BEGIN
  IF p_brand_id IS NULL OR NOT public.can_access_brand(p_brand_id)
     OR NOT public.has_permission('manage_settings') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  -- A name in one language serves the other until it is written.
  v_name_ar := COALESCE(v_name_ar, v_name_en);
  v_name_en := COALESCE(v_name_en, v_name_ar);
  IF v_name_ar IS NULL THEN
    RAISE EXCEPTION 'GIFT_ADDON_NAME_REQUIRED';
  END IF;
  IF p_price IS NULL OR p_price <= 0 OR p_price > 10000 THEN
    RAISE EXCEPTION 'GIFT_ADDON_PRICE_INVALID';
  END IF;
  IF v_image IS NOT NULL AND v_image !~ '^https://' THEN
    v_image := NULL;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.gift_addons (
      brand_id, name_ar, name_en, description_ar, description_en, image_url, price,
      is_available, sort_order
    ) VALUES (
      p_brand_id, left(v_name_ar, 80), left(v_name_en, 80),
      NULLIF(left(btrim(COALESCE(p_description_ar, '')), 200), ''),
      NULLIF(left(btrim(COALESCE(p_description_en, '')), 200), ''),
      v_image, round(p_price, 3), COALESCE(p_is_available, true), COALESCE(p_sort_order, 0)
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.gift_addons
       SET name_ar = left(v_name_ar, 80),
           name_en = left(v_name_en, 80),
           description_ar = NULLIF(left(btrim(COALESCE(p_description_ar, '')), 200), ''),
           description_en = NULLIF(left(btrim(COALESCE(p_description_en, '')), 200), ''),
           image_url = v_image,
           price = round(p_price, 3),
           is_available = COALESCE(p_is_available, is_available),
           sort_order = COALESCE(p_sort_order, sort_order),
           updated_at = now()
     WHERE id = p_id AND brand_id = p_brand_id AND archived_at IS NULL
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'GIFT_ADDON_NOT_FOUND';
    END IF;
  END IF;
  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_gift_addon(uuid, text, text, text, text, text, numeric, boolean, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_gift_addon(uuid, text, text, text, text, text, numeric, boolean, integer, uuid)
  TO authenticated, service_role;

-- Removing one archives it: an order that holds it keeps its line and its name.
CREATE OR REPLACE FUNCTION public.archive_gift_addon(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand uuid;
BEGIN
  SELECT brand_id INTO v_brand FROM public.gift_addons WHERE id = p_id;
  IF v_brand IS NULL OR NOT public.can_access_brand(v_brand)
     OR NOT public.has_permission('manage_settings') THEN
    RAISE EXCEPTION 'GIFT_ADDON_NOT_FOUND';
  END IF;
  UPDATE public.gift_addons SET archived_at = now(), updated_at = now()
   WHERE id = p_id AND archived_at IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_gift_addon(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_gift_addon(uuid) TO authenticated, service_role;

-- What a visitor at the store's checkout may add, while the store takes gift orders.
CREATE OR REPLACE FUNCTION public.storefront_gift_addons(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', a.id, 'name_ar', a.name_ar, 'name_en', a.name_en,
           'description_ar', a.description_ar, 'description_en', a.description_en,
           'image_url', a.image_url, 'price', a.price
         ) ORDER BY a.sort_order, a.created_at), '[]'::jsonb)
    FROM public.brands b
    JOIN public.gift_addons a ON a.brand_id = b.id
   WHERE b.slug = p_slug AND b.is_active = true
     AND a.is_available AND a.archived_at IS NULL
     AND (public.gift_order_options(b.id) ->> 'enabled')::boolean;
$function$;

REVOKE ALL ON FUNCTION public.storefront_gift_addons(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_gift_addons(text) TO anon, authenticated, service_role;

-- 2. The order builder's gift step, with the add-ons ------------------------------------------------

-- As 20261202100000 made it, with `p_gift -> 'addons'` ([{ id, quantity }]) added: each must be one
-- of the store's add-ons, available and not archived (GIFT_ADDON_UNAVAILABLE), at most 10 of one;
-- each is a line at the store's price, its amount added to the subtotal, and the order's gift
-- details name what was added. Returns what the gift adds to the order.
CREATE OR REPLACE FUNCTION public.apply_order_gift(p_order_id uuid, p_gift jsonb)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_options jsonb;
  v_card boolean;
  v_price numeric(12, 3) := 0;
  v_design text;
  v_item uuid;
  v_wanted jsonb;
  v_addon public.gift_addons%ROWTYPE;
  v_quantity integer;
  v_line numeric(12, 3);
  v_addons jsonb := '[]'::jsonb;
  v_addons_total numeric(12, 3) := 0;
BEGIN
  IF p_gift IS NULL OR jsonb_typeof(p_gift) <> 'object' THEN
    RETURN 0;
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_options := public.gift_order_options(v_order.brand_id);
  IF NOT (v_options ->> 'enabled')::boolean THEN
    RAISE EXCEPTION 'GIFT_ORDER_NOT_OFFERED';
  END IF;
  IF (v_options ->> 'prepaid')::boolean AND lower(COALESCE(v_order.payment_method, '')) = 'cod' THEN
    RAISE EXCEPTION 'GIFT_ORDER_PREPAID';
  END IF;

  v_card := lower(COALESCE(p_gift ->> 'card', '')) = 'true';
  IF v_card AND NOT (v_options ->> 'card')::boolean THEN
    RAISE EXCEPTION 'GIFT_MESSAGE_CARD_NOT_OFFERED';
  END IF;
  -- One of the card designs, or none (the store prints its own default).
  v_design := NULLIF(btrim(COALESCE(p_gift ->> 'design', '')), '');
  IF v_design IS NOT NULL
     AND v_design !~ '^(signature|type|photo|pattern|block):(brand|black|cream|white)$' THEN
    v_design := NULL;
  END IF;

  IF v_card THEN
    v_price := (v_options ->> 'card_price')::numeric;
    IF v_price > 0 THEN
      INSERT INTO public.order_items (
        order_id, brand_id, user_id, description, name_en, name_ar, quantity, unit_price,
        line_total, location
      ) VALUES (
        v_order.id, v_order.brand_id, v_order.user_id, 'Gift message card', 'Gift message card',
        'بطاقة إهداء', 1, v_price, v_price, 'main'
      )
      RETURNING id INTO v_item;
      UPDATE public.orders SET subtotal = COALESCE(subtotal, 0) + v_price WHERE id = v_order.id;
    END IF;
  END IF;

  -- ADDED (20261203100000): the add-ons chosen, each at the store's own price.
  IF jsonb_typeof(p_gift -> 'addons') = 'array' THEN
    IF jsonb_array_length(p_gift -> 'addons') > 20 THEN
      RAISE EXCEPTION 'GIFT_ADDON_UNAVAILABLE';
    END IF;
    FOR v_wanted IN SELECT value FROM jsonb_array_elements(p_gift -> 'addons') LOOP
      IF jsonb_typeof(v_wanted) <> 'object'
         OR COALESCE(v_wanted ->> 'id', '') !~ '^[0-9a-fA-F-]{36}$' THEN
        RAISE EXCEPTION 'GIFT_ADDON_UNAVAILABLE';
      END IF;
      SELECT * INTO v_addon FROM public.gift_addons
       WHERE id = (v_wanted ->> 'id')::uuid AND brand_id = v_order.brand_id
         AND is_available AND archived_at IS NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'GIFT_ADDON_UNAVAILABLE';
      END IF;
      v_quantity := COALESCE(NULLIF(v_wanted ->> 'quantity', '')::integer, 1);
      IF v_quantity < 1 OR v_quantity > 10 THEN
        RAISE EXCEPTION 'GIFT_ADDON_UNAVAILABLE';
      END IF;
      v_line := v_addon.price * v_quantity;
      INSERT INTO public.order_items (
        order_id, brand_id, user_id, description, name_en, name_ar, quantity, unit_price,
        line_total, location
      ) VALUES (
        v_order.id, v_order.brand_id, v_order.user_id, v_addon.name_en, v_addon.name_en,
        v_addon.name_ar, v_quantity, v_addon.price, v_line, 'main'
      );
      v_addons_total := v_addons_total + v_line;
      v_addons := v_addons || jsonb_build_array(jsonb_build_object(
        'id', v_addon.id, 'name_ar', v_addon.name_ar, 'name_en', v_addon.name_en,
        'quantity', v_quantity, 'price', v_addon.price));
    END LOOP;
    IF v_addons_total > 0 THEN
      UPDATE public.orders SET subtotal = COALESCE(subtotal, 0) + v_addons_total
       WHERE id = v_order.id;
    END IF;
  END IF;

  UPDATE public.orders
     SET gift = jsonb_strip_nulls(jsonb_build_object(
           'recipient', NULLIF(left(btrim(COALESCE(p_gift ->> 'recipient', '')), 120), ''),
           'message', CASE WHEN v_card
             THEN NULLIF(left(btrim(COALESCE(p_gift ->> 'message', '')), 500), '') END,
           'from', NULLIF(left(btrim(COALESCE(p_gift ->> 'from', '')), 80), ''),
           'card', v_card,
           'card_price', v_price,
           'card_item_id', v_item,
           'design', CASE WHEN v_card THEN v_design END,
           'addons', CASE WHEN jsonb_array_length(v_addons) > 0 THEN v_addons END))
   WHERE id = v_order.id;
  RETURN v_price + v_addons_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_order_gift(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_gift(uuid, jsonb) TO service_role;
