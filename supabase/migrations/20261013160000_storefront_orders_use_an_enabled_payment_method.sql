-- A storefront order is paid in a way the store has switched on.
--
-- A store chooses how it is paid: cash (on delivery, or on the day of an appointment), card,
-- BenefitPay. The order builder used to refuse a method the store had switched off
-- (PAYMENT_METHOD_DISABLED, last in migration 20260917100000); a later rewrite of the builder
-- dropped the check, and since then only the checkout page hid the method. The function that
-- places an order is public, so anyone could still place a cash order with a store that takes
-- no cash: an unpaid order that takes stock, or, for an appointment, confirms the day at once.
--
-- The rule is held where the order is written, so it covers every way an order is built (the
-- order builder, its wrappers, the booking checkout) and cannot be dropped by rewriting one of
-- them. Orders made by staff (channel `admin`) are not touched, and no order already placed is
-- changed. The checkout already has words for this refusal.

CREATE OR REPLACE FUNCTION public.refuse_disabled_storefront_payment_method()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  IF NEW.channel IS DISTINCT FROM 'storefront' THEN
    RETURN NEW;
  END IF;

  SELECT CASE NEW.payment_method
           WHEN 'cod' THEN s.cod_enabled
           WHEN 'card' THEN s.card_enabled
           WHEN 'benefit' THEN s.benefit_enabled
         END
    INTO v_enabled
    FROM public.business_settings s
   WHERE s.brand_id = NEW.brand_id;

  -- A method the storefront does not have (anything but the three), a store with no settings
  -- and a method that is switched off all end here.
  IF NEW.payment_method IS NULL OR NEW.payment_method NOT IN ('cod', 'card', 'benefit') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT';
  END IF;
  IF NOT COALESCE(v_enabled, false) THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_DISABLED';
  END IF;
  RETURN NEW;
END;
$$;

-- A trigger function: nobody calls it by hand.
REVOKE ALL ON FUNCTION public.refuse_disabled_storefront_payment_method() FROM PUBLIC, anon, authenticated;

-- Named to run after the trigger that fills a new order's store (`trg_orders_default_brand`):
-- BEFORE triggers run in the order of their names.
DROP TRIGGER IF EXISTS trg_orders_payment_method_enabled ON public.orders;
CREATE TRIGGER trg_orders_payment_method_enabled
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.refuse_disabled_storefront_payment_method();
