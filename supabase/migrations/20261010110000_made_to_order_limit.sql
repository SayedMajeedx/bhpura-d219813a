-- A limit on how many pieces of a product can be made to order.
--
-- A made-to-order product could be ordered without end. A store can now say how many pieces it
-- can still make ("3 more of this abaya": the fabric it has), per product:
--
--   products.made_to_order_available   NULL = no limit (as before); N = pieces left to make
--
-- The number is a total. It goes down when an order with a made-to-order line of the product is
-- placed, and comes back only when that order is cancelled (or refunded, voided, failed): the same
-- moments the order engine reserves and releases ready stock, by the same engine
-- (order_inventory_transition), under the same locks. At 0 the product can no longer be ordered
-- made to order; its ready sizes, if it has any, are not affected.
--
-- Only orders placed after the limit was set count against it (made_to_order_limit_set_at): the
-- pieces already promised when a store first writes "3" are not taken out of the 3.
--
-- The number changes in two ways only, both recorded in made_to_order_movements: the order engine,
-- and set_made_to_order_limit (staff). A direct UPDATE of the column is refused, as for stock, so
-- a product form saved with an old number can never overwrite what orders have taken since.
--
-- Additive: two columns, two tables, three functions and two triggers are new;
-- order_inventory_transition and get_storefront_page_data are their live definitions with one line
-- added each (tests/made-to-order-limit-migration.test.ts).

-- 1. The limit on the product.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS made_to_order_available integer
    CHECK (made_to_order_available IS NULL OR made_to_order_available >= 0),
  ADD COLUMN IF NOT EXISTS made_to_order_limit_set_at timestamptz;

COMMENT ON COLUMN public.products.made_to_order_available IS
  'Pieces that can still be made to order (NULL = no limit). Changed only by the order engine and set_made_to_order_limit.';

-- Column-level grants replaced the table-level ones on products (20261007120000, 20261008100000).
GRANT SELECT (made_to_order_available, made_to_order_limit_set_at) ON public.products TO authenticated;
GRANT SELECT (made_to_order_available) ON public.products TO anon;

-- 2. Every change of the number, and what each order holds.
CREATE TABLE IF NOT EXISTS public.made_to_order_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN ('order_reserve', 'order_release', 'manual_set')),
  available_before integer,
  available_after integer,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_made_to_order_movements_product
  ON public.made_to_order_movements (product_id, created_at DESC);

ALTER TABLE public.made_to_order_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read made to order movements" ON public.made_to_order_movements;
CREATE POLICY "staff read made to order movements" ON public.made_to_order_movements
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

REVOKE ALL ON public.made_to_order_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.made_to_order_movements TO authenticated;
GRANT ALL ON public.made_to_order_movements TO service_role;

