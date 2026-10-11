-- The order function charges the priced options a shopper chose.
--
-- A product can carry priced options in two ways: an add-on (customization_options.price_delta,
-- for all products or the ones it lists), and a choice in one of its own select fields whose
-- text names a price ("Silk lining (+ 5 BHD)"). The product page adds them to the price it shows
-- and the cart carries that price, but the order builder charged the variant's price alone, so
-- the order came out cheaper than the checkout said. No order has been placed with a priced
-- option yet, so nothing was undercharged; the first one would have been.
--
-- storefront_line_customizations works the priced options of one line out from the store's own
-- data, never from a price the browser sent: an add-on must belong to the store and apply to the
-- product, and a select choice must be one of the options the product really offers. The order
-- builder then writes them on the line the way the admin's order editor does
-- (order_items.customizations, customization_total per piece) and charges
-- (price + customization_total) x quantity, so invoices, the editor and the totals agree.
--
-- Additive: one function is new; place_storefront_order_internal_20260710 is its live definition
-- with the priced options added (tests/priced-options-migration.test.ts).

CREATE OR REPLACE FUNCTION public.storefront_line_customizations(
  p_brand_id uuid,
  p_product_id uuid,
  p_custom_fields jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH submitted AS (
    SELECT f->>'key' AS key, btrim(COALESCE(f->>'value', '')) AS value
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(p_custom_fields) = 'array' THEN p_custom_fields ELSE '[]'::jsonb END
    ) f
    WHERE jsonb_typeof(f) = 'object'
  ),
  -- Add-ons the shopper ticked: sent as "addon_<id>"; the price is the store's.
  addons AS (
    SELECT c.name AS name, c.price_delta AS price_delta
    FROM submitted s
    JOIN public.customization_options c ON 'addon_' || c.id::text = lower(s.key)
    WHERE c.brand_id = p_brand_id
      AND (
        c.product_ids IS NULL
        OR cardinality(c.product_ids) = 0
        OR p_product_id::text = ANY (c.product_ids::text[])
      )
  ),
  -- A choice in one of the product's own select fields, when the product really offers it and
  -- its text names a price.
  choices AS (
    SELECT
      COALESCE(NULLIF(f->>'label_en', ''), NULLIF(f->>'label_ar', ''), f->>'key') || ': ' || s.value AS name,
      substring(s.value from '\+\s*([0-9]+(?:\.[0-9]+)?)')::numeric AS price_delta
    FROM public.products p
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.custom_fields) = 'array' THEN p.custom_fields ELSE '[]'::jsonb END
    ) f
    JOIN submitted s ON s.key = f->>'key'
    WHERE p.id = p_product_id
      AND p.brand_id = p_brand_id
      AND f->>'type' = 'select'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(f->'options') = 'array' THEN f->'options' ELSE '[]'::jsonb END
        ) o
        WHERE btrim(o) = s.value
      )
  )
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('name', x.name, 'price_delta', x.price_delta) ORDER BY x.name),
    '[]'::jsonb
  )
  FROM (SELECT * FROM addons UNION ALL SELECT * FROM choices) x
  WHERE x.price_delta > 0
$function$;

