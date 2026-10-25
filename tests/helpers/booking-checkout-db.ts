import bookingDeposits from "../../supabase/migrations/20260930160000_booking_deposits.sql?raw";

// A booking's checkout in the engine's test database (tests/helpers/booking-engine-db.ts): what
// paying an order needs, shared by the tests that run place_booking_order through a payment.

// What the engine's test database lacks for paying an order: the payment columns, the store's
// payment switches, the admin check, the advance rule (a fixed amount per order, set by a test)
// and the trigger that moves a booking with its order's payment, as in the live database.
export const PAYMENTS = `
  ALTER TABLE public.orders
    ADD COLUMN payment_method text,
    ADD COLUMN benefit_verified_at timestamptz,
    ADD COLUMN benefit_verified_by uuid,
    ADD COLUMN benefit_receipt_key text,
    ADD COLUMN benefit_receipt_delete_after timestamptz,
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN test_advance numeric;
  ALTER TABLE public.business_settings
    ADD COLUMN card_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN benefit_enabled boolean NOT NULL DEFAULT false;
  CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
  CREATE FUNCTION public.order_advance_due(p_order_id uuid) RETURNS numeric LANGUAGE sql AS $$
    SELECT test_advance FROM public.orders WHERE id = p_order_id
  $$;
  CREATE OR REPLACE FUNCTION public.place_storefront_order(
    p_brand_slug text, p_customer jsonb, p_items jsonb, p_payment_method text,
    p_notes text DEFAULT NULL, p_fulfillment text DEFAULT 'delivery', p_branch_id uuid DEFAULT NULL,
    p_digital_channel text DEFAULT NULL, p_digital_contact text DEFAULT NULL,
    p_promo_code text DEFAULT NULL, p_benefit_receipt_id uuid DEFAULT NULL,
    p_shipping_fee numeric DEFAULT NULL, p_shipping_zone text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL
  ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
  DECLARE v_brand uuid; v_order uuid; v_sum numeric := 0; v_line jsonb; v_variant record;
  BEGIN
    SELECT id INTO v_brand FROM public.brands WHERE slug = p_brand_slug;
    INSERT INTO public.orders (brand_id, status, fulfillment_method, customer_name_snapshot,
      customer_phone_snapshot, invoice_number, channel, payment_method)
    VALUES (v_brand, 'pending', 'appointment', p_customer ->> 'name', p_customer ->> 'phone', 0,
      'storefront', p_payment_method)
    RETURNING id INTO v_order;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      SELECT v.id, v.product_id, v.selling_price, p.name INTO v_variant
        FROM public.product_variants v JOIN public.products p ON p.id = v.product_id
       WHERE v.id = (v_line ->> 'variant_id')::uuid;
      INSERT INTO public.order_items (order_id, brand_id, product_id, variant_id, description,
        quantity, unit_price, line_total)
      VALUES (v_order, v_brand, v_variant.product_id, v_variant.id, v_variant.name,
        (v_line ->> 'quantity')::integer, v_variant.selling_price,
        v_variant.selling_price * (v_line ->> 'quantity')::integer);
      v_sum := v_sum + v_variant.selling_price * (v_line ->> 'quantity')::integer;
    END LOOP;
    UPDATE public.orders SET subtotal = v_sum, total = v_sum WHERE id = v_order;
    RETURN jsonb_build_object('order_id', v_order, 'total', v_sum);
  END $function$;
`;

/** The live sync_bookings_with_order (migration 20260930160000) and its trigger. */
export function syncTrigger(): string {
  const start = bookingDeposits.indexOf(
    "CREATE OR REPLACE FUNCTION public.sync_bookings_with_order",
  );
  const end = bookingDeposits.indexOf("$function$;", start) + "$function$;".length;
  return `${bookingDeposits.slice(start, end)}
    CREATE TRIGGER trg_orders_sync_bookings AFTER UPDATE OF status, payment_status ON public.orders
      FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status
        OR old.payment_status IS DISTINCT FROM new.payment_status)
      EXECUTE FUNCTION public.sync_bookings_with_order();`;
}
