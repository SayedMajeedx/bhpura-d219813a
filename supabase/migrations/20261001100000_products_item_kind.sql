-- Migration: 20261001100000_products_item_kind.sql
--
-- Services vertical, step S1 (docs/services-vertical-plan.md, approved
-- 2026-10-01): an item is a product or a service.
--
--   products.item_kind   'product' (default) or 'service'. Set per item, so
--                        a services store can also sell products.
--   A service is made to order: it never counts stock.
--   A service is always booked: a storefront order with a service line must
--   have a booking by the time it commits (place_booking_order links it).
--   The store's own staff (can_access_brand) and server code (service role)
--   may still record a service without one, e.g. a walk-in.
--
-- Additive: existing items stay products, except in services stores, whose
-- items become services.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'product'
    CHECK (item_kind IN ('product', 'service'));

COMMENT ON COLUMN public.products.item_kind IS
  'product or service. A service is made to order and is sold on the storefront only with a booking.';

-- A service never counts stock.
CREATE OR REPLACE FUNCTION public.products_service_is_made_to_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.item_kind = 'service' THEN
    NEW.is_made_to_order := true;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS products_service_is_made_to_order ON public.products;
CREATE TRIGGER products_service_is_made_to_order
  BEFORE INSERT OR UPDATE OF item_kind, is_made_to_order ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_service_is_made_to_order();

-- Services stores' items are services.
UPDATE public.products p
   SET item_kind = 'service'
  FROM public.business_settings s
 WHERE s.brand_id = p.brand_id
   AND s.store_vertical = 'services'
   AND p.item_kind = 'product';

-- A storefront order's service lines need a booking. Checked when the
-- transaction commits, after place_booking_order has linked the booking.
CREATE OR REPLACE FUNCTION public.order_item_service_needs_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_brand_id uuid;
BEGIN
  IF NEW.product_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = NEW.product_id AND item_kind = 'service'
  ) THEN
    RETURN NULL;
  END IF;

  -- Server code (webhooks, imports) and the store's own staff may record a
  -- service without a booking.
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NULL;
  END IF;

  SELECT brand_id INTO v_brand_id FROM public.orders WHERE id = NEW.order_id;
  IF v_brand_id IS NULL OR public.can_access_brand(v_brand_id) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE order_id = NEW.order_id) THEN
    RAISE EXCEPTION 'SERVICE_NEEDS_BOOKING' USING ERRCODE = '22023';
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.order_item_service_needs_booking() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS order_item_service_needs_booking ON public.order_items;
CREATE CONSTRAINT TRIGGER order_item_service_needs_booking
  AFTER INSERT ON public.order_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.order_item_service_needs_booking();
