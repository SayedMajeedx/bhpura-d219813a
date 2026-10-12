-- A storefront order is handed over in a way the store has switched on.
--
-- A store chooses how an order reaches its customer: delivery, pickup, a digital delivery. The
-- order functions check the digital one; delivery and pickup were only hidden by the checkout
-- page, so the public order function still took a pickup order for a store with no pickup (or a
-- delivery for a store that does not deliver). This is the same gap the payment methods had
-- (migration 20261013160000), and it is closed the same way: on the table.
--
-- It cannot be checked while the order is being written, because two kinds of order are written
-- with one method and given their own a moment later, in the same transaction:
--   * an appointment is written as "delivery" (at the customer's venue, which a services store
--     that does not deliver still offers) and marked "appointment" when its booking is linked;
--   * a digital order is written as "pickup" and then marked "digital".
-- So the rule looks at the order as it stands when the transaction ends (a deferred constraint
-- trigger, like the advance payment's cash refusal). An appointment is never refused here: the
-- booking engine has its own rules for where it happens.
--
-- Orders made by staff (channel `admin`) are not touched, and no order already placed is
-- changed. The checkout already has words for these three refusals.

CREATE OR REPLACE FUNCTION public.check_storefront_fulfilment_enabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_method text;
  v_enabled boolean;
BEGIN
  IF NEW.channel IS DISTINCT FROM 'storefront' THEN
    RETURN NULL;
  END IF;

  -- The order as it is now, not as it was first written.
  SELECT o.fulfillment_method INTO v_method FROM public.orders o WHERE o.id = NEW.id;
  IF NOT FOUND OR v_method IS NULL OR v_method NOT IN ('delivery', 'pickup', 'digital') THEN
    RETURN NULL;
  END IF;

  SELECT CASE v_method
           WHEN 'delivery' THEN s.delivery_enabled
           WHEN 'pickup' THEN s.pickup_enabled
           WHEN 'digital' THEN s.digital_delivery_enabled
         END
    INTO v_enabled
    FROM public.business_settings s
   WHERE s.brand_id = NEW.brand_id;

  IF NOT COALESCE(v_enabled, false) THEN
    RAISE EXCEPTION '%',
      CASE v_method
        WHEN 'delivery' THEN 'DELIVERY_DISABLED'
        WHEN 'pickup' THEN 'PICKUP_DISABLED'
        ELSE 'DIGITAL_DELIVERY_DISABLED'
      END;
  END IF;
  RETURN NULL;
END;
$$;

-- A trigger function: nobody calls it by hand.
REVOKE ALL ON FUNCTION public.check_storefront_fulfilment_enabled() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_fulfilment_enabled ON public.orders;
CREATE CONSTRAINT TRIGGER trg_orders_fulfilment_enabled
  AFTER INSERT ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_storefront_fulfilment_enabled();

-- ── One row to remove ───────────────────────────────────────────────────────
-- The shared cart written on 2026-10-12 to check, on the live store, that a short cart link still
-- saves under the new rules. It is not a shopper's.
DELETE FROM public.shared_carts WHERE code = 'sqzk8g' AND brand_slug = 'zh';
