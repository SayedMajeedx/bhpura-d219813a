-- A paid order whose total goes up owes the difference; it is not paid in full at the new total.
--
-- `orders_payment_amounts` (migration 20261012130000) keeps 'paid' and the collected amount in
-- agreement by raising `advance_paid` to the total whenever an order says 'paid'. That is right
-- when 'paid' is being recorded, and wrong when an order already paid has its total raised
-- afterwards (a delivery fee added when a pickup became a delivery, a line added): the rule then
-- recorded money nobody collected. Order 1108 of a store went from pickup to delivery after a
-- gift card had paid all of it; the 2.000 fee was written as collected, and the order offered no
-- balance to collect.
--
-- Now: on an UPDATE that raises the total of an order that was paid, and that neither records a
-- payment (advance_paid unchanged) nor sets the payment status itself, what was collected stays
-- what it was (the old total at least, as 'paid' meant) and the order is part paid, owing the
-- rest. Recording 'paid' still fills the amount as before, and a total that goes down is left
-- alone. The order alterations' repricing already wrote part paid itself and is unchanged.

CREATE OR REPLACE FUNCTION public.orders_payment_amounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text := lower(COALESCE(NEW.payment_status, ''));
BEGIN
  IF COALESCE(NEW.total, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Paid, and the total went up with no payment recorded: the rest is owed.
  IF TG_OP = 'UPDATE'
     AND v_status = 'paid'
     AND lower(COALESCE(OLD.payment_status, '')) = 'paid'
     AND NEW.advance_paid IS NOT DISTINCT FROM OLD.advance_paid
     AND NEW.total > COALESCE(OLD.total, 0)
     AND GREATEST(COALESCE(OLD.advance_paid, 0), COALESCE(OLD.total, 0)) < NEW.total THEN
    NEW.advance_paid := GREATEST(COALESCE(OLD.advance_paid, 0), COALESCE(OLD.total, 0));
    NEW.payment_status := 'partially_paid';
    v_status := 'partially_paid';
  END IF;

  -- Paid in part, and the parts add up to the total: it is paid.
  IF v_status IN ('partially_paid', 'partial') AND COALESCE(NEW.advance_paid, 0) >= NEW.total THEN
    NEW.payment_status := 'paid';
    v_status := 'paid';
  END IF;

  -- Paid: everything was collected, whoever recorded it and however.
  IF v_status = 'paid' AND COALESCE(NEW.advance_paid, 0) < NEW.total THEN
    NEW.advance_paid := NEW.total;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.orders_payment_amounts() FROM PUBLIC, anon, authenticated;

-- The one order the old rule is known to have written this way: collected what its gift card
-- paid, owing the delivery fee. Matched on its present amounts, so it changes nothing if the
-- store has put it right already.
UPDATE public.orders
   SET advance_paid = gift_card_paid,
       payment_status = 'partially_paid'
 WHERE id = '36d07358-ec5e-4062-9832-b62df4f0986b'
   AND lower(payment_status) = 'paid'
   AND total = 27.600
   AND advance_paid = 27.600
   AND gift_card_paid = 25.600;
