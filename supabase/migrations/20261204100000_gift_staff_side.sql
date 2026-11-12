-- Gift orders, the staff's side (step three of the owner's request of 2026-11-11 for gift orders).
--
-- A gift's message card and its add-ons (a bouquet) are order lines of their own (20261202100000,
-- 20261203100000), but nothing marked them as gift lines and none carried a cost: the margins put
-- them with "lines not linked to a product" and counted them as missing a cost. Now:
--
-- 1. Each gift line says what it is (`order_items.gift_line`: the card or an add-on), written by
--    the gift step alone; the lines already written are marked once from the orders' own details.
-- 2. The store's cost of the card and of each add-on is kept apart from what every member of
--    staff reads (`gift_item_costs`), read and written only by staff who may see the store's
--    finances (`can_view_brand_costs`, as a product's cost), so a price setter never sees it.
-- 3. The gift step writes that cost on each line it adds (`order_items.unit_cost`, which the line
--    cost snapshot keeps when it is given), so a line's cost is the one in force when it was sold.
-- 4. The margins report (`rpc_reporting_margins`, the live function with one kind added) gives
--    the gift lines their own row, "Gift services", beside "Alterations".

-- 1. Which lines are a gift's -----------------------------------------------------------------------

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS gift_line text
  CHECK (gift_line IS NULL OR gift_line IN ('card', 'addon'));
GRANT SELECT (gift_line) ON public.order_items TO authenticated;

-- The lines written before: the card by the id the order kept, an add-on by its name and quantity.
UPDATE public.order_items oi
   SET gift_line = 'card'
  FROM public.orders o
 WHERE oi.order_id = o.id
   AND oi.gift_line IS NULL
   AND o.gift ? 'card_item_id'
   AND oi.id::text = o.gift ->> 'card_item_id';

UPDATE public.order_items oi
   SET gift_line = 'addon'
  FROM public.orders o
 WHERE oi.order_id = o.id
   AND oi.gift_line IS NULL
   AND oi.product_id IS NULL
   AND oi.variant_id IS NULL
   AND jsonb_typeof(o.gift -> 'addons') = 'array'
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(o.gift -> 'addons') e
      WHERE e ->> 'name_en' = oi.name_en
        AND COALESCE(NULLIF(e ->> 'quantity', '')::integer, 1) = oi.quantity
   );

