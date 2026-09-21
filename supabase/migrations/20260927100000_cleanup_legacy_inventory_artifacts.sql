-- Migration: 20260927100000_cleanup_legacy_inventory_artifacts.sql
-- Description: Drop deprecated orders.stock_snapshot, orders.stock_deducted columns,
-- sync_order_stock wrapper, and dead legacy trigger functions.
-- All stock mutations and state transitions are now exclusively driven by the
-- append-only inventory ledger and order_inventory_transition state machine.

-- 1. Drop dead legacy trigger functions if still present
DROP FUNCTION IF EXISTS public.orders_restore_stock_on_delete() CASCADE;
DROP FUNCTION IF EXISTS public.restore_order_stock_on_cancel() CASCADE;

-- 2. Drop deprecated sync_order_stock wrapper
DROP FUNCTION IF EXISTS public.sync_order_stock(uuid) CASCADE;

-- 3. Drop legacy columns on orders table
ALTER TABLE public.orders DROP COLUMN IF EXISTS stock_snapshot;
ALTER TABLE public.orders DROP COLUMN IF EXISTS stock_deducted;

-- 4. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
