-- A store can pause making a product to order without losing its limit.
--
-- A store that is too busy to take more made-to-order pieces of a product (or is waiting for
-- fabric) had two bad choices: set the limit to 0 and forget what it was, or switch "made to
-- order" off, which changes how the whole product is sold. It can now pause:
--
--   products.made_to_order_paused_at   NULL = taking orders; a time = paused since then
--
-- While paused a shopper cannot order the product made to order: the storefront closes that
-- choice (its ready sizes, if any, stay), and the order engine refuses it whatever the browser
-- sent (MADE_TO_ORDER_PAUSED). Orders placed before the pause go on as they were, and orders
-- staff make themselves in the admin are not stopped. The limit keeps its number.
--
-- Like the limit, the pause is not written directly: set_made_to_order_paused (staff) is the
-- only way, and every pause and resume is recorded in made_to_order_movements.
--
-- Additive: one column, one function, a wider check and trigger; order_made_to_order_transition
-- and get_storefront_page_data are their previous definitions with the pause added
-- (tests/made-to-order-pause-migration.test.ts).

-- 1. The pause on the product.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS made_to_order_paused_at timestamptz;

COMMENT ON COLUMN public.products.made_to_order_paused_at IS
  'When the store paused making this product to order (NULL: not paused). Changed only by set_made_to_order_paused.';

GRANT SELECT (made_to_order_paused_at) ON public.products TO authenticated;
GRANT SELECT (made_to_order_paused_at) ON public.products TO anon;

-- 2. A pause and a resume are recorded like any other change, and neither can be written directly.
ALTER TABLE public.made_to_order_movements
  DROP CONSTRAINT IF EXISTS made_to_order_movements_reason_check;
ALTER TABLE public.made_to_order_movements
  ADD CONSTRAINT made_to_order_movements_reason_check
  CHECK (reason IN ('order_reserve', 'order_release', 'manual_set', 'paused', 'resumed'));

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
      OR NEW.made_to_order_limit_set_at IS DISTINCT FROM OLD.made_to_order_limit_set_at
      OR NEW.made_to_order_paused_at IS DISTINCT FROM OLD.made_to_order_paused_at)
     AND current_setting('inventory.made_to_order_engine', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'DIRECT_MADE_TO_ORDER_LIMIT_UPDATE_FORBIDDEN: use set_made_to_order_limit() or set_made_to_order_paused()';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_products_guard_made_to_order_limit ON public.products;
CREATE TRIGGER trg_products_guard_made_to_order_limit
BEFORE INSERT OR UPDATE OF made_to_order_available, made_to_order_limit_set_at, made_to_order_paused_at
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.guard_made_to_order_limit();

-- 3. Staff pause and resume.
CREATE OR REPLACE FUNCTION public.set_made_to_order_paused(p_product_id uuid, p_paused boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product public.products%ROWTYPE;
  v_paused boolean := COALESCE(p_paused, false);
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_access_brand(v_product.brand_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  IF v_paused = (v_product.made_to_order_paused_at IS NOT NULL) THEN
    RETURN v_paused;
  END IF;

  PERFORM set_config('inventory.made_to_order_engine', '1', true);
  UPDATE public.products
     SET made_to_order_paused_at = CASE WHEN v_paused THEN now() ELSE NULL END
   WHERE id = p_product_id;
  PERFORM set_config('inventory.made_to_order_engine', '', true);

  INSERT INTO public.made_to_order_movements (
    brand_id, product_id, reason, available_before, available_after, actor_id
  ) VALUES (
    v_product.brand_id, p_product_id, CASE WHEN v_paused THEN 'paused' ELSE 'resumed' END,
    v_product.made_to_order_available, v_product.made_to_order_available, auth.uid()
  );

  RETURN v_paused;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_made_to_order_paused(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_made_to_order_paused(uuid, boolean) TO authenticated, service_role;

-- 4. The order engine's made-to-order step, with the pause: the previous definition plus the
--    pause rule (and a paused product is no longer skipped as "nothing to do").
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
      WHERE p.id = v_row.product_id
        AND (p.made_to_order_available IS NOT NULL OR p.made_to_order_paused_at IS NOT NULL)
    ) THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = v_row.product_id FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- Paused: a shopper's order placed since the pause cannot take a made-to-order piece.
    -- Orders from before it, and orders staff make themselves, are not affected.
    IF p_desired_state NOT IN ('released', 'none')
       AND v_product.made_to_order_paused_at IS NOT NULL
       AND v_order.channel IS NOT DISTINCT FROM 'storefront'
       AND v_order.created_at >= v_product.made_to_order_paused_at
       AND v_row.wanted > v_row.held THEN
      RAISE EXCEPTION 'MADE_TO_ORDER_PAUSED:%', v_row.product_id;
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

-- 5. The storefront's page data says when a product is paused: one key added.
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
      'made_to_order_paused_at', p.made_to_order_paused_at,
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
