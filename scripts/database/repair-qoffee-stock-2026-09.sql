-- ==============================================================================
-- DATA REPAIR: Brand Qoffee Stock Restoration
-- ==============================================================================
-- Brand ID: c5281142-20a8-433a-983e-075d1a6a54fc
-- Date: 2026-09-21
--
-- Incident Background:
-- Merchant created 3 variants with 100 units each (stock_main = 100).
-- Placed 2 storefront test orders.
-- Bulk-deleted both test orders via admin order list on 2026-09-18 16:05:48 UTC.
--
-- Due to duplicate BEFORE DELETE triggers on public.orders:
--   1) orders_restore_stock_on_delete_trg
--   2) trg_orders_restore_stock_on_delete
-- both triggers executed public.orders_restore_stock_on_delete() upon deletion,
-- restoring stock twice and inflating inventory counts beyond the initial 100 units:
--   - Ethiopian ('8b7dd36d-a06c-41a8-bcc6-280256f39f79'): 101 units (should be 100)
--   - Coffee Collection Box ('867bc6c1-a188-45b1-95ff-50738287ce31'): 102 units (should be 100)
--   - Colombian ('da2ee9b2-aa7e-4167-a52c-6b0fe7e077e7'): 102 units (should be 100)
--
-- SAFETY NOTICE:
-- Do NOT execute this script against production without explicit owner approval.
-- Run the read-only check below before and after executing the repair.
-- ==============================================================================

-- 1. Read-only verification before execution:
-- SELECT id, sku, stock_main, stock_incubator, stock, updated_at
-- FROM public.product_variants
-- WHERE brand_id = 'c5281142-20a8-433a-983e-075d1a6a54fc'
--   AND id IN (
--     '8b7dd36d-a06c-41a8-bcc6-280256f39f79',
--     '867bc6c1-a188-45b1-95ff-50738287ce31',
--     'da2ee9b2-aa7e-4167-a52c-6b0fe7e077e7'
--   );

-- 2. Data repair statement (requires explicit owner approval):
UPDATE public.product_variants
SET stock_main = 100
WHERE id IN (
  '8b7dd36d-a06c-41a8-bcc6-280256f39f79', -- Ethiopian (101 -> 100)
  '867bc6c1-a188-45b1-95ff-50738287ce31', -- Coffee Collection Box (102 -> 100)
  'da2ee9b2-aa7e-4167-a52c-6b0fe7e077e7'  -- Colombian (102 -> 100)
)
AND brand_id = 'c5281142-20a8-433a-983e-075d1a6a54fc';
