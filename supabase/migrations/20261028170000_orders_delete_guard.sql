-- A paid or handed-over order is never deleted by a person: the database holds it.
--
-- The orders review of 2026-10-28 made the app refuse to delete an order that took money or was
-- handed over (`orderDeletable`, held by `deleteOrderWithPrivateReceipt` and
-- `deleteOrdersWithPrivateReceipts`): such an order is a record the store's books, its invoice
-- numbers, its customer's points and its reports stand on, so it is cancelled or refunded, never
-- erased. The re-check found that rule only in the app: the table's one policy ("office brand
-- orders access", `can_access_brand`) lets any member of a store's staff delete an order straight
-- through the API, so a person with the browser's developer tools could erase a paid order.
--
-- This puts the same rule on the table, as the project does for every rule that must survive a
-- rewrite of a function. It holds for a person acting through the API (the roles `authenticated`
-- and `anon`); the server's own work (the service role, a SECURITY DEFINER function, a cascade
-- from removing a whole store) runs as another role and is not held back.
--
-- An order may be deleted when it was not handed over (stage or status completed, delivered,
-- picked up or returned), not refunded, has no money recorded (`advance_paid` is 0) and its
-- payment is unpaid, pending, failed or cancelled: the twin of `orderDeletable`
-- (src/lib/order-deletion.ts), run against it over every combination by
-- tests/orders-delete-guard-migration.test.ts.
--
-- Also: the `anon` role needed no DELETE privilege on orders (the policy gave it nothing); it is
-- withdrawn.

CREATE OR REPLACE FUNCTION public.orders_guard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text := lower(COALESCE(OLD.status, ''));
  v_stage text := lower(COALESCE(OLD.fulfillment_status, ''));
  v_payment text := lower(COALESCE(OLD.payment_status, ''));
BEGIN
  -- Only a person acting through the API is held to it.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN OLD;
  END IF;

  IF v_stage IN ('completed', 'delivered', 'picked_up', 'returned')
     OR v_status IN ('completed', 'delivered', 'picked_up', 'returned')
     OR v_status = 'refunded'
     OR v_payment = 'refunded'
     OR COALESCE(OLD.advance_paid, 0) > 0
     OR v_payment NOT IN ('', 'unpaid', 'pending', 'failed', 'cancelled')
  THEN
    RAISE EXCEPTION 'ORDER_NOT_DELETABLE: a paid or handed-over order stays on record; cancel or refund it'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.orders_guard_delete() FROM PUBLIC, anon, authenticated;

-- Named to run before the stock-restoring delete trigger.
DROP TRIGGER IF EXISTS trg_orders_a_guard_delete ON public.orders;
CREATE TRIGGER trg_orders_a_guard_delete
  BEFORE DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_guard_delete();

REVOKE DELETE ON public.orders FROM anon;
