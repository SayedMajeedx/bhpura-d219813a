-- A booking's deposit is paid by BenefitPay too, and a booking under a deposit is not paid in cash.
--
-- A store's booking deposit (booking_settings.deposit_percent) was charged by card only: the
-- order builder wrote bookings.deposit_amount for a card payment, and a BenefitPay transfer was
-- approved for the whole total. Most stores in Bahrain take BenefitPay and not cards, so their
-- deposit was never taken, while their pages promised it. And a shopper could pick cash and
-- have the day confirmed at once with nothing paid, under a deposit meant to secure it.
--
-- The owner's decisions (2026-10-23): a transfer pays the deposit only, the rest due by the
-- store's booking terms; and while a store asks a deposit and takes a card or BenefitPay, a
-- booking is not paid in cash.
--
--   1. place_booking_order (the live definition, one condition changed) writes the deposit for a
--      BenefitPay transfer as for a card.
--   2. approve_benefit_payment (the live definition, one lookup added) records a booking's
--      deposit when no advance rule reaches the order: the order is `partially_paid`, the
--      balance stays due, and the booking is confirmed (sync_bookings_with_order).
--   3. A storefront cash order for a booking is refused at the end of its transaction, while the
--      store asks a deposit and takes a card or BenefitPay (BOOKING_DEPOSIT_REQUIRED), like an
--      advance rule's cash refusal. The rule sits on the table, so a rewrite of the order
--      builder cannot drop it. A store that takes neither keeps cash: it takes no deposit.
--
-- Orders and bookings already placed are not changed; staff orders (channel `admin`) are not
-- touched. Tested in a real Postgres by tests/booking-transfer-deposit-migration.test.ts.

-- 1. The deposit is written for a transfer as for a card.
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

-- 2. A transfer for a booking pays its deposit.
CREATE OR REPLACE FUNCTION public.approve_benefit_payment(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_advance numeric;
  v_part boolean;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT public.is_admin() OR NOT public.can_access_brand(v_order.brand_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF lower(COALESCE(v_order.payment_method, '')) NOT IN (
       'benefit', 'benefitpay', 'benefit_pay', 'bank_transfer'
     ) THEN
    RAISE EXCEPTION 'NOT_A_TRANSFER_ORDER';
  END IF;
  IF v_order.payment_status IN ('paid', 'partially_paid') THEN
    RETURN jsonb_build_object('approved', true, 'already_paid', true);
  END IF;

  -- An order placed under an advance rule is paid in part: the advance is recorded and
  -- the balance stays due. Nothing is owed in advance when the rule does not reach it.
  -- Without an advance, a booking's own deposit is what its transfer paid (the card charge
  -- reads the two in the same order: orderChargePlan).
  v_advance := public.order_advance_due(p_order_id);
  IF v_advance IS NULL THEN
    SELECT b.deposit_amount INTO v_advance
      FROM public.bookings b
     WHERE b.order_id = p_order_id AND b.deposit_amount > 0
     LIMIT 1;
  END IF;
  v_part := v_advance IS NOT NULL AND v_advance < v_order.total;

  UPDATE public.orders
  SET status = 'confirmed',
      payment_status = CASE WHEN v_part THEN 'partially_paid' ELSE 'paid' END,
      advance_paid = CASE WHEN v_part THEN v_advance ELSE total END,
      benefit_verified_at = now(),
      benefit_verified_by = auth.uid(),
      benefit_receipt_delete_after = CASE
        WHEN benefit_receipt_key IS NOT NULL THEN now() + interval '30 days'
        ELSE benefit_receipt_delete_after
      END,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'approved', true,
    'advance_only', v_part,
    'receipt_delete_after', CASE
      WHEN v_order.benefit_receipt_key IS NOT NULL THEN now() + interval '30 days'
    END
  );
END;
$function$;

-- 3. No cash for a booking while the store asks a deposit it can take.
CREATE OR REPLACE FUNCTION public.check_booking_deposit_cod()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.channel = 'storefront'
     AND NEW.payment_method = 'cod'
     AND EXISTS (
       SELECT 1
         FROM public.bookings b
         JOIN public.booking_settings s ON s.brand_id = b.brand_id
         JOIN public.business_settings bs ON bs.brand_id = b.brand_id
        WHERE b.order_id = NEW.id
          AND s.deposit_percent > 0
          AND (COALESCE(bs.card_enabled, false) OR COALESCE(bs.benefit_enabled, false))
     ) THEN
    RAISE EXCEPTION 'BOOKING_DEPOSIT_REQUIRED'
      USING HINT = 'This store asks a deposit for a booking, paid by card or BenefitPay.';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.check_booking_deposit_cod() FROM PUBLIC, anon, authenticated;

-- At the end of the transaction: the booking is linked to its order after the order is written.
DROP TRIGGER IF EXISTS trg_orders_booking_deposit_cod ON public.orders;
CREATE CONSTRAINT TRIGGER trg_orders_booking_deposit_cod
  AFTER INSERT ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_booking_deposit_cod();
