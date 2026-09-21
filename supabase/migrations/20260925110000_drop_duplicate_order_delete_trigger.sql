-- Drop duplicate BEFORE DELETE trigger on public.orders that caused orders_restore_stock_on_delete()
-- to execute twice per order deletion. Keep trg_orders_restore_stock_on_delete as the single trigger.

DROP TRIGGER IF EXISTS orders_restore_stock_on_delete_trg ON public.orders;

-- Safety guard: assert exactly one trigger on public.orders executes orders_restore_stock_on_delete()
DO $$
DECLARE
  v_cnt integer;
BEGIN
  SELECT count(*) INTO v_cnt
  FROM information_schema.triggers
  WHERE event_object_table = 'orders'
    AND trigger_schema = 'public'
    AND action_statement LIKE '%orders_restore_stock_on_delete%';

  IF v_cnt > 1 THEN
    RAISE EXCEPTION 'DUPLICATE_TRIGGER_STILL_EXISTS: found % triggers executing orders_restore_stock_on_delete() on orders', v_cnt;
  END IF;

  IF v_cnt = 0 THEN
    RAISE EXCEPTION 'NO_DELETE_RESTORE_TRIGGER_FOUND: expected 1 trigger executing orders_restore_stock_on_delete() on orders, found 0';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