CREATE TABLE IF NOT EXISTS public.order_made_to_order_allocations (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_order_made_to_order_allocations_product
  ON public.order_made_to_order_allocations (product_id);

ALTER TABLE public.order_made_to_order_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read made to order allocations" ON public.order_made_to_order_allocations;
CREATE POLICY "staff read made to order allocations" ON public.order_made_to_order_allocations
  FOR SELECT TO authenticated USING (public.can_access_brand(brand_id));

REVOKE ALL ON public.order_made_to_order_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_made_to_order_allocations TO authenticated;
GRANT ALL ON public.order_made_to_order_allocations TO service_role;

-- 3. The number is not written directly: only the order engine and set_made_to_order_limit, which
--    say so for the length of their own statement. A product created with a limit starts counting
--    from that moment.
CREATE OR REPLACE FUNCTION public.guard_made_to_order_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.made_to_order_limit_set_at :=
      CASE WHEN NEW.made_to_order_available IS NULL THEN NULL ELSE now() END;
    RETURN NEW;
  END IF;

  IF (NEW.made_to_order_available IS DISTINCT FROM OLD.made_to_order_available
      OR NEW.made_to_order_limit_set_at IS DISTINCT FROM OLD.made_to_order_limit_set_at)
     AND current_setting('inventory.made_to_order_engine', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'DIRECT_MADE_TO_ORDER_LIMIT_UPDATE_FORBIDDEN: use set_made_to_order_limit()';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_products_guard_made_to_order_limit ON public.products;
CREATE TRIGGER trg_products_guard_made_to_order_limit
BEFORE INSERT OR UPDATE OF made_to_order_available, made_to_order_limit_set_at ON public.products
FOR EACH ROW EXECUTE FUNCTION public.guard_made_to_order_limit();

-- 4. Staff set the number (NULL removes the limit). Counting starts again from now.
CREATE OR REPLACE FUNCTION public.set_made_to_order_limit(p_product_id uuid, p_available integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product public.products%ROWTYPE;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_access_brand(v_product.brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF p_available IS NOT NULL AND p_available < 0 THEN
    RAISE EXCEPTION 'INVALID_MADE_TO_ORDER_LIMIT';
  END IF;
  IF p_available IS NOT DISTINCT FROM v_product.made_to_order_available THEN
    RETURN p_available;
  END IF;

  PERFORM set_config('inventory.made_to_order_engine', '1', true);
  UPDATE public.products
     SET made_to_order_available = p_available,
         made_to_order_limit_set_at = CASE WHEN p_available IS NULL THEN NULL ELSE now() END
   WHERE id = p_product_id;
  PERFORM set_config('inventory.made_to_order_engine', '', true);

  INSERT INTO public.made_to_order_movements (
    brand_id, product_id, reason, available_before, available_after, actor_id
  ) VALUES (
    v_product.brand_id, p_product_id, 'manual_set',
    v_product.made_to_order_available, p_available, auth.uid()
  );

  RETURN p_available;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_made_to_order_limit(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_made_to_order_limit(uuid, integer) TO authenticated, service_role;

-- 5. What an order holds of each product's limit, brought in line with its made-to-order lines.
--    Released: everything it holds goes back. Otherwise: the difference is taken or given back,
--    and an order asking for more than is left is refused (MADE_TO_ORDER_SOLD_OUT).
CREATE OR REPLACE FUNCTION public.order_made_to_order_transition(p_order_id uuid, p_desired_state text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_row record;
  v_product public.products%ROWTYPE;
  v_target integer;
  v_diff integer;
  v_after integer;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_row IN
    SELECT COALESCE(w.product_id, a.product_id) AS product_id,
           COALESCE(w.quantity, 0) AS wanted,
           COALESCE(a.quantity, 0) AS held
    FROM (
      SELECT oi.product_id, SUM(oi.quantity)::integer AS quantity
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
        AND oi.product_id IS NOT NULL
        AND oi.location = 'custom'
      GROUP BY oi.product_id
    ) w
    FULL JOIN (
      SELECT product_id, quantity
      FROM public.order_made_to_order_allocations
      WHERE order_id = p_order_id
    ) a ON a.product_id = w.product_id
    -- Always in the same order, so two orders of the same products cannot lock each other out.
    ORDER BY 1
  LOOP
    -- A product with no limit that this order holds nothing of: nothing to do, and no lock to take.
    IF v_row.held = 0 AND NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = v_row.product_id AND p.made_to_order_available IS NOT NULL
    ) THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = v_row.product_id FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_target := CASE
      WHEN p_desired_state IN ('released', 'none') THEN 0
      -- No limit on the product: nothing to hold.
      WHEN v_product.made_to_order_available IS NULL THEN 0
      -- An order from before the limit was set holds nothing, unless it already does.
      WHEN v_row.held = 0 AND v_order.created_at < v_product.made_to_order_limit_set_at THEN 0
      ELSE v_row.wanted
    END;
    v_diff := v_target - v_row.held;

    IF v_diff <> 0 AND v_product.made_to_order_available IS NOT NULL THEN
      IF v_diff > v_product.made_to_order_available THEN
        RAISE EXCEPTION 'MADE_TO_ORDER_SOLD_OUT:%', v_row.product_id;
      END IF;
      v_after := v_product.made_to_order_available - v_diff;

      PERFORM set_config('inventory.made_to_order_engine', '1', true);
      UPDATE public.products SET made_to_order_available = v_after WHERE id = v_row.product_id;
      PERFORM set_config('inventory.made_to_order_engine', '', true);

      INSERT INTO public.made_to_order_movements (
        brand_id, product_id, order_id, reason, available_before, available_after, actor_id
      ) VALUES (
        v_order.brand_id, v_row.product_id, p_order_id,
        CASE WHEN v_diff > 0 THEN 'order_reserve' ELSE 'order_release' END,
        v_product.made_to_order_available, v_after, auth.uid()
      );
    END IF;

    IF v_target > 0 THEN
      INSERT INTO public.order_made_to_order_allocations (order_id, product_id, quantity, brand_id)
      VALUES (p_order_id, v_row.product_id, v_target, v_order.brand_id)
      ON CONFLICT (order_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity;
    ELSE
      DELETE FROM public.order_made_to_order_allocations
      WHERE order_id = p_order_id AND product_id = v_row.product_id;
    END IF;
  END LOOP;
END;
$function$;

-- Only the order engine calls it.
REVOKE ALL ON FUNCTION public.order_made_to_order_transition(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_made_to_order_transition(uuid, text) TO service_role;

-- 6. The order engine reserves and releases made-to-order pieces too: the live definition
--    with one statement added after the desired state is worked out.
CREATE OR REPLACE FUNCTION public.order_inventory_transition(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_desired_state text;
  v_brand_id uuid;
  v_revision integer;
  v_alloc record;
  v_wanted record;
  v_variant public.product_variants%ROWTYPE;
  v_cur_main integer;
  v_cur_inc integer;
  v_avail_main integer;
  v_avail_inc integer;
  v_target_main integer;
  v_target_inc integer;
  v_diff integer;
BEGIN
  -- Advisory lock per order to serialize concurrent status updates
  PERFORM pg_advisory_xact_lock(hashtext('order_inventory:' || p_order_id::text));

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_brand_id := v_order.brand_id;
  v_revision := COALESCE(v_order.inventory_revision, 0) + 1;
  v_desired_state := public.order_inventory_desired_state(
    v_order.status,
    v_order.payment_status,
    v_order.payment_method
  );

  -- Made-to-order pieces: reserve from, or give back to, each product's limit.
  PERFORM public.order_made_to_order_transition(p_order_id, v_desired_state);

  -- Case A: Released or None -> Release all existing allocations idempotently
  IF v_desired_state IN ('released', 'none') THEN
    FOR v_alloc IN
      SELECT variant_id, location, quantity
      FROM public.order_inventory_allocations
      WHERE order_id = p_order_id
    LOOP
      PERFORM public.apply_inventory_movement(
        p_brand_id => v_brand_id,
        p_variant_id => v_alloc.variant_id,
        p_location => v_alloc.location,
        p_delta => v_alloc.quantity,
        p_reason => 'order_release',
        p_reference_type => 'order',
        p_reference_id => p_order_id,
        p_idempotency_key => 'order_release:' || p_order_id::text || ':' || v_alloc.variant_id::text || ':' || v_alloc.location || ':' || v_revision::text,
        p_actor_id => auth.uid(),
        p_note => 'Order inventory transition to ' || v_desired_state
      );
    END LOOP;

    DELETE FROM public.order_inventory_allocations WHERE order_id = p_order_id;

    UPDATE public.orders
    SET inventory_state = v_desired_state,
        inventory_revision = v_revision
    WHERE id = p_order_id;

    RETURN;
  END IF;

  -- Case B: Reserved or Committed -> Reconcile allocations against current order items
  CREATE TEMP TABLE IF NOT EXISTS _order_trans_alloc (
    variant_id uuid NOT NULL,
    location text NOT NULL,
    target_qty integer NOT NULL DEFAULT 0,
    cur_qty integer NOT NULL DEFAULT 0,
    PRIMARY KEY (variant_id, location)
  ) ON COMMIT DELETE ROWS;
  TRUNCATE _order_trans_alloc;

  -- Load existing allocations
  INSERT INTO _order_trans_alloc (variant_id, location, cur_qty)
  SELECT variant_id, location, quantity
  FROM public.order_inventory_allocations
  WHERE order_id = p_order_id;

  -- Calculate target allocations from order_items
  FOR v_wanted IN
    SELECT
      oi.variant_id,
      COALESCE(oi.location, 'main') AS req_location,
      SUM(oi.quantity)::integer AS req_qty
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.variant_id IS NOT NULL
      AND COALESCE(oi.location, '') <> 'custom'
    GROUP BY oi.variant_id, COALESCE(oi.location, 'main')
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(v_wanted.variant_id::text));

    SELECT * INTO v_variant
    FROM public.product_variants
    WHERE id = v_wanted.variant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'VARIANT_NOT_FOUND:%', v_wanted.variant_id;
    END IF;

    -- Existing allocations for this variant on this order
    SELECT COALESCE(cur_qty, 0) INTO v_cur_main
    FROM _order_trans_alloc
    WHERE variant_id = v_wanted.variant_id AND location = 'main';
    IF NOT FOUND THEN v_cur_main := 0; END IF;

    SELECT COALESCE(cur_qty, 0) INTO v_cur_inc
    FROM _order_trans_alloc
    WHERE variant_id = v_wanted.variant_id AND location = 'incubator';
    IF NOT FOUND THEN v_cur_inc := 0; END IF;

    -- Compute effective stock available to THIS order
    v_avail_main := COALESCE(v_variant.stock_main, 0) + v_cur_main;
    v_avail_inc := COALESCE(v_variant.stock_incubator, 0) + v_cur_inc;

    IF v_wanted.req_location = 'incubator' THEN
      IF v_avail_inc < v_wanted.req_qty THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_wanted.variant_id;
      END IF;
      v_target_main := 0;
      v_target_inc := v_wanted.req_qty;
    ELSE
      IF (v_avail_main + v_avail_inc) < v_wanted.req_qty THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_wanted.variant_id;
      END IF;
      v_target_main := LEAST(v_avail_main, v_wanted.req_qty);
      v_target_inc := v_wanted.req_qty - v_target_main;
    END IF;

    -- Upsert target into working table
    INSERT INTO _order_trans_alloc (variant_id, location, target_qty)
    VALUES (v_wanted.variant_id, 'main', v_target_main)
    ON CONFLICT (variant_id, location) DO UPDATE
      SET target_qty = _order_trans_alloc.target_qty + EXCLUDED.target_qty;

    INSERT INTO _order_trans_alloc (variant_id, location, target_qty)
    VALUES (v_wanted.variant_id, 'incubator', v_target_inc)
    ON CONFLICT (variant_id, location) DO UPDATE
      SET target_qty = _order_trans_alloc.target_qty + EXCLUDED.target_qty;
  END LOOP;

  -- Apply delta movements for every row in _order_trans_alloc
  FOR v_alloc IN SELECT * FROM _order_trans_alloc LOOP
    v_diff := v_alloc.target_qty - v_alloc.cur_qty;

    IF v_diff > 0 THEN
      -- Reserve additional stock (negative delta)
      PERFORM public.apply_inventory_movement(
        p_brand_id => v_brand_id,
        p_variant_id => v_alloc.variant_id,
        p_location => v_alloc.location,
        p_delta => -v_diff,
        p_reason => 'order_reserve',
        p_reference_type => 'order',
        p_reference_id => p_order_id,
        p_idempotency_key => 'order_reserve:' || p_order_id::text || ':' || v_alloc.variant_id::text || ':' || v_alloc.location || ':' || v_revision::text,
        p_actor_id => auth.uid(),
        p_note => 'Order allocation reserved'
      );
    ELSIF v_diff < 0 THEN
      -- Release excess stock (positive delta)
      PERFORM public.apply_inventory_movement(
        p_brand_id => v_brand_id,
        p_variant_id => v_alloc.variant_id,
        p_location => v_alloc.location,
        p_delta => -v_diff,
        p_reason => 'order_release',
        p_reference_type => 'order',
        p_reference_id => p_order_id,
        p_idempotency_key => 'order_release:' || p_order_id::text || ':' || v_alloc.variant_id::text || ':' || v_alloc.location || ':' || v_revision::text,
        p_actor_id => auth.uid(),
        p_note => 'Order allocation adjusted/released'
      );
    END IF;
  END LOOP;

  -- Update order_inventory_allocations table
  DELETE FROM public.order_inventory_allocations
  WHERE order_id = p_order_id
    AND (variant_id, location) NOT IN (
      SELECT variant_id, location FROM _order_trans_alloc WHERE target_qty > 0
    );

  INSERT INTO public.order_inventory_allocations (
    order_id, variant_id, location, quantity, brand_id
  )
  SELECT p_order_id, variant_id, location, target_qty, v_brand_id
  FROM _order_trans_alloc
  WHERE target_qty > 0
  ON CONFLICT (order_id, variant_id, location)
  DO UPDATE SET quantity = EXCLUDED.quantity;

  -- Finalize order state
  UPDATE public.orders
  SET inventory_state = v_desired_state,
      inventory_revision = v_revision
  WHERE id = p_order_id;
END;
$function$;

-- 7. The storefront's page data carries the limit: the live definition with one key added.
CREATE OR REPLACE FUNCTION public.get_storefront_page_data(p_brand_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand jsonb;
  v_settings jsonb;
  v_benefit jsonb;
  v_tracking jsonb;
  v_products jsonb;
  v_categories jsonb;
  v_bestsellers jsonb;
  v_trending jsonb;
  v_size_guides jsonb;
  v_addons jsonb;
  v_brand_id uuid;
  v_is_trial_expired boolean := false;
BEGIN
  -- 1. Fetch brand
  SELECT jsonb_build_object(
    'id', b.id,
    'slug', b.slug,
    'name_en', b.name_en,
    'name_ar', b.name_ar,
    'logo_url', b.logo_url,
    'is_active', b.is_active,
    'plan_type', b.plan_type,
    'trial_ends_at', b.trial_ends_at,
    'subscription_status', b.subscription_status,
    'hero_media', b.hero_media,
    'primary_color', b.primary_color,
    'about_ar', b.about_ar,
    'about_en', b.about_en,
    'meta_title', b.meta_title,
    'meta_description', b.meta_description
  ), b.id
  INTO v_brand, v_brand_id
  FROM public.brands b
  WHERE b.slug = p_brand_slug
  LIMIT 1;

  IF v_brand IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check if trial has expired or store is inactive
  IF v_brand->>'plan_type' = 'trial'
     AND v_brand->>'trial_ends_at' IS NOT NULL
     AND (v_brand->>'trial_ends_at')::timestamptz <= now()
     AND COALESCE(v_brand->>'subscription_status', '') <> 'active_paid'
  THEN
    v_is_trial_expired := true;
  END IF;

  IF (v_brand->>'is_active')::boolean = false OR v_is_trial_expired THEN
    RETURN jsonb_build_object(
      'brand', v_brand,
      'is_suspended', true,
      'suspension_reason', CASE WHEN v_is_trial_expired THEN 'trial_expired' ELSE 'inactive' END
    );
  END IF;

  -- 2. Fetch brand_public_settings
  SELECT to_jsonb(s.*)
  INTO v_settings
  FROM public.brand_public_settings s
  WHERE s.brand_id = v_brand_id;

  -- 3. Fetch benefit settings
  SELECT COALESCE(jsonb_agg(to_jsonb(bs.*)), '[]'::jsonb)
  INTO v_benefit
  FROM public.get_public_benefit_settings(v_brand_id) bs;

  -- 4. Fetch tracking settings
  SELECT jsonb_build_object(
    'google_analytics_enabled', ts.google_analytics_enabled,
    'google_analytics_id', ts.google_analytics_id,
    'meta_pixel_enabled', ts.meta_pixel_enabled,
    'meta_pixel_id', ts.meta_pixel_id,
    'consent_required', ts.consent_required
  )
  INTO v_tracking
  FROM public.brand_tracking_settings ts
  WHERE ts.brand_id = v_brand_id;

  -- 5. Fetch active products with variants: the same columns as the app's
  --    PRODUCT_CARD_SELECT (src/lib/data/storefront/selects.ts), plus a
  --    service's kind, whether it is a package, its extra-hour price, place and
  --    included lines.
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'name_ar', p.name_ar,
      'name_en', p.name_en,
      'description', p.description,
      'description_ar', p.description_ar,
      'description_en', p.description_en,
      'category', p.category,
      'image_url', p.image_url,
      'media', p.media,
      'brand_id', p.brand_id,
      'created_at', p.created_at,
      'featured_trending', p.featured_trending,
      'show_sale_badge', p.show_sale_badge,
      'is_made_to_order', p.is_made_to_order,
      'made_to_order_available', p.made_to_order_available,
      'item_kind', p.item_kind,
      'is_package', p.is_package,
      'extra_hour_price', p.extra_hour_price,
      'service_location', p.service_location,
      'service_includes', p.service_includes,
      'size_guide_id', p.size_guide_id,
      'size_guide_hidden', p.size_guide_hidden,
      'custom_fields', p.custom_fields,
      'product_variants', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', pv.id,
          'selling_price', pv.selling_price,
          'original_price', pv.original_price,
          'stock_main', pv.stock_main,
          'stock_incubator', pv.stock_incubator,
          'size', pv.size,
          'size_unit', pv.size_unit,
          'color', pv.color,
          'image_url', pv.image_url,
          'duration_minutes', pv.duration_minutes
        ))
        FROM public.product_variants pv
        WHERE pv.product_id = p.id
      ), '[]'::jsonb)
    ) ORDER BY p.created_at DESC
  ), '[]'::jsonb)
  INTO v_products
  FROM public.products p
  WHERE p.brand_id = v_brand_id AND p.is_active = true;

  -- 6. Fetch active categories (including size_guide_id)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name_en', c.name_en,
      'name_ar', c.name_ar,
      'slug', c.slug,
      'image_url', c.image_url,
      'parent_id', c.parent_id,
      'sort_order', c.sort_order,
      'menu_icon_url', c.menu_icon_url,
      'size_guide_id', c.size_guide_id
    ) ORDER BY c.sort_order ASC
  ), '[]'::jsonb)
  INTO v_categories
  FROM public.categories c
  WHERE c.brand_id = v_brand_id AND c.is_active = true;

  -- 7. Fetch best sellers
  SELECT COALESCE(jsonb_agg(to_jsonb(bs.*)), '[]'::jsonb)
  INTO v_bestsellers
  FROM public.get_storefront_best_sellers(p_brand_slug, 8) bs;

  -- 8. Fetch trending
  SELECT COALESCE(jsonb_agg(to_jsonb(tr.*)), '[]'::jsonb)
  INTO v_trending
  FROM public.get_storefront_trending(p_brand_slug, 8) tr;

  -- 9. Fetch active size guides
  SELECT COALESCE(jsonb_agg(to_jsonb(g.*) ORDER BY g.sort_order, g.created_at), '[]'::jsonb)
  INTO v_size_guides
  FROM public.size_guides g
  WHERE g.brand_id = v_brand_id AND g.is_active = true;

  -- 10. Fetch installed addons from brand_public_addons view
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'addon_id', ba.addon_id,
      'status', ba.status,
      'public_settings', ba.public_settings
    )
  ), '[]'::jsonb)
  INTO v_addons
  FROM public.brand_public_addons ba
  WHERE ba.brand_id = v_brand_id;

  RETURN jsonb_build_object(
    'brand', v_brand,
    'is_suspended', false,
    'settings', v_settings,
    'benefitSettings', v_benefit,
    'trackingSettings', v_tracking,
    'products', v_products,
    'categories', v_categories,
    'bestSellerRows', v_bestsellers,
    'trendingRows', v_trending,
    'size_guides', v_size_guides,
    'addons', v_addons
  );
END;
$function$;
