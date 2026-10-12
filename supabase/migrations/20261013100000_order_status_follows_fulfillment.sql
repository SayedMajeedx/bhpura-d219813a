-- An order's status follows its fulfillment to the end.
--
-- An order carries two fields: `status` (what the database reads: the stock engine, the booking
-- that follows its order, the reports) and `fulfillment_status` (the stage the screens move an
-- order through). Completing an order from the orders list wrote `fulfillment_status = COMPLETED`
-- and nothing else, so an order that had been "packing" stayed `status = 'packing'` for good:
--   - the stock engine kept it "reserved" and never "committed";
--   - an appointment's booking never became "completed";
--   - the app's cost-of-goods and sales-rate reads, which listed the statuses that count, left it
--     out (fixed in the app as well: src/lib/data/orders/sold-orders.ts).
-- Four of Pura's completed, paid orders are in that state.
--
-- 1. A trigger: when the fulfillment reaches its end (completed, delivered, picked up), the
--    status is "completed", whoever wrote the row. An order that was undone (cancelled,
--    refunded, voided, failed, returned), a draft and an archived order keep their status.
-- 2. The orders already in that state are repaired quietly: no email, no notification and no
--    activity line for something that happened weeks ago; the stock engine is then asked to
--    settle each one, and a booking that followed such an order is completed.

CREATE OR REPLACE FUNCTION public.orders_status_follows_fulfillment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF upper(COALESCE(NEW.fulfillment_status, '')) IN ('COMPLETED', 'DELIVERED', 'PICKED_UP')
     AND lower(COALESCE(NEW.status, '')) NOT IN (
       'completed', 'delivered', 'picked_up',
       'cancelled', 'canceled', 'refunded', 'voided', 'failed', 'returned',
       'draft', 'archived_historical'
     ) THEN
    NEW.status := 'completed';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.orders_status_follows_fulfillment() IS
  'An order whose fulfillment reached its end is completed: the stock engine, bookings and reports read status.';

DROP TRIGGER IF EXISTS trg_orders_status_follows_fulfillment ON public.orders;
CREATE TRIGGER trg_orders_status_follows_fulfillment
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_status_follows_fulfillment();

-- ── Repair ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_ids uuid[];
  v_id uuid;
BEGIN
  SELECT array_agg(o.id) INTO v_ids
  FROM public.orders o
  WHERE upper(COALESCE(o.fulfillment_status, '')) IN ('COMPLETED', 'DELIVERED', 'PICKED_UP')
    AND lower(COALESCE(o.status, '')) NOT IN (
      'completed', 'delivered', 'picked_up',
      'cancelled', 'canceled', 'refunded', 'voided', 'failed', 'returned',
      'draft', 'archived_historical'
    );

  IF v_ids IS NULL THEN
    RETURN;
  END IF;

  -- Quietly: the order's triggers would write to the customer and to staff about a completion
  -- that is weeks old. What they do that still matters is done by hand: the stock engine
  -- settles each order's state, and a booking that followed the order is completed. (Checked
  -- on the live data before writing this: the four orders hold lines with no stocked variant,
  -- so the engine moves no stock for them.)
  ALTER TABLE public.orders DISABLE TRIGGER USER;
  UPDATE public.orders SET status = 'completed' WHERE id = ANY (v_ids);
  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM public.order_inventory_transition(v_id);
  END LOOP;
  ALTER TABLE public.orders ENABLE TRIGGER USER;

  UPDATE public.bookings
  SET status = 'completed', updated_at = now()
  WHERE order_id = ANY (v_ids) AND status = 'confirmed';
END;
$$;
