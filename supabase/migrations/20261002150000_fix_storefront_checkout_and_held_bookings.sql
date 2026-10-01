-- Migration: 20261002150000_fix_storefront_checkout_and_held_bookings.sql
--
-- 1. Storefront checkout could not place any order: the order builder
--    (place_storefront_order_internal_20260710, rewritten 2026-09-26) built the
--    invoice number as text, 'INV-YYMMDD-XXXXXX', for the integer column
--    orders.invoice_number: "column invoice_number is of type integer but
--    expression is of type text". It now inserts 0 and lets the orders trigger
--    (allocate_brand_invoice_number) number the invoice, as the admin does, and
--    returns the number the order got. (The guest-customer fix of
--    20261002130000 was the first of two failures on this path.)
--
-- 2. A booking paid by BenefitPay transfer is held until the receipt is
--    verified, not confirmed on upload: approving the payment (the order's
--    "approve") confirms it through the existing order trigger; a hold that
--    nobody verifies runs out after 24 hours. A card payment still holds the
--    day for 30 minutes.
--
-- 3. Staff can answer a held booking (a card or transfer still waiting, or one
--    that ran out): confirm it (the day is checked again) or release it.
--
-- Additive: function bodies only.

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
    v_is_tailoring := COALESCE(v_product.is_made_to_order, false);

    v_line_total := (v_variant.selling_price * v_qty)::numeric(14,3);
    v_subtotal := v_subtotal + v_line_total;

    v_selected_variant := jsonb_build_object(
      'size', v_variant.size, 'color', v_variant.color,
      'fabric', v_variant.fabric, 'sku', v_variant.sku
    );

    IF v_is_tailoring THEN
      INSERT INTO public.order_items (
        user_id, brand_id, order_id, product_id, variant_id,
        description, quantity, unit_price, line_total, location,
        selected_variant, custom_field_values
      ) VALUES (
        v_owner, v_brand.id, v_order_id, v_product.id, v_variant.id,
        COALESCE(v_product.name, 'Product'), v_qty, v_variant.selling_price,
        v_line_total, 'custom', v_selected_variant, v_custom_fields
      );
    ELSE
      -- Stock pre-check guarantees customer receives INSUFFICIENT_STOCK before proceeding
      IF (COALESCE(v_variant.stock_main, 0) + COALESCE(v_variant.stock_incubator, 0)) < v_qty THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', v_variant.id;
      END IF;

      INSERT INTO public.order_items (
        user_id, brand_id, order_id, product_id, variant_id,
        description, quantity, unit_price, line_total, location,
        selected_variant, custom_field_values
      ) VALUES (
        v_owner, v_brand.id, v_order_id, v_product.id, v_variant.id,
        COALESCE(v_product.name, 'Product'), v_qty, v_variant.selling_price,
        v_line_total, 'main', v_selected_variant, v_custom_fields
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

CREATE OR REPLACE FUNCTION public.place_booking_order(p_booking_id uuid, p_hold_token uuid, p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text, p_notes text DEFAULT NULL::text, p_fulfillment text DEFAULT 'delivery'::text, p_branch_id uuid DEFAULT NULL::uuid, p_digital_channel text DEFAULT NULL::text, p_digital_contact text DEFAULT NULL::text, p_promo_code text DEFAULT NULL::text, p_benefit_receipt_id uuid DEFAULT NULL::uuid, p_shipping_fee numeric DEFAULT NULL::numeric, p_shipping_zone text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_settings public.booking_settings;
  v_state record;
  v_brand_id uuid;
  v_missing integer;
  v_result jsonb;
  v_order public.orders;
  v_card boolean := p_payment_method = 'card';
  v_benefit boolean := p_payment_method = 'benefit';
  v_options numeric(12, 3) := 0;
  v_gap numeric(12, 3) := 0;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  SELECT id INTO v_brand_id FROM public.brands WHERE slug = p_brand_slug;
  IF NOT FOUND OR v_booking.id IS NULL OR v_booking.hold_token IS NULL
     OR v_booking.hold_token <> p_hold_token OR v_booking.brand_id IS DISTINCT FROM v_brand_id THEN
    RAISE EXCEPTION 'BOOKING_HOLD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- The same checkout again (a retried card payment): the same order.
  IF v_booking.order_id IS NOT NULL THEN
    v_result := public.place_storefront_order(
      p_brand_slug => p_brand_slug, p_customer => p_customer, p_items => p_items,
      p_payment_method => p_payment_method, p_notes => p_notes, p_fulfillment => p_fulfillment,
      p_branch_id => p_branch_id, p_digital_channel => p_digital_channel,
      p_digital_contact => p_digital_contact, p_promo_code => p_promo_code,
      p_benefit_receipt_id => p_benefit_receipt_id, p_shipping_fee => p_shipping_fee,
      p_shipping_zone => p_shipping_zone, p_idempotency_key => p_idempotency_key
    );
    IF (v_result ->> 'order_id')::uuid IS DISTINCT FROM v_booking.order_id THEN
      RAISE EXCEPTION 'BOOKING_ALREADY_ORDERED' USING ERRCODE = '23505';
    END IF;
    RETURN v_result || jsonb_build_object(
      'booking_reference', v_booking.reference, 'booking_status', v_booking.status
    );
  END IF;

  IF v_booking.status NOT IN ('hold', 'expired') THEN
    RAISE EXCEPTION 'BOOKING_HOLD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_settings FROM public.booking_settings WHERE brand_id = v_booking.brand_id FOR UPDATE;

  -- A hold that ran out still works while the day is free.
  IF v_booking.status = 'expired' OR v_booking.hold_expires_at <= now() THEN
    SELECT * INTO v_state FROM public.booking_day_state_for(
      v_settings, v_booking.event_date, v_booking.id, false, NULL,
      public.booking_is_governed(v_booking.id));
    IF v_state.state <> 'available' THEN
      RAISE EXCEPTION 'BOOKING_HOLD_EXPIRED' USING ERRCODE = '23P01';
    END IF;
    -- ...and while its services have room.
    BEGIN
      PERFORM public.assert_booking_services_free(v_booking.id);
    EXCEPTION WHEN SQLSTATE '23P01' THEN
      RAISE EXCEPTION 'BOOKING_HOLD_EXPIRED' USING ERRCODE = '23P01';
    END;
  END IF;

  -- The cart must carry every booked service.
  SELECT count(*) INTO v_missing
    FROM public.booking_items bi
   WHERE bi.booking_id = v_booking.id
     AND bi.parent_item_id IS NULL
     AND COALESCE((
       SELECT sum(GREATEST(1, COALESCE((line ->> 'quantity')::integer, 1)))
         FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS line
        WHERE NULLIF(line ->> 'variant_id', '')::uuid = bi.variant_id
     ), 0) < bi.quantity;
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'BOOKING_ITEMS_MISMATCH' USING ERRCODE = '22023';
  END IF;

  v_result := public.place_storefront_order(
    p_brand_slug => p_brand_slug, p_customer => p_customer, p_items => p_items,
    p_payment_method => p_payment_method, p_notes => p_notes, p_fulfillment => p_fulfillment,
    p_branch_id => p_branch_id, p_digital_channel => p_digital_channel,
    p_digital_contact => p_digital_contact, p_promo_code => p_promo_code,
    p_benefit_receipt_id => p_benefit_receipt_id,
    -- A booking's delivery fee is its travel fee, set by the database from
    -- the event's area (never the browser's), when the store charges one.
    p_shipping_fee => CASE
      WHEN v_booking.travel_fee IS NOT NULL AND p_fulfillment = 'delivery' THEN v_booking.travel_fee
      ELSE p_shipping_fee
    END,
    p_shipping_zone => p_shipping_zone, p_idempotency_key => p_idempotency_key
  );

  -- The booking's travel fee is its order's delivery fee (the order function
  -- charges at least the store's usual delivery fee). Shipping is not taxed,
  -- so the total moves by the difference.
  IF v_booking.travel_fee IS NOT NULL AND p_fulfillment = 'delivery' THEN
    UPDATE public.orders
       SET total = total - shipping + v_booking.travel_fee,
           shipping = v_booking.travel_fee
     WHERE id = (v_result ->> 'order_id')::uuid;
    v_result := v_result || jsonb_build_object('shipping', v_booking.travel_fee);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = (v_result ->> 'order_id')::uuid;

  -- The order prices each service at its variant; the booking may price it higher
  -- (extra hours beyond its longest length). The difference is its own line.
  v_gap := COALESCE((SELECT sum(bi.line_total) FROM public.booking_items bi
                      WHERE bi.booking_id = v_booking.id AND bi.parent_item_id IS NULL), 0)
         - COALESCE((SELECT sum(oi.line_total) FROM public.order_items oi
                      WHERE oi.order_id = v_order.id), 0);

  -- What a booked package includes, listed free on the order.
  INSERT INTO public.order_items (
    order_id, brand_id, user_id, product_id, description, quantity, unit_price, line_total, location
  )
  SELECT v_order.id, v_order.brand_id, v_order.user_id, bi.product_id,
         '↳ ' || COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Service'),
         bi.quantity, 0, 0, 'main'
    FROM public.booking_items bi
   WHERE bi.booking_id = v_booking.id AND bi.parent_item_id IS NOT NULL AND bi.option_id IS NULL
   ORDER BY bi.id;

  -- The add-ons the customer chose, priced on the order.
  INSERT INTO public.order_items (
    order_id, brand_id, user_id, product_id, description, quantity, unit_price, line_total, location
  )
  SELECT v_order.id, v_order.brand_id, v_order.user_id, NULL,
         '+ ' || COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Add-on'),
         1, bi.unit_price, bi.line_total, 'main'
    FROM public.booking_items bi
   WHERE bi.booking_id = v_booking.id AND bi.option_id IS NOT NULL
   ORDER BY bi.id;
  SELECT COALESCE(sum(line_total), 0) INTO v_options
    FROM public.booking_items WHERE booking_id = v_booking.id AND option_id IS NOT NULL;
  IF v_gap > 0.0005 THEN
    INSERT INTO public.order_items (
      order_id, brand_id, user_id, product_id, description, quantity, unit_price, line_total, location
    ) VALUES (v_order.id, v_order.brand_id, v_order.user_id, NULL, '+ Extra time', 1, v_gap, v_gap, 'main');
    v_options := v_options + v_gap;
  END IF;
  IF v_options > 0 THEN
    UPDATE public.orders SET subtotal = subtotal + v_options WHERE id = v_order.id;
    PERFORM public.reprice_order_totals(v_order.id);
  END IF;

  -- The order says which booking it pays for (order screen, invoice, messages).
  UPDATE public.orders
     SET notes = concat_ws(E'\n\n',
       format('📅 %s · %s · %s–%s',
         v_booking.reference,
         to_char(v_booking.event_date, 'YYYY-MM-DD'),
         to_char(v_booking.starts_at AT TIME ZONE v_settings.timezone, 'HH24:MI'),
         to_char(v_booking.ends_at AT TIME ZONE v_settings.timezone, 'HH24:MI')),
       notes)
   WHERE id = v_order.id;

  -- The booking's discount comes off the order too (with any promo code's).
  IF v_booking.discount_amount > 0 THEN
    UPDATE public.orders
       SET discount = LEAST(subtotal, discount + v_booking.discount_amount)
     WHERE id = v_order.id;
    PERFORM public.reprice_order_totals(v_order.id);
  END IF;

  -- The totals as they stand now (the deposit is a share of this, after the offer).
  SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
  v_result := v_result || jsonb_build_object('total', v_order.total);

  UPDATE public.bookings SET
    order_id = v_order.id,
    customer_id = v_order.customer_id,
    customer_name = COALESCE(v_order.customer_name_snapshot, customer_name),
    customer_phone = COALESCE(v_order.customer_phone_snapshot, customer_phone),
    customer_email = COALESCE(v_order.customer_email_snapshot, customer_email),
    -- Card: held while the customer pays. A BenefitPay transfer: held until the
    -- receipt is verified (a day). Cash: confirmed now.
    status = CASE WHEN v_card OR v_benefit THEN 'hold' ELSE 'confirmed' END,
    hold_expires_at = CASE
      WHEN v_card THEN GREATEST(COALESCE(hold_expires_at, now()), now() + interval '30 minutes')
      WHEN v_benefit THEN GREATEST(COALESCE(hold_expires_at, now()), now() + interval '24 hours')
    END,
    confirmed_at = CASE WHEN v_card OR v_benefit THEN NULL ELSE now() END,
    -- A card payment charges only the store's deposit (rounded up to the
    -- fils); the rest is due at the event. None at 0% or 100%.
    deposit_amount = CASE
      WHEN v_card AND v_settings.deposit_percent > 0 AND v_settings.deposit_percent < 100
        THEN ceil(v_order.total * v_settings.deposit_percent * 10) / 1000
    END,
    updated_at = now()
  WHERE id = v_booking.id
  RETURNING * INTO v_booking;

  RETURN v_result || jsonb_build_object(
    'booking_reference', v_booking.reference,
    'booking_status', v_booking.status,
    'deposit_amount', v_booking.deposit_amount
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_booking_status(p_booking_id uuid, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_settings public.booking_settings;
  v_state record;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND OR NOT public.can_access_brand(v_booking.brand_id) THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  v_settings := public.lock_booking_settings_for_staff(v_booking.brand_id);
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;

  IF NOT (
    (v_booking.status = 'requested' AND p_status IN ('confirmed', 'cancelled'))
    OR (v_booking.status = 'confirmed' AND p_status IN ('completed', 'cancelled'))
    OR (v_booking.status = 'completed' AND p_status = 'confirmed')
    OR (v_booking.status = 'cancelled' AND p_status = 'confirmed')
    OR (v_booking.status IN ('hold', 'expired') AND p_status IN ('confirmed', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'BOOKING_TRANSITION_INVALID' USING ERRCODE = '22023';
  END IF;

  IF v_booking.status IN ('requested', 'cancelled', 'hold', 'expired') AND p_status = 'confirmed' THEN
    SELECT * INTO v_state FROM public.booking_day_state_for(
      v_settings, v_booking.event_date, v_booking.id, true, NULL,
      public.booking_is_governed(v_booking.id));
    IF v_state.state <> 'available' THEN
      RAISE EXCEPTION 'BOOKING_DAY_%', upper(v_state.state) USING ERRCODE = '23P01';
    END IF;
    PERFORM public.assert_booking_services_free(p_booking_id);
  END IF;

  UPDATE public.bookings SET
    status = p_status,
    confirmed_at = CASE WHEN p_status = 'confirmed' AND confirmed_at IS NULL THEN now() ELSE confirmed_at END,
    confirmed_by = CASE WHEN p_status = 'confirmed' AND confirmed_by IS NULL THEN auth.uid() ELSE confirmed_by END,
    cancelled_at = CASE WHEN p_status = 'cancelled' THEN now() END,
    cancelled_by = CASE WHEN p_status = 'cancelled' THEN auth.uid() END,
    cancel_reason = CASE WHEN p_status = 'cancelled' THEN NULLIF(btrim(p_reason), '') END,
    hold_expires_at = CASE WHEN p_status IN ('confirmed', 'cancelled') THEN NULL ELSE hold_expires_at END,
    updated_at = now()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  -- The booking and its order go together: confirming invoices it,
  -- cancelling cancels the order, reinstating reopens it.
  IF p_status = 'confirmed' THEN
    IF v_booking.order_id IS NULL THEN
      PERFORM public.create_booking_order(v_booking.id);
    ELSE
      UPDATE public.orders SET status = 'confirmed'
       WHERE id = v_booking.order_id AND status IN ('pending', 'cancelled', 'canceled');
    END IF;
  ELSIF p_status = 'cancelled' AND v_booking.order_id IS NOT NULL THEN
    UPDATE public.orders SET status = 'cancelled'
     WHERE id = v_booking.order_id
       AND status NOT IN ('completed', 'cancelled', 'canceled', 'returned');
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  RETURN v_booking;
END;
$function$;
