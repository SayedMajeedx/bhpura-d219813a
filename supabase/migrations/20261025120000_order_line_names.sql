-- A line of an order has its own name in Arabic and in English.
--
-- A booking's order is written by the database from the booking's lines (place_booking_order at
-- checkout, create_booking_order when staff invoice a booking), and its add-ons ("+ Instant
-- prints"), a package's services ("↳ ...") and extra time have no product to take a name from:
-- the order kept one English text (`description`), so an Arabic store's order screen, its
-- customer's Arabic invoice and email read "+ Instant prints" and "+ Extra time". The booking's
-- lines carry both names (booking_items.name_ar / name_en); the order line now keeps them too,
-- and the order screen, the invoice and the order email show the reader's language (a line with
-- a product shows the product's own name in that language).
--
-- Additive: two nullable columns, and the two live functions with their order-line inserts
-- naming them, nothing else changed (tests/order-line-names-migration.test.ts compares them with
-- the definitions they replace and runs them in a real Postgres). The lines already written for
-- a booking are given their names from the booking's lines, matched as the functions wrote them.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS name_ar text,
  ADD COLUMN IF NOT EXISTS name_en text;

COMMENT ON COLUMN public.order_items.name_ar IS
  'The line''s own name in Arabic, for a line with no product to name it (a booking''s add-on, a package''s service, extra time). Null: the product''s name or the description.';
COMMENT ON COLUMN public.order_items.name_en IS
  'The line''s own name in English (see name_ar).';

CREATE OR REPLACE FUNCTION public.create_booking_order(p_booking_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_vat_inclusive boolean := false;
  v_currency text := 'BHD';
  v_order_id uuid;
  v_subtotal numeric(12, 3);
  v_discount numeric(12, 3);
  v_shipping numeric(12, 3);
  v_taxable numeric(12, 3);
  v_tax_rate numeric;
  v_tax numeric(12, 3);
  v_total numeric(12, 3);
  v_status text;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR NOT (
    public.can_access_brand(v_booking.brand_id) AND public.has_permission('manage_orders')
  ) THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Already invoiced: the same order.
  IF v_booking.order_id IS NOT NULL THEN
    RETURN v_booking.order_id;
  END IF;

  IF v_booking.status IN ('hold', 'expired') THEN
    RAISE EXCEPTION 'BOOKING_TRANSITION_INVALID' USING ERRCODE = '22023';
  END IF;

  v_tax_rate := 0;
  SELECT COALESCE(default_tax_rate, 0), COALESCE(vat_inclusive, false),
         COALESCE(NULLIF(currency, ''), 'BHD')
    INTO v_tax_rate, v_vat_inclusive, v_currency
    FROM public.business_settings WHERE brand_id = v_booking.brand_id;

  SELECT COALESCE(sum(line_total), 0) INTO v_subtotal
    FROM public.booking_items WHERE booking_id = v_booking.id;
  v_shipping := COALESCE(v_booking.travel_fee, 0);
  v_discount := LEAST(v_subtotal, COALESCE(v_booking.discount_amount, 0));
  v_taxable := v_subtotal - v_discount;
  IF v_vat_inclusive THEN
    v_tax := v_taxable - (v_taxable / (1 + (v_tax_rate / 100)));
    v_total := v_taxable + v_shipping;
  ELSE
    v_tax := (v_taxable * v_tax_rate) / 100;
    v_total := v_taxable + v_tax + v_shipping;
  END IF;

  v_status := CASE WHEN v_booking.status = 'cancelled' THEN 'cancelled'
                   WHEN v_booking.status IN ('confirmed', 'completed') THEN 'confirmed'
                   ELSE 'pending' END;

  INSERT INTO public.orders (
    brand_id, user_id, customer_id, invoice_number, status, fulfillment_method,
    customer_name_snapshot, customer_phone_snapshot, customer_email_snapshot,
    notes, subtotal, discount, shipping, tax_rate, tax_amount, total, currency,
    order_date, payment_status, advance_paid, channel
  ) VALUES (
    v_booking.brand_id, auth.uid(), v_booking.customer_id, 0, v_status, 'appointment',
    v_booking.customer_name, v_booking.customer_phone, v_booking.customer_email,
    NULLIF(btrim(concat_ws(E'\n', CASE WHEN v_discount > 0 THEN '🏷 ' || COALESCE(v_booking.discount_label_en, v_booking.discount_label_ar, 'Discount') END, v_booking.notes)), ''),
    v_subtotal, v_discount, v_shipping, v_tax_rate, round(v_tax, 3), round(v_total, 3), v_currency,
    v_booking.event_date, 'unpaid', 0, 'admin'
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id, brand_id, user_id, product_id, variant_id, description, name_ar, name_en,
    quantity, unit_price, line_total, location
  )
  SELECT v_order_id, v_booking.brand_id, auth.uid(), bi.product_id, bi.variant_id,
         CASE WHEN bi.option_id IS NOT NULL THEN '+ '
              WHEN bi.parent_item_id IS NOT NULL THEN '↳ '
              ELSE '' END
           || COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Service'),
         CASE WHEN bi.option_id IS NOT NULL THEN '+ '
              WHEN bi.parent_item_id IS NOT NULL THEN '↳ '
              ELSE '' END
           || COALESCE(NULLIF(btrim(bi.name_ar), ''), NULLIF(btrim(bi.name_en), ''), 'خدمة'),
         CASE WHEN bi.option_id IS NOT NULL THEN '+ '
              WHEN bi.parent_item_id IS NOT NULL THEN '↳ '
              ELSE '' END
           || COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Service'),
         bi.quantity, bi.unit_price, bi.line_total, 'main'
    FROM public.booking_items bi
   WHERE bi.booking_id = v_booking.id
   ORDER BY bi.id;

  UPDATE public.bookings SET order_id = v_order_id, updated_at = now() WHERE id = v_booking.id;
  RETURN v_order_id;
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
    order_id, brand_id, user_id, product_id, description, name_ar, name_en,
    quantity, unit_price, line_total, location
  )
  SELECT v_order.id, v_order.brand_id, v_order.user_id, bi.product_id,
         '↳ ' || COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Service'),
         '↳ ' || COALESCE(NULLIF(btrim(bi.name_ar), ''), NULLIF(btrim(bi.name_en), ''), 'خدمة'),
         '↳ ' || COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Service'),
         bi.quantity, 0, 0, 'main'
    FROM public.booking_items bi
   WHERE bi.booking_id = v_booking.id AND bi.parent_item_id IS NOT NULL AND bi.option_id IS NULL
   ORDER BY bi.id;

  -- The add-ons the customer chose, priced on the order.
  INSERT INTO public.order_items (
    order_id, brand_id, user_id, product_id, description, name_ar, name_en,
    quantity, unit_price, line_total, location
  )
  SELECT v_order.id, v_order.brand_id, v_order.user_id, NULL,
         '+ ' || COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Add-on'),
         '+ ' || COALESCE(NULLIF(btrim(bi.name_ar), ''), NULLIF(btrim(bi.name_en), ''), 'إضافة'),
         '+ ' || COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Add-on'),
         1, bi.unit_price, bi.line_total, 'main'
    FROM public.booking_items bi
   WHERE bi.booking_id = v_booking.id AND bi.option_id IS NOT NULL
   ORDER BY bi.id;
  SELECT COALESCE(sum(line_total), 0) INTO v_options
    FROM public.booking_items WHERE booking_id = v_booking.id AND option_id IS NOT NULL;
  IF v_gap > 0.0005 THEN
    INSERT INTO public.order_items (
      order_id, brand_id, user_id, product_id, description, name_ar, name_en,
      quantity, unit_price, line_total, location
    ) VALUES (v_order.id, v_order.brand_id, v_order.user_id, NULL, '+ Extra time',
              '+ وقت إضافي', '+ Extra time', 1, v_gap, v_gap, 'main');
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
    -- A card payment charges only the store's deposit, and a BenefitPay transfer
    -- pays only it (rounded up to the fils); the rest is due by the store's
    -- booking terms. None at 0% or 100%, and none for cash (refused under a
    -- deposit by trg_orders_booking_deposit_cod).
    deposit_amount = CASE
      WHEN (v_card OR v_benefit) AND v_settings.deposit_percent > 0 AND v_settings.deposit_percent < 100
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


-- The lines already written for a booking: their names from the booking's lines, as written.
UPDATE public.order_items oi
   SET name_ar = x.prefix || COALESCE(NULLIF(btrim(x.name_ar), ''), NULLIF(btrim(x.name_en), '')),
       name_en = x.prefix || COALESCE(NULLIF(btrim(x.name_en), ''), NULLIF(btrim(x.name_ar), ''))
  FROM (
    SELECT k.order_id, bi.name_ar, bi.name_en,
           CASE WHEN bi.option_id IS NOT NULL THEN '+ '
                WHEN bi.parent_item_id IS NOT NULL THEN '↳ '
                ELSE '' END AS prefix
      FROM public.bookings k
      JOIN public.booking_items bi ON bi.booking_id = k.id
     WHERE k.order_id IS NOT NULL
       AND (bi.option_id IS NOT NULL OR bi.parent_item_id IS NOT NULL)
  ) x
 WHERE oi.order_id = x.order_id
   AND oi.name_ar IS NULL
   AND oi.description = x.prefix || COALESCE(NULLIF(btrim(x.name_en), ''), NULLIF(btrim(x.name_ar), ''));

UPDATE public.order_items
   SET name_ar = '+ وقت إضافي', name_en = '+ Extra time'
 WHERE description = '+ Extra time' AND product_id IS NULL AND name_ar IS NULL;