-- Only the order builder calls it.
REVOKE ALL ON FUNCTION public.storefront_line_customizations(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_line_customizations(uuid, uuid, jsonb) TO service_role;

-- The order builder: its live definition, charging and recording each line's priced options.
CREATE OR REPLACE FUNCTION public.place_storefront_order_internal_20260710(p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text, p_notes text DEFAULT NULL::text, p_fulfillment text DEFAULT 'delivery'::text, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_brand public.brands%ROWTYPE;
  v_settings public.business_settings%ROWTYPE;
  v_owner uuid;
  v_customer_id uuid;
  v_address_id uuid;
  v_order_id uuid;
  v_invoice integer;
  v_shipping numeric(10,3) := 0;
  v_subtotal numeric(14,3) := 0;
  v_item jsonb;
  v_variant public.product_variants%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_qty int;
  v_line_total numeric(14,3);
  v_custom_fields jsonb;
  v_customizations jsonb;
  v_customization_total numeric(14,3);
  v_is_tailoring boolean;
  v_selected_variant jsonb;
  v_clean_phone text;
  v_clean_email text;
  v_customer_user_id uuid;
BEGIN
  -- 1. Validate brand and status
  SELECT * INTO v_brand FROM public.brands WHERE slug = p_brand_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRAND_NOT_FOUND'; END IF;
  IF v_brand.subscription_status NOT IN ('active', 'trialing') THEN
    RAISE EXCEPTION 'BRAND_INACTIVE';
  END IF;

  -- 2. Guard against expired trials
  IF v_brand.subscription_status = 'trialing'
     AND v_brand.trial_ends_at IS NOT NULL
     AND v_brand.trial_ends_at < now() THEN
    RAISE EXCEPTION 'TRIAL_EXPIRED';
  END IF;

  SELECT * INTO v_settings FROM public.business_settings WHERE brand_id = v_brand.id;

  -- 3. Guard against catalog mode
  IF v_settings.storefront_mode = 'catalog' THEN
    RAISE EXCEPTION 'CHECKOUT_DISABLED_CATALOG_MODE';
  END IF;

  v_owner := v_brand.created_by;
  IF v_owner IS NULL THEN
    SELECT user_id INTO v_owner FROM public.tenant_users
    WHERE brand_id = v_brand.id AND role = 'brand_owner' LIMIT 1;
  END IF;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'BRAND_OWNER_NOT_FOUND'; END IF;

  -- 4. Clean customer inputs
  v_clean_phone := NULLIF(trim(p_customer->>'phone'), '');
  v_clean_email := NULLIF(lower(trim(p_customer->>'email')), '');

  -- 5. Customer resolution & upsert
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM public.customers
    WHERE user_id = auth.uid() AND brand_id = v_brand.id LIMIT 1;

    IF v_customer_id IS NOT NULL THEN
      UPDATE public.customers SET
        name = COALESCE(NULLIF(trim(p_customer->>'name'), ''), name),
        phone = COALESCE(v_clean_phone, phone),
        email = COALESCE(v_clean_email, email),
        updated_at = now()
      WHERE id = v_customer_id;
    ELSE
      INSERT INTO public.customers (user_id, brand_id, name, phone, email)
      VALUES (
        auth.uid(), v_brand.id,
        COALESCE(NULLIF(trim(p_customer->>'name'), ''), 'Guest Customer'),
        v_clean_phone, v_clean_email
      ) RETURNING id INTO v_customer_id;
    END IF;
  ELSE
    IF v_clean_phone IS NOT NULL THEN
      SELECT id, user_id INTO v_customer_id, v_customer_user_id
      FROM public.customers
      WHERE brand_id = v_brand.id AND phone = v_clean_phone
      ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_customer_id IS NULL AND v_clean_email IS NOT NULL THEN
      SELECT id, user_id INTO v_customer_id, v_customer_user_id
      FROM public.customers
      WHERE brand_id = v_brand.id AND lower(email) = v_clean_email
      ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_customer_id IS NOT NULL THEN
      UPDATE public.customers SET
        name = COALESCE(NULLIF(trim(p_customer->>'name'), ''), name),
        phone = COALESCE(v_clean_phone, phone),
        email = CASE
          WHEN v_customer_user_id IS NOT NULL THEN email
          ELSE COALESCE(v_clean_email, email)
        END,
        updated_at = now()
      WHERE id = v_customer_id;
    ELSE
      INSERT INTO public.customers (user_id, brand_id, name, phone, email)
      VALUES (
        v_owner, v_brand.id,
        COALESCE(NULLIF(trim(p_customer->>'name'), ''), 'Guest Customer'),
        v_clean_phone, v_clean_email
      ) RETURNING id INTO v_customer_id;
    END IF;
  END IF;

  -- 6. Shipping address handling
  IF p_fulfillment = 'delivery' AND p_customer ? 'address' THEN
    INSERT INTO public.customer_addresses (
      user_id, customer_id, brand_id, address_name, block, street, way_number,
      building, apartment, floor, additional_directions, city, postal_code, country
    ) VALUES (
      (SELECT c.user_id FROM public.customers c WHERE c.id = v_customer_id),
      v_customer_id, v_brand.id,
      COALESCE(p_customer->'address'->>'name', 'Delivery Address'),
      p_customer->'address'->>'block',
      p_customer->'address'->>'street',
      p_customer->'address'->>'way',
      p_customer->'address'->>'building',
      p_customer->'address'->>'apartment',
      p_customer->'address'->>'floor',
      p_customer->'address'->>'additional_directions',
      COALESCE(p_customer->'address'->>'city', 'Default City'),
      p_customer->'address'->>'postal_code',
      COALESCE(p_customer->'address'->>'country', 'BH')
    ) RETURNING id INTO v_address_id;

    v_shipping := COALESCE(v_settings.delivery_fee, 0);
  END IF;

  -- 7. Generate invoice number
  -- The invoice number is the brand's next one: the orders trigger numbers it.
  v_invoice := 0;

  -- 8. Create Order record
  INSERT INTO public.orders (
    user_id, brand_id, customer_id, invoice_number, status,
    payment_method, payment_status, currency, notes, channel,
    fulfillment_method, shipping_address_id, shipping, branch_id
  ) VALUES (
    v_owner, v_brand.id, v_customer_id, v_invoice, 'pending',
    p_payment_method, 'unpaid', v_settings.currency, p_notes, 'storefront',
    p_fulfillment, v_address_id, v_shipping,
    CASE WHEN p_fulfillment = 'pickup' THEN p_branch_id ELSE NULL END
  ) RETURNING id INTO v_order_id;

  -- 9. Insert order items with stock pre-check
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));

    SELECT * INTO v_variant
    FROM public.product_variants
    WHERE id = (v_item->>'variant_id')::uuid
    FOR UPDATE;

    IF NOT FOUND OR v_variant.brand_id <> v_brand.id THEN
      RAISE EXCEPTION 'VARIANT_NOT_FOUND';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_variant.product_id;

    IF NOT v_product.is_active THEN
      RAISE EXCEPTION 'PRODUCT_INACTIVE';
    END IF;

    v_custom_fields := COALESCE(v_item->'custom_fields', '[]'::jsonb);
    -- A made-to-order product is made to order unless the shopper chose a ready size on it
    -- (the item says tailored: false). A ready line is checked against stock below, so the
    -- claim cannot be used to skip anything.
    v_is_tailoring := COALESCE(v_product.is_made_to_order, false)
      AND COALESCE(v_item->>'tailored', 'true') <> 'false';

    -- The priced options the shopper chose, at the store's own prices.
    v_customizations := public.storefront_line_customizations(v_brand.id, v_product.id, v_custom_fields);
    v_customization_total := COALESCE(
      (SELECT SUM((c->>'price_delta')::numeric) FROM jsonb_array_elements(v_customizations) c), 0
    )::numeric(14,3);

    v_line_total := ((v_variant.selling_price + v_customization_total) * v_qty)::numeric(14,3);
    v_subtotal := v_subtotal + v_line_total;

    v_selected_variant := jsonb_build_object(
      'size', v_variant.size, 'color', v_variant.color,
      'fabric', v_variant.fabric, 'sku', v_variant.sku
    );

    IF v_is_tailoring THEN
      INSERT INTO public.order_items (
        user_id, brand_id, order_id, product_id, variant_id,
        description, quantity, unit_price, line_total, location,
        selected_variant, custom_field_values, customizations, customization_total
      ) VALUES (
        v_owner, v_brand.id, v_order_id, v_product.id, v_variant.id,
        COALESCE(v_product.name, 'Product'), v_qty, v_variant.selling_price,
        v_line_total, 'custom', v_selected_variant, v_custom_fields,
        v_customizations, v_customization_total
      );
    ELSE
      -- Stock pre-check guarantees customer receives INSUFFICIENT_STOCK before proceeding
      IF (COALESCE(v_variant.stock_main, 0) + COALESCE(v_variant.stock_incubator, 0)) < v_qty THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_variant.id;
      END IF;

      INSERT INTO public.order_items (
        user_id, brand_id, order_id, product_id, variant_id,
        description, quantity, unit_price, line_total, location,
        selected_variant, custom_field_values, customizations, customization_total
      ) VALUES (
        v_owner, v_brand.id, v_order_id, v_product.id, v_variant.id,
        COALESCE(v_product.name, 'Product'), v_qty, v_variant.selling_price,
        v_line_total, 'main', v_selected_variant, v_custom_fields,
        v_customizations, v_customization_total
      );
    END IF;
  END LOOP;

  -- 10. Update order totals
  UPDATE public.orders
  SET subtotal = v_subtotal,
      total = v_subtotal + v_shipping
  WHERE id = v_order_id;

  -- 11. Execute inventory reservation through single state transition engine
  PERFORM public.order_inventory_transition(v_order_id);

  SELECT invoice_number INTO v_invoice FROM public.orders WHERE id = v_order_id;

  RETURN jsonb_build_object('order_id', v_order_id, 'invoice_number', v_invoice);
END;
$function$;
