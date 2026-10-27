-- Automatic offers reach bookings (the owner's decision of 2026-10-27). An offer a store set on a
-- service or a package never showed at a booking's checkout, was applied unseen by the order
-- builder when the order was placed, and then added to any booking offer. Now one rule decides a
-- shopper's booking's discount when the day is held (apply_booking_discount): the better of the
-- store's booking offers and its automatic offers, a booking offer on a tie. The booking carries
-- it, so the booking page, the checkout, the order, the invoice and the deposit read one amount;
-- the order builder leaves a booking's order alone (apply_store_offers, told by
-- place_booking_order), and a store offer meets a typed code by the store's own rule.
-- Each function below is its live definition (pg_get_functiondef, 2026-10-27) with the marked
-- changes. Run in a real Postgres through the booking engine by
-- tests/offers-on-bookings-migration.test.ts.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS discount_offer_id uuid REFERENCES public.store_offers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.apply_booking_discount(p_booking_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
  v_tz text;
  v_today date;
  v_lead integer;
  v_services numeric(12, 3);
  v_base numeric(12, 3);
  v_sum numeric(12, 3);
  v_first uuid;
  v_names_en text;
  v_names_ar text;
  v_amount numeric(12, 3) := 0;
  -- ADDED (20261028120000): the store's automatic offers on a shopper's booking.
  v_outcome jsonb;
  v_offer jsonb;
  v_offer_amount numeric(12, 3) := 0;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT timezone INTO v_tz FROM public.booking_settings WHERE brand_id = v_booking.brand_id;
  v_today := (now() AT TIME ZONE COALESCE(v_tz, 'Asia/Bahrain'))::date;
  v_lead := v_booking.event_date - v_today;

  SELECT COALESCE(sum(line_total), 0) INTO v_services
    FROM public.booking_items WHERE booking_id = v_booking.id;
  -- An offer takes off the services, not the add-ons.
  SELECT COALESCE(sum(line_total), 0) INTO v_base
    FROM public.booking_items WHERE booking_id = v_booking.id AND option_id IS NULL;

  WITH matched AS (
    SELECT r.id, r.name_en, r.name_ar, r.stackable, r.min_days, r.created_at,
           CASE WHEN r.kind = 'percent'
                THEN round(s.applicable * r.value / 100, 3)
                ELSE LEAST(r.value, s.applicable) END AS amount
      FROM public.booking_discount_rules r
      CROSS JOIN LATERAL (
        SELECT COALESCE(sum(bi.line_total), 0) AS applicable
          FROM public.booking_items bi
         WHERE bi.booking_id = v_booking.id AND bi.option_id IS NULL
           AND (r.product_ids IS NULL OR cardinality(r.product_ids) = 0
                OR bi.product_id = ANY (r.product_ids))
      ) s
     WHERE r.brand_id = v_booking.brand_id
       AND r.is_active
       AND v_lead >= r.min_days
       AND (r.max_days IS NULL OR v_lead <= r.max_days)
       AND (r.weekdays IS NULL OR cardinality(r.weekdays) = 0
            OR extract(dow FROM v_booking.event_date)::smallint = ANY (r.weekdays))
       AND (r.valid_from IS NULL OR v_today >= r.valid_from)
       AND (r.valid_to IS NULL OR v_today <= r.valid_to)
       AND (r.event_from IS NULL OR v_booking.event_date >= r.event_from)
       AND (r.event_to IS NULL OR v_booking.event_date <= r.event_to)
       AND (r.requires_product_ids IS NULL OR cardinality(r.requires_product_ids) = 0
            OR EXISTS (
              SELECT 1 FROM public.booking_items k
               WHERE k.booking_id = v_booking.id AND k.product_id = ANY (r.requires_product_ids)
            ))
       AND s.applicable > 0
  ), ranked AS (
    SELECT m.*,
           CASE WHEN NOT m.stackable
                THEN row_number() OVER (
                       PARTITION BY m.stackable
                       ORDER BY m.amount DESC, m.min_days DESC, m.created_at, m.id)
           END AS rn
      FROM matched m
  ), picked AS (
    SELECT * FROM ranked WHERE stackable OR rn = 1
  )
  SELECT COALESCE(sum(amount), 0),
         (array_agg(id ORDER BY stackable, amount DESC, id))[1],
         string_agg(name_en, ' + ' ORDER BY stackable, amount DESC, id) FILTER (WHERE name_en IS NOT NULL),
         string_agg(name_ar, ' + ' ORDER BY stackable, amount DESC, id) FILTER (WHERE name_ar IS NOT NULL)
    INTO v_sum, v_first, v_names_en, v_names_ar
    FROM picked
   WHERE amount > 0;

  -- ADDED (20261028120000): a shopper's booking also meets the store's automatic offers on its
  -- services (add-ons and a package's own services aside), by the order builder's own rule; the
  -- one that saves more is the booking's discount, a booking offer on a tie (the owner's decision
  -- of 2026-10-27). A booking staff make is not touched, as a staff order is not.
  IF v_booking.source = 'storefront' THEN
    SELECT public.store_offers_outcome(
             public.store_offers_live(v_booking.brand_id, now()),
             COALESCE(jsonb_agg(jsonb_build_object(
               'product_id', bi.product_id, 'category', p.category, 'quantity', bi.quantity,
               'line_total', bi.line_total, 'on_sale', false)), '[]'::jsonb),
             'best', 0, 'appointment', NULL)
      INTO v_outcome
      FROM public.booking_items bi
      LEFT JOIN public.products p ON p.id = bi.product_id
     WHERE bi.booking_id = v_booking.id AND bi.option_id IS NULL AND bi.parent_item_id IS NULL;
    v_offer_amount := LEAST(COALESCE((v_outcome ->> 'offer_discount')::numeric, 0), v_base);
    SELECT a INTO v_offer
      FROM jsonb_array_elements(COALESCE(v_outcome -> 'applied', '[]'::jsonb)) a
     WHERE a ->> 'kind' <> 'free_delivery'
     LIMIT 1;
  END IF;
  IF v_offer_amount > 0 AND v_offer_amount > LEAST(COALESCE(v_sum, 0), v_base) THEN
    UPDATE public.bookings SET
      discount_amount = v_offer_amount,
      discount_rule_id = NULL,
      discount_offer_id = (v_offer ->> 'id')::uuid,
      discount_label_en = COALESCE(NULLIF(btrim(v_offer ->> 'name_en'), ''), 'Store offer'),
      discount_label_ar = COALESCE(NULLIF(btrim(v_offer ->> 'name_ar'), ''), 'عرض المتجر'),
      total = v_services - v_offer_amount + COALESCE(travel_fee, 0)
    WHERE id = v_booking.id;
    RETURN v_offer_amount;
  END IF;

  IF v_sum > 0 THEN
    v_amount := LEAST(v_sum, v_base);
    UPDATE public.bookings SET
      discount_amount = v_amount,
      discount_rule_id = v_first,
      discount_offer_id = NULL,
      discount_label_en = v_names_en,
      discount_label_ar = v_names_ar,
      total = v_services - v_amount + COALESCE(travel_fee, 0)
    WHERE id = v_booking.id;
  ELSE
    UPDATE public.bookings SET
      discount_amount = 0, discount_rule_id = NULL, discount_offer_id = NULL,
      discount_label_en = NULL, discount_label_ar = NULL,
      total = v_services + COALESCE(travel_fee, 0)
    WHERE id = v_booking.id;
  END IF;
  RETURN v_amount;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hold_booking(p_brand_id uuid, p_day date, p_start time without time zone, p_duration_minutes integer, p_items jsonb, p_customer jsonb, p_location jsonb DEFAULT '{}'::jsonb, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request jsonb;
  v_booking public.bookings;
  v_minutes integer;
  v_token uuid := gen_random_uuid();
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.business_settings
     WHERE brand_id = p_brand_id AND storefront_mode = 'catalog'
  ) THEN
    RAISE EXCEPTION 'CHECKOUT_DISABLED_CATALOG_MODE' USING ERRCODE = '22023';
  END IF;

  -- Every check, the prices and the limits of a request (it also locks the
  -- store's settings row, so the day's place cannot be taken meanwhile).
  v_request := public.request_booking(
    p_brand_id, p_day, p_start, p_duration_minutes, p_items, p_customer, p_location, p_notes
  );

  SELECT hold_minutes INTO v_minutes FROM public.booking_settings WHERE brand_id = p_brand_id;

  UPDATE public.bookings
     SET status = 'hold',
         hold_expires_at = now() + make_interval(mins => v_minutes),
         hold_token = v_token,
         updated_at = now()
   WHERE brand_id = p_brand_id AND reference = v_request ->> 'reference'
  RETURNING * INTO v_booking;

  RETURN v_request || jsonb_build_object(
    'booking_id', v_booking.id,
    'status', 'hold',
    'hold_token', v_token,
    'hold_expires_at', v_booking.hold_expires_at,
    -- ADDED (20261028120000): the discount's own name, and whether it is a store offer, which the
    -- checkout weighs against a typed code by the store's rule.
    'discount_label_en', v_booking.discount_label_en,
    'discount_label_ar', v_booking.discount_label_ar,
    'discount_from_offer', v_booking.discount_offer_id IS NOT NULL,
    'offers_combine', COALESCE((
      SELECT s.offers_combine FROM public.business_settings s WHERE s.brand_id = p_brand_id
    ), 'best'),
    'items', (
      SELECT jsonb_agg(jsonb_build_object(
        'product_id', bi.product_id,
        'variant_id', bi.variant_id,
        'quantity', bi.quantity,
        'unit_price', bi.unit_price
      ))
      FROM public.booking_items bi
      WHERE bi.booking_id = v_booking.id AND bi.parent_item_id IS NULL
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_store_offers(p_order_id uuid, p_fulfillment text, p_country text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_mode text;
  v_lines jsonb;
  v_has_code boolean;
  v_out jsonb;
BEGIN
  -- ADDED (20261028120000): a booking's order. Its discount was settled with the booking
  -- (apply_booking_discount weighed the store's offers there), and place_booking_order says so for
  -- this transaction; applying them here as well gave the order both.
  IF current_setting('boutq.booking_order', true) = 'on' THEN
    RETURN jsonb_build_object('offer_discount', 0, 'code_discount', 0, 'code_kept', true,
      'code_dropped', false, 'free_delivery', false, 'applied', '[]'::jsonb);
  END IF;

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
  -- ADDED (20261028120000): a store offer on the booking against a typed code.
  v_has_code boolean;
  v_mode text;
  v_keep_offer boolean := true;
  v_keep_code boolean := true;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  SELECT id INTO v_brand_id FROM public.brands WHERE slug = p_brand_slug;
  IF NOT FOUND OR v_booking.id IS NULL OR v_booking.hold_token IS NULL
     OR v_booking.hold_token <> p_hold_token OR v_booking.brand_id IS DISTINCT FROM v_brand_id THEN
    RAISE EXCEPTION 'BOOKING_HOLD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- The same checkout again (a retried card payment): the same order.
  IF v_booking.order_id IS NOT NULL THEN
    PERFORM set_config('boutq.booking_order', 'on', true);
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

  -- ADDED (20261028120000): the order builder leaves this order's offers to the booking.
  PERFORM set_config('boutq.booking_order', 'on', true);
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

  -- The booking's discount comes off the order too. A booking offer's adds to a promo code's;
  -- CHANGED (20261028120000): a store offer's meets the code by the store's own rule
  -- (business_settings.offers_combine: whichever saves more by default, the code on a tie), as on
  -- any storefront order, and the order records the offer it applied.
  IF v_booking.discount_amount > 0 THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_order.id;
    v_has_code := (v_order.promo_code_id IS NOT NULL
      OR NULLIF(btrim(COALESCE(v_order.promo_code, '')), '') IS NOT NULL)
      AND v_order.discount > 0;
    IF v_booking.discount_offer_id IS NOT NULL AND v_has_code THEN
      SELECT COALESCE(s.offers_combine, 'best') INTO v_mode
        FROM public.business_settings s WHERE s.brand_id = v_order.brand_id;
      v_keep_offer := CASE COALESCE(v_mode, 'best')
        WHEN 'together' THEN true
        WHEN 'code_first' THEN false
        ELSE v_booking.discount_amount > v_order.discount END;
      v_keep_code := COALESCE(v_mode, 'best') <> 'best' OR NOT v_keep_offer;
    END IF;
    IF NOT v_keep_code THEN
      UPDATE public.orders
         SET discount = 0, promo_code = NULL, promo_code_id = NULL
       WHERE id = v_order.id;
    END IF;
    IF v_keep_offer THEN
      UPDATE public.orders
         SET discount = LEAST(subtotal, discount + v_booking.discount_amount),
             offer_discount = CASE WHEN v_booking.discount_offer_id IS NOT NULL
                                   THEN v_booking.discount_amount ELSE offer_discount END,
             applied_offers = CASE WHEN v_booking.discount_offer_id IS NOT NULL
               THEN jsonb_build_array(jsonb_build_object(
                 'id', v_booking.discount_offer_id,
                 'kind', COALESCE((SELECT o.kind FROM public.store_offers o
                                    WHERE o.id = v_booking.discount_offer_id), 'discount'),
                 'name_ar', v_booking.discount_label_ar, 'name_en', v_booking.discount_label_en,
                 'amount', v_booking.discount_amount))
               ELSE applied_offers END
       WHERE id = v_order.id;
    ELSE
      -- The code won: the booking keeps no offer.
      UPDATE public.bookings
         SET total = total + discount_amount, discount_amount = 0, discount_offer_id = NULL,
             discount_label_en = NULL, discount_label_ar = NULL
       WHERE id = v_booking.id;
    END IF;
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
