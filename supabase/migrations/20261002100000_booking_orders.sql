-- Migration: 20261002100000_booking_orders.sql
--
-- Services vertical: every booking has an order, so it has an invoice.
--
-- A booking made from the storefront's request form, by staff, or by WhatsApp
-- used to live only in the bookings calendar: no order, no invoice, no payment
-- record, nothing to send the customer. create_booking_order turns a booking
-- into its appointment order (one line per service, the travel fee as the
-- delivery fee, the store's VAT), once: asking again returns the same order.
--
--   * confirming a request creates its order;
--   * a booking staff enter as confirmed has its order from the start;
--   * a requested booking that is not answered yet can still be invoiced
--     (a quote) with the same call;
--   * cancelling a booking cancels its order, and reinstating it reopens it.
--
-- A checkout booking already has its order (place_booking_order). Additive:
-- no existing booking is changed; bookings without an order are invoiced from
-- their card (the owner's choice, nothing is created in bulk).

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
  v_taxable := v_subtotal;
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
    NULLIF(btrim(v_booking.notes), ''),
    v_subtotal, 0, v_shipping, v_tax_rate, round(v_tax, 3), round(v_total, 3), v_currency,
    v_booking.event_date, 'unpaid', 0, 'admin'
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id, brand_id, user_id, product_id, variant_id, description, quantity,
    unit_price, line_total, location
  )
  SELECT v_order_id, v_booking.brand_id, auth.uid(), bi.product_id, bi.variant_id,
         COALESCE(NULLIF(btrim(bi.name_en), ''), NULLIF(btrim(bi.name_ar), ''), 'Service'),
         bi.quantity, bi.unit_price, bi.line_total, 'main'
    FROM public.booking_items bi
   WHERE bi.booking_id = v_booking.id
   ORDER BY bi.id;

  UPDATE public.bookings SET order_id = v_order_id, updated_at = now() WHERE id = v_booking.id;
  RETURN v_order_id;
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
  ) THEN
    RAISE EXCEPTION 'BOOKING_TRANSITION_INVALID' USING ERRCODE = '22023';
  END IF;

  IF v_booking.status IN ('requested', 'cancelled') AND p_status = 'confirmed' THEN
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

CREATE OR REPLACE FUNCTION public.create_staff_booking(p_brand_id uuid, p_day date, p_start time without time zone, p_duration_minutes integer, p_customer jsonb, p_items jsonb, p_location jsonb DEFAULT '{}'::jsonb, p_notes text DEFAULT NULL::text, p_status text DEFAULT 'confirmed'::text, p_source text DEFAULT 'admin'::text, p_allow_overbook boolean DEFAULT false)
 RETURNS bookings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings public.booking_settings;
  v_state record;
  v_window record;
  v_customer_id uuid;
  v_booking public.bookings;
  v_item jsonb;
  v_total numeric(12, 3) := 0;
BEGIN
  v_settings := public.lock_booking_settings_for_staff(p_brand_id);

  IF p_status NOT IN ('confirmed', 'requested') THEN
    RAISE EXCEPTION 'BOOKING_STATUS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_source NOT IN ('admin', 'whatsapp') THEN
    RAISE EXCEPTION 'BOOKING_SOURCE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0
     OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'BOOKING_ITEMS_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_window FROM public.booking_window(v_settings, p_day, p_start, p_duration_minutes);

  IF p_status = 'confirmed' AND NOT p_allow_overbook THEN
    SELECT * INTO v_state FROM public.booking_day_state_for(
      v_settings, p_day, NULL, true, NULL, public.booking_items_all_governed(p_brand_id, p_items));
    IF v_state.state <> 'available' THEN
      RAISE EXCEPTION 'BOOKING_DAY_%', upper(v_state.state) USING ERRCODE = '23P01';
    END IF;
  END IF;

  -- A customer given by id must be the store's own.
  v_customer_id := NULLIF(p_customer ->> 'id', '')::uuid;
  IF v_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = v_customer_id AND brand_id = p_brand_id
  ) THEN
    RAISE EXCEPTION 'BOOKING_CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.bookings (
    brand_id, reference, status, event_date, starts_at, ends_at, customer_id,
    customer_name, customer_phone, customer_email, location, notes, source,
    confirmed_at, confirmed_by, created_by
  ) VALUES (
    p_brand_id, public.next_booking_reference(p_brand_id), p_status, p_day,
    v_window.starts_at, v_window.ends_at, v_customer_id,
    NULLIF(btrim(p_customer ->> 'name'), ''), NULLIF(btrim(p_customer ->> 'phone'), ''),
    NULLIF(btrim(p_customer ->> 'email'), ''), COALESCE(p_location, '{}'::jsonb),
    NULLIF(btrim(p_notes), ''), p_source,
    CASE WHEN p_status = 'confirmed' THEN now() END,
    CASE WHEN p_status = 'confirmed' THEN auth.uid() END,
    auth.uid()
  )
  RETURNING * INTO v_booking;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- A product given by id must be the store's own.
    IF NULLIF(v_item ->> 'product_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products
       WHERE id = (v_item ->> 'product_id')::uuid AND brand_id = p_brand_id
    ) THEN
      RAISE EXCEPTION 'BOOKING_PRODUCT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.booking_items (
      booking_id, brand_id, product_id, variant_id, name_en, name_ar, quantity, unit_price
    ) VALUES (
      v_booking.id, p_brand_id,
      NULLIF(v_item ->> 'product_id', '')::uuid,
      (SELECT pv.id FROM public.product_variants pv
        WHERE pv.id = NULLIF(v_item ->> 'variant_id', '')::uuid
          AND pv.product_id = NULLIF(v_item ->> 'product_id', '')::uuid),
      NULLIF(btrim(v_item ->> 'name_en'), ''),
      NULLIF(btrim(v_item ->> 'name_ar'), ''),
      COALESCE((v_item ->> 'quantity')::integer, 1),
      COALESCE((v_item ->> 'unit_price')::numeric, 0)
    );
    v_total := v_total
      + COALESCE((v_item ->> 'quantity')::integer, 1) * COALESCE((v_item ->> 'unit_price')::numeric, 0);
  END LOOP;

  -- Each service's capacity (the booking is written, so it is excluded from its own count).
  IF p_status = 'confirmed' AND NOT p_allow_overbook THEN
    PERFORM public.assert_booking_services_free(v_booking.id);
  END IF;

  UPDATE public.bookings SET total = v_total WHERE id = v_booking.id RETURNING * INTO v_booking;

  -- Entered as confirmed: invoiced from the start.
  IF p_status = 'confirmed' THEN
    PERFORM public.create_booking_order(v_booking.id);
    SELECT * INTO v_booking FROM public.bookings WHERE id = v_booking.id;
  END IF;
  RETURN v_booking;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_booking_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking_order(uuid) TO authenticated;
