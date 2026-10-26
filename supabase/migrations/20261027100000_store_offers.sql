-- A store's automatic offers: a discount with no code, free delivery over an amount, and
-- buy X get Y (the owner's request of 2026-10-27, after comparing Boutq with another platform).
--
-- An offer reaches the lines of the cart it names (chosen products or categories, or every line;
-- a store may leave out pieces already on sale), and asks, of those lines, a least amount and a
-- least number of pieces. Then:
--   discount       a percentage (with an optional cap) or a fixed amount off the lines it reaches;
--   buy_x_get_y    for every X pieces bought from its lines, Y pieces from its "get" lines (the
--                  same lines when it names none) at a percentage off (100 = free), the cheapest
--                  pieces first, as many times as the cart allows (or up to max_sets);
--   free_delivery  the order's delivery fee is waived (local deliveries only unless the store
--                  says otherwise).
--
-- Combining (business_settings.offers_combine, the owner's decisions of 2026-10-27):
--   * one automatic price offer per order: the one that saves the most;
--   * against a promo code the shopper typed: 'best' (default) keeps whichever saves more (the
--     code on a tie), 'code_first' keeps the code, 'together' keeps both;
--   * free delivery always applies alongside, whatever else does.
-- Offers are for the storefront's orders only: the order builder applies them once its lines and
-- delivery fee are known; staff-made orders and bookings are not touched.
--
-- The rule is in the database alone: the order builder applies it (apply_store_offers) and the
-- checkout asks it what an order would get (storefront_offers_preview), so the two cannot differ.

-- ── The offers ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('discount', 'free_delivery', 'buy_x_get_y')),
  name_ar text NOT NULL DEFAULT '' CHECK (char_length(name_ar) <= 80),
  name_en text NOT NULL DEFAULT '' CHECK (char_length(name_en) <= 80),
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  -- What it asks of the lines it reaches.
  min_subtotal numeric(14,3) CHECK (min_subtotal IS NULL OR min_subtotal >= 0),
  min_items integer CHECK (min_items IS NULL OR min_items BETWEEN 1 AND 1000),
  -- The lines it reaches: none named = every line.
  product_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(product_ids) <= 500),
  category_slugs text[] NOT NULL DEFAULT '{}' CHECK (cardinality(category_slugs) <= 100),
  exclude_sale_items boolean NOT NULL DEFAULT false,
  -- discount
  discount_type text CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric(14,3) CHECK (discount_value IS NULL OR discount_value > 0),
  max_discount numeric(14,3) CHECK (max_discount IS NULL OR max_discount > 0),
  -- buy_x_get_y
  buy_quantity integer CHECK (buy_quantity IS NULL OR buy_quantity BETWEEN 1 AND 100),
  get_quantity integer CHECK (get_quantity IS NULL OR get_quantity BETWEEN 1 AND 100),
  get_product_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(get_product_ids) <= 500),
  get_category_slugs text[] NOT NULL DEFAULT '{}' CHECK (cardinality(get_category_slugs) <= 100),
  get_percent numeric(5,2) CHECK (get_percent IS NULL OR (get_percent > 0 AND get_percent <= 100)),
  max_sets integer CHECK (max_sets IS NULL OR max_sets BETWEEN 1 AND 100),
  -- free_delivery
  local_only boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_offers_dates CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT store_offers_shape CHECK (
    (kind = 'discount' AND discount_type IS NOT NULL AND discount_value IS NOT NULL
      AND (discount_type = 'fixed' OR discount_value <= 100))
    OR kind = 'free_delivery'
    OR (kind = 'buy_x_get_y' AND buy_quantity IS NOT NULL AND get_quantity IS NOT NULL
      AND get_percent IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS store_offers_brand_idx ON public.store_offers (brand_id, created_at);

DROP TRIGGER IF EXISTS trg_store_offers_updated_at ON public.store_offers;
CREATE TRIGGER trg_store_offers_updated_at
  BEFORE UPDATE ON public.store_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.store_offers ENABLE ROW LEVEL SECURITY;

-- Staff read them; staff who may change the store's settings (the Discounts page's rule) write
-- them. A visitor reads the live ones through storefront_active_offers, never the table.
DROP POLICY IF EXISTS "staff read store offers" ON public.store_offers;
CREATE POLICY "staff read store offers" ON public.store_offers
  FOR SELECT TO authenticated
  USING (public.can_access_brand(brand_id));

DROP POLICY IF EXISTS "settings managers write store offers" ON public.store_offers;
CREATE POLICY "settings managers write store offers" ON public.store_offers
  FOR ALL TO authenticated
  USING (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'))
  WITH CHECK (public.can_access_brand(brand_id) AND public.has_permission('manage_settings'));

REVOKE ALL ON public.store_offers FROM anon;

-- How an offer meets a promo code the shopper typed.
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS offers_combine text NOT NULL DEFAULT 'best'
    CHECK (offers_combine IN ('best', 'code_first', 'together'));

-- What an order got: the part of its discount that came from an offer, and the offers applied
-- (id, kind, names, amount), kept as they were when it was placed.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS offer_discount numeric(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS applied_offers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── The rule ────────────────────────────────────────────────────────────────────────────────────
-- A line is {product_id, category, quantity, line_total, on_sale}; an offer is a store_offers row
-- as jsonb.

-- Whether an offer reaches a line (p_get: its "get" lines, which are its own lines when it names
-- none).
CREATE OR REPLACE FUNCTION public.store_offer_reaches(p_offer jsonb, p_line jsonb, p_get boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NOT (COALESCE((p_offer ->> 'exclude_sale_items')::boolean, false)
              AND COALESCE((p_line ->> 'on_sale')::boolean, false))
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
$$;

-- What an offer takes off these lines: NULL when it does not qualify, 0 for free delivery.
CREATE OR REPLACE FUNCTION public.store_offer_saving(p_offer jsonb, p_lines jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_kind text := p_offer ->> 'kind';
  v_total numeric := 0;
  v_units integer := 0;
  v_saving numeric;
  v_x integer;
  v_y integer;
  v_prices numeric[];
  v_in_buy boolean[];
  v_buy integer;
  v_relevant integer;
  v_k integer;
  v_n integer;
  v_taken integer;
  v_sum numeric;
  i integer;
BEGIN
  SELECT COALESCE(sum((l ->> 'line_total')::numeric), 0), COALESCE(sum((l ->> 'quantity')::integer), 0)
    INTO v_total, v_units
    FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) AS l
   WHERE (l ->> 'quantity')::integer > 0
     AND public.store_offer_reaches(p_offer, l);

  IF v_units = 0 THEN RETURN NULL; END IF;
  IF (p_offer ->> 'min_subtotal') IS NOT NULL AND v_total < (p_offer ->> 'min_subtotal')::numeric THEN
    RETURN NULL;
  END IF;
  IF (p_offer ->> 'min_items') IS NOT NULL AND v_units < (p_offer ->> 'min_items')::integer THEN
    RETURN NULL;
  END IF;

  IF v_kind = 'free_delivery' THEN RETURN 0; END IF;

  IF v_kind = 'discount' THEN
    IF p_offer ->> 'discount_type' = 'percentage' THEN
      v_saving := round(v_total * (p_offer ->> 'discount_value')::numeric / 100, 3);
      IF (p_offer ->> 'max_discount') IS NOT NULL THEN
        v_saving := least(v_saving, (p_offer ->> 'max_discount')::numeric);
      END IF;
    ELSE
      v_saving := (p_offer ->> 'discount_value')::numeric;
    END IF;
    RETURN least(greatest(v_saving, 0), v_total);
  END IF;

  IF v_kind <> 'buy_x_get_y' THEN RETURN NULL; END IF;

  -- Every piece of the cart (up to 500 of a line), priced at its line's price per piece. The
  -- pieces given are the cheapest of the "get" lines (a piece that does not also count as bought
  -- first, at the same price); the sets are as many as leave enough pieces bought.
  v_x := (p_offer ->> 'buy_quantity')::integer;
  v_y := (p_offer ->> 'get_quantity')::integer;

  WITH pieces AS (
    SELECT l.ord, n,
           (l.line ->> 'line_total')::numeric / (l.line ->> 'quantity')::integer AS price,
           public.store_offer_reaches(p_offer, l.line) AS in_buy,
           public.store_offer_reaches(p_offer, l.line, true) AS in_get
      FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) WITH ORDINALITY AS l(line, ord)
     CROSS JOIN LATERAL generate_series(1, least((l.line ->> 'quantity')::integer, 500)) AS n
     WHERE (l.line ->> 'quantity')::integer > 0
  )
  SELECT array_agg(price ORDER BY price, in_buy, ord, n) FILTER (WHERE in_get),
         array_agg(in_buy ORDER BY price, in_buy, ord, n) FILTER (WHERE in_get),
         count(*) FILTER (WHERE in_buy),
         count(*) FILTER (WHERE in_buy OR in_get)
    INTO v_prices, v_in_buy, v_buy, v_relevant
    FROM pieces;

  IF v_prices IS NULL THEN RETURN 0; END IF;

  v_k := v_relevant / (v_x + v_y);
  IF (p_offer ->> 'max_sets') IS NOT NULL THEN
    v_k := least(v_k, (p_offer ->> 'max_sets')::integer);
  END IF;

  WHILE v_k > 0 LOOP
    v_n := v_k * v_y;
    IF v_n <= cardinality(v_prices) THEN
      v_taken := 0;
      v_sum := 0;
      FOR i IN 1 .. v_n LOOP
        v_sum := v_sum + v_prices[i];
        IF v_in_buy[i] THEN v_taken := v_taken + 1; END IF;
      END LOOP;
      IF v_buy - v_taken >= v_k * v_x THEN
        RETURN round(v_sum * (p_offer ->> 'get_percent')::numeric / 100, 3);
      END IF;
    END IF;
    v_k := v_k - 1;
  END LOOP;

  RETURN 0;
END;
$$;

-- What a cart gets from the store's live offers, against a promo code worth p_code_discount.
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
SET search_path = public
AS $$
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
    ELSIF v_saving > v_best_saving THEN
      v_best := o;
      v_best_saving := v_saving;
    END IF;
  END LOOP;

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

  IF v_offer > 0 THEN
    v_applied := v_applied || jsonb_build_array(jsonb_build_object(
      'id', v_best -> 'id', 'kind', v_best ->> 'kind',
      'name_ar', v_best ->> 'name_ar', 'name_en', v_best ->> 'name_en', 'amount', v_offer));
  END IF;
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
$$;

-- A store's offers that are on now, oldest first (the first of equal savings wins).
CREATE OR REPLACE FUNCTION public.store_offers_live(p_brand_id uuid, p_at timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY o.created_at, o.id), '[]'::jsonb)
    FROM public.store_offers o
   WHERE o.brand_id = p_brand_id
     AND o.is_active
     AND (o.starts_at IS NULL OR o.starts_at <= p_at)
     AND (o.ends_at IS NULL OR o.ends_at > p_at)
$$;

-- ── The order builder applies it ────────────────────────────────────────────────────────────────
-- Called once the order's lines exist and its promo code (if any) has been priced: works out the
-- offers from the order's own lines and writes the order's discount, the offers' part of it, the
-- offers applied, and drops a code that an offer beat. Returns the outcome (free_delivery tells
-- the builder to waive the fee). Server only.
CREATE OR REPLACE FUNCTION public.apply_store_offers(p_order_id uuid, p_fulfillment text, p_country text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_mode text;
  v_lines jsonb;
  v_has_code boolean;
  v_out jsonb;
BEGIN
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
    public.store_offers_live(v_order.brand_id, now()),
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
$$;

REVOKE ALL ON FUNCTION public.apply_store_offers(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_offers_live(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- ── What the storefront reads ───────────────────────────────────────────────────────────────────
-- What an order of these lines would get, for the checkout's summary: the same rule on the
-- browser's lines (as validate_promo_code is previewed), the code priced by validate_promo_code.
-- Bounded: 100 lines, 1,000 pieces a line; only the store's own variants count.
CREATE OR REPLACE FUNCTION public.storefront_offers_preview(
  p_brand_slug text,
  p_items jsonb,
  p_promo_code text DEFAULT NULL,
  p_fulfillment text DEFAULT 'delivery',
  p_country text DEFAULT NULL
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
    public.store_offers_live(v_brand_id, now()), v_lines, v_mode, v_code, p_fulfillment,
    NULLIF(upper(btrim(COALESCE(p_country, ''))), '')
  ) || jsonb_build_object('subtotal', v_subtotal, 'mode', v_mode);
END;
$$;

-- A store's offers that are on now, as a shopper may read them (the product page names the
-- offers that reach a product; the cart says how far free delivery is).
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
           'get_percent', o.get_percent, 'max_sets', o.max_sets, 'local_only', o.local_only
         ) ORDER BY o.created_at, o.id), '[]'::jsonb)
    FROM public.store_offers o
    JOIN public.brands b ON b.id = o.brand_id AND b.is_active
   WHERE b.slug = p_brand_slug
     AND o.is_active
     AND (o.starts_at IS NULL OR o.starts_at <= now())
     AND (o.ends_at IS NULL OR o.ends_at > now())
$$;

GRANT EXECUTE ON FUNCTION public.storefront_offers_preview(text, jsonb, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_active_offers(text) TO anon, authenticated;

-- ── The checkout's entry point ──────────────────────────────────────────────────────────────────
-- The live place_storefront_order (equal to 20261024140000's, read from production on 2026-10-27)
-- with the offers applied once the delivery fee is known: a qualifying free-delivery offer waives
-- the fee, and the tax is worked out on the subtotal after every discount, as before. The answer
-- carries the order's discount, its code (none when an offer beat it) and the offers applied.
CREATE OR REPLACE FUNCTION public.place_storefront_order(p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text, p_notes text DEFAULT NULL::text, p_fulfillment text DEFAULT 'delivery'::text, p_branch_id uuid DEFAULT NULL::uuid, p_digital_channel text DEFAULT NULL::text, p_digital_contact text DEFAULT NULL::text, p_promo_code text DEFAULT NULL::text, p_benefit_receipt_id uuid DEFAULT NULL::uuid, p_shipping_fee numeric DEFAULT NULL::numeric, p_shipping_zone text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_id uuid;
  v_receipt public.pending_benefit_receipts%ROWTYPE;
  v_result jsonb;
  v_order_id uuid;
  v_order public.orders%ROWTYPE;
  v_tax_rate numeric;
  v_vat_inclusive boolean;
  v_shipping_fee numeric;
  v_tax_amount numeric;
  v_taxable numeric;
  v_total numeric;
  v_invoice_number integer;
  v_email_token uuid;
  v_quantity integer;
  v_computed_fee numeric;
  -- ADDED (20261027100000)
  v_offers jsonb;
  
  -- Payload Fingerprint Variables
  v_current_hash text;
  v_claim public.idempotency_claims%ROWTYPE;
BEGIN
  -- Strict validation of client-supplied shipping fee
  IF p_shipping_fee IS NOT NULL AND p_shipping_fee < 0 THEN
    RAISE EXCEPTION 'INVALID_SHIPPING_FEE';
  END IF;

  SELECT id INTO v_brand_id
  FROM public.brands
  WHERE slug = p_brand_slug AND is_active = true;
  IF v_brand_id IS NULL THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;

  -- Compute fingerprint of incoming parameters to lock payload integrity
  v_current_hash := md5(
    COALESCE(p_customer::text, '') || 
    COALESCE(p_items::text, '') || 
    COALESCE(p_payment_method, '') || 
    COALESCE(p_notes, '') || 
    COALESCE(p_fulfillment, '')
  );

  -- 1. Claims Serialization Guard: Grab the lock before doing ANY side-effects
  IF p_idempotency_key IS NOT NULL THEN
    BEGIN
      -- Attempt to claim this key instantly
      INSERT INTO public.idempotency_claims (brand_id, idempotency_key, request_hash)
      VALUES (v_brand_id, p_idempotency_key, v_current_hash);
      
    EXCEPTION WHEN unique_violation THEN
      -- Key is already locked or completed! Re-query the row and obtain a FOR UPDATE lock.
      SELECT * INTO v_claim
      FROM public.idempotency_claims
      WHERE brand_id = v_brand_id AND idempotency_key = p_idempotency_key
      FOR UPDATE;
      
      -- Verify Request Integrity: Block hijacking / different cart payload reuse
      IF v_claim.request_hash IS DISTINCT FROM v_current_hash THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD';
      END IF;
      
      -- If the winner transaction committed successfully, cleanly return their completed receipt data
      IF v_claim.order_id IS NOT NULL THEN
        SELECT id, invoice_number, total, shipping, tax_amount, confirmation_email_token
        INTO v_order_id, v_invoice_number, v_total, v_shipping_fee, v_tax_amount, v_email_token
        FROM public.orders
        WHERE id = v_claim.order_id;
        
        RETURN jsonb_build_object(
          'success', true,
          'order_id', v_order_id,
          'invoice_number', v_invoice_number,
          'total', v_total,
          'shipping', v_shipping_fee,
          'tax_amount', v_tax_amount,
          'confirmation_email_token', v_email_token
        );
      ELSE
        -- The winning transaction rolled back. We now own the active claim lock and can proceed to place the order ourselves!
        UPDATE public.idempotency_claims
        SET request_hash = v_current_hash
        WHERE brand_id = v_brand_id AND idempotency_key = p_idempotency_key;
      END IF;
    END;
  END IF;

  -- 2. From here on, execution is completely serialized and locked
  IF p_payment_method = 'benefit' THEN
    IF p_benefit_receipt_id IS NULL THEN RAISE EXCEPTION 'BENEFIT_RECEIPT_REQUIRED'; END IF;
    SELECT * INTO v_receipt
    FROM public.pending_benefit_receipts
    WHERE id = p_benefit_receipt_id
      AND brand_id = v_brand_id
      AND uploaded_at IS NOT NULL
      AND consumed_at IS NULL
      AND expires_at > now()
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BENEFIT_RECEIPT_INVALID'; END IF;
  ELSIF p_benefit_receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'UNEXPECTED_BENEFIT_RECEIPT';
  END IF;

  v_result := public.place_storefront_order_core(
    p_brand_slug, p_customer, p_items, p_payment_method, p_notes,
    p_fulfillment, p_branch_id, p_digital_channel, p_digital_contact, p_promo_code
  );
  v_order_id := (v_result->>'order_id')::uuid;

  IF p_payment_method = 'benefit' THEN
    UPDATE public.orders
    SET status = 'pending_verification',
        payment_status = 'unpaid',
        benefit_receipt_url = v_receipt.public_url,
        benefit_receipt_key = v_receipt.object_key
    WHERE id = v_order_id AND brand_id = v_brand_id;

    UPDATE public.pending_benefit_receipts
    SET consumed_at = now()
    WHERE id = v_receipt.id;
  END IF;

  -- Authoritatively apply VAT inclusive/exclusive configurations and custom shipping zone fees
  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id FOR UPDATE;
  
  SELECT COALESCE(default_tax_rate, 10.0), COALESCE(vat_inclusive, false) INTO v_tax_rate, v_vat_inclusive
  FROM public.business_settings WHERE brand_id = v_brand_id;

  -- The delivery fee is the store's (bug #36): worked out here from its
  -- delivery settings, the destination the shopper chose (a shipping zone id
  -- and country in p_customer) and the order's quantity. A browser's fee is
  -- kept only when it is higher (an older checkout that sends no zone yet).
  IF p_fulfillment = 'delivery' THEN
    SELECT COALESCE(sum(quantity), 0)::integer INTO v_quantity
      FROM public.order_items WHERE order_id = v_order_id;
    v_computed_fee := public.storefront_delivery_fee(
      v_brand_id,
      NULLIF(btrim(p_customer ->> 'shipping_zone_id'), ''),
      NULLIF(upper(btrim(p_customer ->> 'country_code')), ''),
      v_quantity
    );
    v_shipping_fee := GREATEST(v_computed_fee, COALESCE(p_shipping_fee, 0));

    -- A signed-in member whose loyalty tier has free shipping pays none
    -- (bug #37). Only the member's own account counts: a guest who types a
    -- member's phone or email does not get it.
    IF auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1
        FROM public.orders o
        JOIN public.customers c
          ON c.id = o.customer_id AND c.auth_user_id = auth.uid()
        JOIN public.loyalty_accounts la
          ON la.brand_id = v_brand_id AND la.customer_id = c.id
        JOIN public.brand_loyalty_tiers t
          ON t.brand_id = v_brand_id AND t.tier_key = la.current_tier_key AND t.free_shipping
        JOIN public.brand_loyalty_programs lp
          ON lp.brand_id = v_brand_id AND lp.is_enabled
       WHERE o.id = v_order_id
    ) THEN
      v_shipping_fee := 0;
    END IF;
  ELSE
    v_shipping_fee := 0;
  END IF;

  -- ADDED (20261027100000): the store's automatic offers, worked out from the order's own lines
  -- against its promo code; a free-delivery offer waives the fee. The order's discount is read
  -- again for the tax below.
  v_offers := public.apply_store_offers(
    v_order_id, p_fulfillment, NULLIF(upper(btrim(COALESCE(p_customer ->> 'country_code', ''))), '')
  );
  IF COALESCE((v_offers ->> 'free_delivery')::boolean, false) THEN
    v_shipping_fee := 0;
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = v_order_id;

  v_taxable := greatest(0, v_order.subtotal - v_order.discount);
  
  IF v_vat_inclusive THEN
    v_tax_amount := v_taxable - (v_taxable / (1 + (v_tax_rate / 100)));
    v_total := v_taxable + v_shipping_fee;
  ELSE
    v_tax_amount := (v_taxable * v_tax_rate) / 100;
    v_total := v_taxable + v_tax_amount + v_shipping_fee;
  END IF;

  -- Apply final calculations
  UPDATE public.orders
  SET shipping = v_shipping_fee,
      tax_rate = v_tax_rate,
      tax_amount = v_tax_amount,
      total = v_total,
      idempotency_key = p_idempotency_key, 
      request_hash = v_current_hash,       
      advance_rules = CASE
        WHEN advance_rules IS NOT NULL
          AND lower(COALESCE(p_customer ->> 'pay_in_full', '')) = 'true'
          AND COALESCE(
            (SELECT s.advance_allow_full_payment FROM public.business_settings s WHERE s.brand_id = v_brand_id),
            true)
        THEN public.advance_full_payment_rules()
        ELSE advance_rules
      END,
      destination_country = CASE
        WHEN p_fulfillment = 'delivery' THEN NULLIF(upper(btrim(p_customer ->> 'country_code')), '')
        ELSE NULL
      END,
      delivery_address_snapshot = CASE 
        WHEN p_shipping_zone IS NOT NULL THEN COALESCE(delivery_address_snapshot, '{}'::jsonb) || jsonb_build_object('shipping_zone', p_shipping_zone)
        ELSE delivery_address_snapshot
      END
  WHERE id = v_order_id;

  -- ADDED (20261014130000): collected at a partner's shop. The order names the partner and its
  -- ready pieces come from it; refused (PICKUP_PARTNER_UNAVAILABLE) when the partner does not take
  -- pickups or does not hold every piece.
  IF p_fulfillment = 'pickup' AND NULLIF(btrim(COALESCE(p_customer ->> 'pickup_partner_id', '')), '') IS NOT NULL THEN
    PERFORM public.assign_order_pickup_partner(v_order_id, (p_customer ->> 'pickup_partner_id')::uuid);
  END IF;

  -- ADDED (20261024140000): the day, and the time window, the shopper picked for the order,
  -- checked against the store's delivery schedule; refused (DELIVERY_TIME_UNAVAILABLE) when the
  -- store does not offer it.
  IF NULLIF(btrim(COALESCE(p_customer ->> 'requested_date', '')), '') IS NOT NULL THEN
    PERFORM public.set_order_requested_time(
      v_order_id, p_customer ->> 'requested_date', p_customer ->> 'requested_slot'
    );
  END IF;

  -- 3. Link the successfully completed order to our claim record to unblock any waiting parallel queries
  IF p_idempotency_key IS NOT NULL THEN
    UPDATE public.idempotency_claims
    SET order_id = v_order_id
    WHERE brand_id = v_brand_id AND idempotency_key = p_idempotency_key;
  END IF;

  -- Reload the capability from the authoritative order row.
  SELECT confirmation_email_token
  INTO v_email_token
  FROM public.orders
  WHERE id = v_order_id AND brand_id = v_brand_id;

  v_result := v_result || jsonb_build_object(
    'total', v_total,
    'shipping', v_shipping_fee,
    'tax_amount', v_tax_amount,
    'confirmation_email_token', v_email_token,
    -- ADDED (20261027100000)
    'discount', v_order.discount,
    'promo_code', v_order.promo_code,
    'offers', COALESCE(v_offers -> 'applied', '[]'::jsonb)
  );

  RETURN v_result;
END;
$function$;
