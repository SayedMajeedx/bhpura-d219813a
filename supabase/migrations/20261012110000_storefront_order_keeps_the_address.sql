-- A storefront delivery order lost its address, and a signed-in shopper could not order.
--
-- The order builder was rewritten on 2026-09-26 (order_inventory_state_machine). Two things in
-- the rewrite were wrong, and no test ran the function:
--
-- 1. The delivery address. The checkout sends it as fields of p_customer (label, region, block,
--    road, house, flat), as it always has. The rewrite read a nested p_customer.address object
--    that no caller sends (and wrote it to columns customer_addresses does not have), so the
--    address was dropped: every storefront delivery order since has no address, for the store's
--    staff and for the courier.
-- 2. The shopper's own customer record. customers.user_id is the store's owner; the shopper's
--    account is customers.auth_user_id. The rewrite looked a signed-in shopper up by user_id,
--    found nothing, and inserted a second customer with the same email, which the unique index
--    on a store's customer emails refuses: the order failed.
--
-- This puts both back. The address is kept on the customer, saved as one of their addresses
-- (reused when it is the same one) and the order points at it; the existing orders trigger
-- copies it onto the order. A signed-in shopper is the customer their account is linked to; a
-- new customer is owned by the store's owner, as a guest's already was. An email that already
-- belongs to another of the store's customers no longer makes the order fail.
--
-- Everything outside the customer and address steps is unchanged
-- (tests/storefront-order-address-migration.test.ts runs the function in a real Postgres and
-- compares the rest with the previous definition). Additive: a function body.
--
-- The addresses of the orders placed in between were never stored and cannot be recovered.

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
  v_free_email text;
  v_region text;
  v_block text;
  v_road text;
  v_house text;
  v_flat text;
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
    -- The store's own staff: its longest-standing active member, the platform's own
    -- accounts last, never a courier.
    SELECT p.id INTO v_owner FROM public.profiles p
    WHERE p.brand_id = v_brand.id AND p.status = 'active' AND p.role IS DISTINCT FROM 'courier'
    ORDER BY (p.role = 'super_admin'), p.created_at LIMIT 1;
  END IF;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'BRAND_OWNER_NOT_FOUND'; END IF;

  -- 4. Clean customer inputs
  v_clean_phone := NULLIF(trim(p_customer->>'phone'), '');
  v_clean_email := NULLIF(lower(trim(p_customer->>'email')), '');

  -- 5. Customer resolution & upsert
  -- customers.user_id is the store's owner; the shopper's own account is customers.auth_user_id.
  -- A signed-in shopper is the customer their account is linked to. Anyone else, and a signed-in
  -- shopper with no customer yet, is matched by phone, then by email; a signed-in shopper is
  -- never matched to a record that belongs to another account.
  IF auth.uid() IS NOT NULL THEN
    SELECT id, auth_user_id INTO v_customer_id, v_customer_user_id
    FROM public.customers
    WHERE brand_id = v_brand.id AND auth_user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_customer_id IS NULL AND v_clean_phone IS NOT NULL THEN
    SELECT id, auth_user_id INTO v_customer_id, v_customer_user_id
    FROM public.customers
    WHERE brand_id = v_brand.id AND phone = v_clean_phone
      AND (auth.uid() IS NULL OR auth_user_id IS NULL)
    ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_customer_id IS NULL AND v_clean_email IS NOT NULL THEN
    SELECT id, auth_user_id INTO v_customer_id, v_customer_user_id
    FROM public.customers
    WHERE brand_id = v_brand.id AND lower(email) = v_clean_email
      AND (auth.uid() IS NULL OR auth_user_id IS NULL)
    ORDER BY created_at ASC LIMIT 1;
  END IF;

  -- An email already on another of the store's customers stays theirs: the order keeps the
  -- email the shopper typed in its own contact snapshot, and the order is not refused.
  IF v_clean_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.customers o
    WHERE o.brand_id = v_brand.id
      AND o.id IS DISTINCT FROM v_customer_id
      AND lower(btrim(o.email)) = v_clean_email
  ) THEN
    v_free_email := NULL;
  ELSE
    v_free_email := v_clean_email;
  END IF;

  IF v_customer_id IS NOT NULL THEN
    UPDATE public.customers SET
      name = COALESCE(NULLIF(trim(p_customer->>'name'), ''), name),
      phone = COALESCE(v_clean_phone, phone),
      -- An account's email is its identity: a checkout form does not change it.
      email = CASE
        WHEN v_customer_user_id IS NOT NULL THEN email
        ELSE COALESCE(v_free_email, email)
      END,
      updated_at = now()
    WHERE id = v_customer_id;
  ELSE
    INSERT INTO public.customers (user_id, brand_id, auth_user_id, name, phone, email)
    VALUES (
      v_owner, v_brand.id, auth.uid(),
      COALESCE(NULLIF(trim(p_customer->>'name'), ''), 'Guest Customer'),
      v_clean_phone, v_free_email
    ) RETURNING id INTO v_customer_id;
  END IF;

  -- 6. Delivery address
  -- The checkout sends the address as fields of p_customer (label, region, block, road, house,
  -- flat). It is kept on the customer as their latest address and saved as one of their
  -- addresses (the same address is reused, not saved twice); the order points at it, and the
  -- orders trigger copies it onto the order. The delivery fee is worked out by the caller.
  v_region := NULLIF(btrim(p_customer->>'region'), '');
  v_block := NULLIF(btrim(p_customer->>'block'), '');
  v_road := NULLIF(btrim(p_customer->>'road'), '');
  v_house := NULLIF(btrim(p_customer->>'house'), '');
  v_flat := NULLIF(btrim(p_customer->>'flat'), '');

  IF p_fulfillment = 'delivery'
     AND (v_region IS NOT NULL OR v_block IS NOT NULL OR v_road IS NOT NULL OR v_house IS NOT NULL) THEN
    UPDATE public.customers SET
      region = COALESCE(v_region, region),
      block = COALESCE(v_block, block),
      road = COALESCE(v_road, road),
      house = COALESCE(v_house, house),
      flat = COALESCE(v_flat, flat)
    WHERE id = v_customer_id;

    SELECT a.id INTO v_address_id
    FROM public.customer_addresses a
    WHERE a.customer_id = v_customer_id
      AND a.region IS NOT DISTINCT FROM v_region
      AND a.block IS NOT DISTINCT FROM v_block
      AND a.road IS NOT DISTINCT FROM v_road
      AND a.house IS NOT DISTINCT FROM v_house
      AND a.flat IS NOT DISTINCT FROM v_flat
    ORDER BY a.created_at ASC LIMIT 1;

    IF v_address_id IS NULL THEN
      INSERT INTO public.customer_addresses (
        user_id, brand_id, customer_id, label, region, block, road, house, flat, is_default
      ) VALUES (
        (SELECT c.user_id FROM public.customers c WHERE c.id = v_customer_id),
        v_brand.id, v_customer_id,
        COALESCE(NULLIF(btrim(p_customer->>'label'), ''), 'Home'),
        v_region, v_block, v_road, v_house, v_flat,
        NOT EXISTS (SELECT 1 FROM public.customer_addresses WHERE customer_id = v_customer_id)
      ) RETURNING id INTO v_address_id;
    END IF;
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