-- 2. What the card and each add-on cost the store ----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gift_item_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  -- None: the gift message card; else one of the store's add-ons.
  addon_id uuid REFERENCES public.gift_addons(id) ON DELETE CASCADE,
  cost numeric(12, 3) NOT NULL CHECK (cost >= 0 AND cost <= 10000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS gift_item_costs_one
  ON public.gift_item_costs (brand_id, COALESCE(addon_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.gift_item_costs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gift_item_costs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gift_item_costs TO authenticated;
GRANT ALL ON TABLE public.gift_item_costs TO service_role;
DROP POLICY IF EXISTS "Staff who see finances read gift costs" ON public.gift_item_costs;
CREATE POLICY "Staff who see finances read gift costs" ON public.gift_item_costs
  FOR SELECT TO authenticated USING (public.can_view_brand_costs(brand_id));

-- Sets the card's cost (no add-on) or an add-on's; no cost removes it. Finance staff only.
CREATE OR REPLACE FUNCTION public.set_gift_item_cost(p_brand_id uuid, p_addon_id uuid, p_cost numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_brand_id IS NULL OR NOT public.can_access_brand(p_brand_id)
     OR NOT public.can_view_brand_costs(p_brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_addon_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.gift_addons WHERE id = p_addon_id AND brand_id = p_brand_id
  ) THEN
    RAISE EXCEPTION 'GIFT_ADDON_NOT_FOUND';
  END IF;
  IF p_cost IS NOT NULL AND (p_cost < 0 OR p_cost > 10000) THEN
    RAISE EXCEPTION 'GIFT_COST_INVALID';
  END IF;

  DELETE FROM public.gift_item_costs
   WHERE brand_id = p_brand_id AND addon_id IS NOT DISTINCT FROM p_addon_id;
  IF p_cost IS NOT NULL THEN
    INSERT INTO public.gift_item_costs (brand_id, addon_id, cost, updated_by)
    VALUES (p_brand_id, p_addon_id, round(p_cost, 3), auth.uid());
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_gift_item_cost(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_gift_item_cost(uuid, uuid, numeric) TO authenticated, service_role;

-- What one gift item costs the store now, for the gift step (none when the store set none).
CREATE OR REPLACE FUNCTION public.gift_item_cost(p_brand_id uuid, p_addon_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT cost FROM public.gift_item_costs
   WHERE brand_id = p_brand_id AND addon_id IS NOT DISTINCT FROM p_addon_id;
$function$;

REVOKE ALL ON FUNCTION public.gift_item_cost(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_item_cost(uuid, uuid) TO service_role;

-- 3. The gift step writes each line's kind and cost ---------------------------------------------------

-- As 20261203100000 made it, with the kind and the store's cost on the lines it adds.
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
        line_total, location, gift_line, unit_cost
      ) VALUES (
        v_order.id, v_order.brand_id, v_order.user_id, 'Gift message card', 'Gift message card',
        'بطاقة إهداء', 1, v_price, v_price, 'main', 'card',
        -- ADDED (20261204100000): the card's line says it is the gift's, at the store's cost.
        public.gift_item_cost(v_order.brand_id, NULL)
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
        line_total, location, gift_line, unit_cost
      ) VALUES (
        v_order.id, v_order.brand_id, v_order.user_id, v_addon.name_en, v_addon.name_en,
        v_addon.name_ar, v_quantity, v_addon.price, v_line, 'main', 'addon',
        -- ADDED (20261204100000): an add-on's line says it is the gift's, at the store's cost.
        public.gift_item_cost(v_order.brand_id, v_addon.id)
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

-- 4. The margins report gives the gift lines a row of their own -------------------------------------

-- The live function (20261117100000), with a gift's lines a kind of their own beside an
-- alteration's charge, in the three places a line's kind is read.
CREATE OR REPLACE FUNCTION public.rpc_reporting_margins(p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_include_historical boolean DEFAULT false, p_brand_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_id uuid := public.reporting_brand_id(p_brand_slug);
BEGIN
  RETURN COALESCE((
    WITH sold AS (
      SELECT o.* FROM public.orders o
      WHERE o.brand_id = v_brand_id
        AND o.created_at >= p_start_date AND o.created_at < p_end_date
        AND public.reporting_counts_order(o.status, p_include_historical)
    ),
    lines AS (
      SELECT o.id AS order_id, o.currency, oi.product_id, CASE WHEN oi.gift_line IS NOT NULL THEN 'gift' WHEN EXISTS (
          SELECT 1 FROM public.order_alterations a WHERE a.charge_item_id = oi.id
        ) THEN 'alteration' END AS kind,
        oi.quantity, oi.unit_cost,
        COALESCE(o.subtotal, 0) AS order_subtotal, COALESCE(o.discount, 0) AS order_discount,
        lower(COALESCE(o.fulfillment_status, o.status, '')) IN
          ('fulfilled', 'delivered', 'completed', 'shipped', 'picked_up') AS has_left,
        COALESCE(oi.packaging_cost_snapshot, 0) AS packaging,
        GREATEST(COALESCE(oi.line_total, 0), 0) AS value,
        sum(GREATEST(COALESCE(oi.line_total, 0), 0)) OVER (PARTITION BY o.id) AS order_value,
        oi.quantity::numeric / NULLIF(sum(oi.quantity) OVER (PARTITION BY o.id), 0) AS quantity_share
      FROM sold o
      JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
    ),
    store_lines AS (
      SELECT currency, product_id, kind,
        sum(quantity)::numeric AS units,
        sum(order_subtotal * CASE WHEN order_value > 0 THEN value / order_value
          ELSE COALESCE(quantity_share, 0) END) AS gross_sales,
        sum(order_discount * CASE WHEN order_value > 0 THEN value / order_value
          ELSE COALESCE(quantity_share, 0) END) AS discounts,
        sum(quantity * (COALESCE(unit_cost, 0) + CASE WHEN has_left THEN packaging ELSE 0 END)) AS cost,
        sum(quantity) FILTER (WHERE unit_cost IS NULL)::numeric AS missing_cost_units
      FROM lines GROUP BY currency, product_id, kind
    ),
    returned AS (
      -- A processed return's merchandise refund, shared over the pieces it returned.
      SELECT o.currency, COALESCE(ri.product_id, oi.product_id) AS product_id,
        CASE WHEN oi.gift_line IS NOT NULL THEN 'gift' WHEN EXISTS (
          SELECT 1 FROM public.order_alterations a WHERE a.charge_item_id = oi.id
        ) THEN 'alteration' END AS kind,
        GREATEST(rr.total_item_refund - rr.pro_rated_discount_deduction, 0) *
          CASE WHEN sum(GREATEST(COALESCE(ri.total_price, 0), 0)) OVER (PARTITION BY rr.id) > 0
            THEN GREATEST(COALESCE(ri.total_price, 0), 0)
              / sum(GREATEST(COALESCE(ri.total_price, 0), 0)) OVER (PARTITION BY rr.id)
            ELSE 1.0 / count(*) OVER (PARTITION BY rr.id) END AS deduction,
        CASE WHEN ri.restocked THEN COALESCE(ri.restocked_quantity, 0) * COALESCE(oi.unit_cost, 0)
          ELSE 0 END AS cost_back
      FROM public.return_requests rr
      JOIN public.orders o ON o.id = rr.order_id AND o.brand_id = rr.brand_id
      JOIN public.return_items ri ON ri.return_id = rr.id AND ri.brand_id = rr.brand_id
      LEFT JOIN public.order_items oi ON oi.id = ri.order_item_id
      WHERE rr.brand_id = v_brand_id
        AND rr.refund_status = 'processed'
        AND rr.refund_processed_at >= p_start_date AND rr.refund_processed_at < p_end_date
        AND public.order_counts_as_sold(o.status)
    ),
    refunded_orders AS (
      -- A refund with no return record: the order's total, over its lines.
      SELECT o.currency, oi.product_id, CASE WHEN oi.gift_line IS NOT NULL THEN 'gift' WHEN EXISTS (
          SELECT 1 FROM public.order_alterations a WHERE a.charge_item_id = oi.id
        ) THEN 'alteration' END AS kind,
        o.total * CASE
          WHEN sum(GREATEST(COALESCE(oi.line_total, 0), 0)) OVER (PARTITION BY o.id) > 0
            THEN GREATEST(COALESCE(oi.line_total, 0), 0)
              / sum(GREATEST(COALESCE(oi.line_total, 0), 0)) OVER (PARTITION BY o.id)
          ELSE 1.0 / count(*) OVER (PARTITION BY o.id) END AS deduction
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id AND oi.brand_id = v_brand_id
      WHERE o.brand_id = v_brand_id
        AND lower(COALESCE(o.payment_status, '')) = 'refunded'
        AND o.created_at >= p_start_date AND o.created_at < p_end_date
        AND public.order_counts_as_sold(o.status)
        AND NOT EXISTS (
          SELECT 1 FROM public.return_requests r
          WHERE r.order_id = o.id AND r.refund_status = 'processed'
        )
    ),
    returns_by_product AS (
      SELECT currency, product_id, kind, sum(deduction) AS returns, sum(cost_back) AS cost_back
      FROM (
        SELECT currency, product_id, kind, deduction, cost_back FROM returned
        UNION ALL
        SELECT currency, product_id, kind, deduction, 0 FROM refunded_orders
      ) r
      GROUP BY currency, product_id, kind
    ),
    partner AS (
      SELECT i.currency, v.product_id, NULL::text AS kind,
        sum(s.quantity)::numeric AS units,
        sum(s.gross_amount) AS gross_sales,
        sum(s.product_cost_snapshot + s.packaging_cost_snapshot) AS cost
      FROM public.incubator_sales s
      JOIN public.incubators i ON i.id = s.incubator_id
      JOIN public.product_variants v ON v.id = s.variant_id
      WHERE s.brand_id = v_brand_id AND s.status = 'confirmed'
        AND s.sold_at >= p_start_date AND s.sold_at < p_end_date
      GROUP BY i.currency, v.product_id
    ),
    keys AS (
      SELECT currency, product_id, kind FROM store_lines
      UNION SELECT currency, product_id, kind FROM returns_by_product
      UNION SELECT currency, product_id, kind FROM partner
    )
    SELECT jsonb_agg(jsonb_build_object(
      'currency', k.currency,
      'product_id', k.product_id,
      'line_kind', k.kind,
      'product_name', p.name,
      'product_name_ar', p.name_ar,
      'category', cat.slug,
      'category_name', COALESCE(cat.name_en, p.category),
      'category_name_ar', cat.name_ar,
      'units', COALESCE(sl.units, 0) + COALESCE(pa.units, 0),
      'partner_units', COALESCE(pa.units, 0),
      -- Full precision: a product's share is rounded only where it is shown, so the products
      -- add up to the statement to the fils however many there are.
      'gross_sales', COALESCE(sl.gross_sales, 0) + COALESCE(pa.gross_sales, 0),
      'partner_sales', COALESCE(pa.gross_sales, 0),
      'discounts', COALESCE(sl.discounts, 0),
      'returns', COALESCE(rp.returns, 0),
      -- Not held at zero per product: a restocked return of an earlier sale gives its cost back
      -- in the period it was processed, as the statement counts it.
      'cost_of_goods', COALESCE(sl.cost, 0) + COALESCE(pa.cost, 0) - COALESCE(rp.cost_back, 0),
      'missing_cost_units', COALESCE(sl.missing_cost_units, 0)
    ) ORDER BY k.currency, p.name NULLS LAST)
    FROM keys k
    LEFT JOIN public.products p ON p.id = k.product_id
    LEFT JOIN LATERAL (
      SELECT c.slug, c.name_en, c.name_ar FROM public.categories c
      WHERE c.brand_id = v_brand_id AND p.category IS NOT NULL
        AND (c.slug = p.category OR lower(c.name_en) = lower(p.category))
      ORDER BY (c.slug = p.category) DESC
      LIMIT 1
    ) cat ON true
    LEFT JOIN store_lines sl ON sl.currency = k.currency AND sl.product_id IS NOT DISTINCT FROM k.product_id
      AND sl.kind IS NOT DISTINCT FROM k.kind
    LEFT JOIN returns_by_product rp ON rp.currency = k.currency AND rp.product_id IS NOT DISTINCT FROM k.product_id
      AND rp.kind IS NOT DISTINCT FROM k.kind
    LEFT JOIN partner pa ON pa.currency = k.currency AND pa.product_id IS NOT DISTINCT FROM k.product_id
      AND pa.kind IS NOT DISTINCT FROM k.kind
  ), '[]'::jsonb);
END;
$function$;
