-- Migration: 20261001160000_appointment_orders.sql
--
-- Services vertical, step S3 (docs/services-vertical-plan.md): an order placed
-- for a booking is fulfilled as an appointment, not shipped.
--
--   orders.fulfillment_method gains 'appointment'. The checkout still places
--   the order as before (place_booking_order -> place_storefront_order, with
--   the booking's travel fee as the delivery fee); when the booking is linked
--   to its order, the order becomes an appointment.
--   An appointment keeps the event's address snapshot (it was cleared for
--   anything but a delivery), and gets no "out for delivery" / "delivered"
--   WhatsApp message.
--
-- The two functions are redefined from their live definitions (2026-10-01)
-- with only those conditions changed.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_method_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfillment_method_check
  CHECK (fulfillment_method = ANY (ARRAY['delivery'::text, 'pickup'::text, 'digital'::text, 'appointment'::text]));

CREATE OR REPLACE FUNCTION public.capture_order_delivery_address_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_address public.customer_addresses%rowtype;
begin
  -- An appointment keeps the address the customer gave for the event.
  if new.fulfillment_method is null
     or new.fulfillment_method not in ('delivery', 'appointment')
     or new.shipping_address_id is null then
    new.delivery_address_snapshot := null;
    return new;
  end if;

  -- Preserve an existing historical snapshot unless the selected address changes.
  if tg_op = 'UPDATE'
     and new.shipping_address_id is not distinct from old.shipping_address_id
     and new.customer_id is not distinct from old.customer_id
     and new.brand_id is not distinct from old.brand_id
     and old.delivery_address_snapshot is not null then
    new.delivery_address_snapshot := old.delivery_address_snapshot;
    return new;
  end if;

  select * into v_address
  from public.customer_addresses
  where id = new.shipping_address_id
    and brand_id = new.brand_id
    and customer_id = new.customer_id;

  if not found then
    raise exception 'The selected delivery address does not belong to this customer and brand.';
  end if;

  new.delivery_address_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'schema_version', 1,
    'id', v_address.id,
    'label', v_address.label,
    'region', v_address.region,
    'block', v_address.block,
    'road', v_address.road,
    'house', v_address.house,
    'flat', v_address.flat,
    'floor', v_address.floor,
    'landmark', v_address.landmark,
    'delivery_notes', v_address.delivery_notes,
    'formatted_address', v_address.formatted_address,
    'latitude', v_address.latitude,
    'longitude', v_address.longitude,
    'place_id', v_address.place_id
  ));
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.automate_order_whatsapp_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.whatsapp_transactional_opt_in_at IS NULL THEN RETURN NEW; END IF;

  IF lower(COALESCE(NEW.payment_method, '')) IN (
       'benefit', 'benefitpay', 'benefit_pay', 'bank_transfer'
     )
     AND lower(COALESCE(NEW.payment_status, '')) = 'paid'
     AND lower(COALESCE(OLD.payment_status, '')) <> 'paid' THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'benefit_payment_approved');
  END IF;

  IF lower(COALESCE(NEW.payment_method, '')) IN (
       'benefit', 'benefitpay', 'benefit_pay', 'bank_transfer'
     )
     AND NEW.benefit_receipt_rejected_at IS NOT NULL
     AND OLD.benefit_receipt_rejected_at IS NULL THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'benefit_payment_rejected');
  END IF;

  IF lower(COALESCE(NEW.fulfillment_method, '')) = 'pickup'
     AND lower(COALESCE(NEW.fulfillment_status, '')) = 'ready_for_pickup'
     AND lower(COALESCE(OLD.fulfillment_status, '')) <> 'ready_for_pickup' THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'ready_for_pickup');
  END IF;

  -- Shipping messages are for deliveries, not pickups or appointments.
  IF lower(COALESCE(NEW.fulfillment_method, '')) NOT IN ('pickup', 'appointment')
     AND lower(COALESCE(NEW.fulfillment_status, '')) IN (
       'shipped', 'assigned', 'out_for_delivery', 'ready_for_delivery'
     )
     AND lower(COALESCE(OLD.fulfillment_status, '')) NOT IN (
       'shipped', 'assigned', 'out_for_delivery', 'ready_for_delivery'
     ) THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'out_for_delivery');
  END IF;

  IF lower(COALESCE(NEW.fulfillment_method, '')) = 'pickup'
     AND (
       lower(COALESCE(NEW.fulfillment_status, '')) IN ('picked_up', 'completed')
       OR lower(COALESCE(NEW.status, '')) = 'completed'
     )
     AND lower(COALESCE(OLD.fulfillment_status, '')) NOT IN ('picked_up', 'completed')
     AND lower(COALESCE(OLD.status, '')) <> 'completed' THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'order_picked_up');
  ELSIF lower(COALESCE(NEW.fulfillment_method, '')) NOT IN ('pickup', 'appointment')
     AND (
       lower(COALESCE(NEW.fulfillment_status, '')) IN ('delivered', 'completed')
       OR lower(COALESCE(NEW.status, '')) = 'completed'
     )
     AND lower(COALESCE(OLD.fulfillment_status, '')) NOT IN ('delivered', 'completed')
     AND lower(COALESCE(OLD.status, '')) <> 'completed' THEN
    PERFORM public.enqueue_order_whatsapp_event(NEW.id, 'order_delivered');
  END IF;

  RETURN NEW;
END;
$function$;

-- A booking linked to an order makes it an appointment.
CREATE OR REPLACE FUNCTION public.booking_marks_order_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    UPDATE public.orders
       SET fulfillment_method = 'appointment'
     WHERE id = NEW.order_id
       AND fulfillment_method IN ('delivery', 'pickup');
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.booking_marks_order_appointment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS booking_marks_order_appointment ON public.bookings;
CREATE TRIGGER booking_marks_order_appointment
  AFTER INSERT OR UPDATE OF order_id ON public.bookings
  FOR EACH ROW
  WHEN (NEW.order_id IS NOT NULL)
  EXECUTE FUNCTION public.booking_marks_order_appointment();

-- Orders already placed for a booking.
UPDATE public.orders o
   SET fulfillment_method = 'appointment'
  FROM public.bookings b
 WHERE b.order_id = o.id
   AND o.fulfillment_method IN ('delivery', 'pickup');
