# Incident Post-Mortem: Stock Double-Restores on Order Deletion

**Incident Reference**: INC-2026-09-INVENTORY  
**Date Confirmed**: 2026-09-21  
**Severity**: High (Inventory Data Corruption on Order Deletions)  
**Status**: Mitigated via Hotfix PR; Structural Solution via Ledger Architecture  

---

## 1. Executive Summary

On 2026-09-18, a merchant operating brand **Qoffee** (`c5281142-20a8-433a-983e-075d1a6a54fc`) initialized three coffee variants with 100 units each. The merchant conducted two storefront test orders and subsequently bulk-deleted both orders from the Boutq OS admin interface. Rather than returning to the initial inventory level of 100 units per variant, stock levels inflated to:
- Ethiopian (`8b7dd36d-a06c-41a8-bcc6-280256f39f79`): **101** units
- Coffee Collection Box (`867bc6c1-a188-45b1-95ff-50738287ce31`): **102** units
- Colombian (`da2ee9b2-aa7e-4167-a52c-6b0fe7e077e7`): **102** units

Investigation of the live database confirmed that duplicate `BEFORE DELETE` triggers existed on the `public.orders` table, causing every hard deletion of an order to invoke `public.orders_restore_stock_on_delete()` twice.

---

## 2. Root Cause Analysis

On 2026-07-05, migration `20260705215628_1287d645-c64c-42a5-ad21-1f3fd91db03e.sql` established the trigger:
```sql
CREATE TRIGGER orders_restore_stock_on_delete_trg
BEFORE DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_restore_stock_on_delete();
```

On 2026-07-06, migration `20260706103909_609e0a74-c780-4100-8801-893d5e98a4e6.sql` renamed the trigger standard to `trg_orders_restore_stock_on_delete`:
```sql
DROP TRIGGER IF EXISTS trg_orders_restore_stock_on_delete ON public.orders;
CREATE TRIGGER trg_orders_restore_stock_on_delete
BEFORE DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_restore_stock_on_delete();
```
Because the second migration dropped only its *new* trigger name (`trg_orders_restore_stock_on_delete`) and omitted dropping the old name (`orders_restore_stock_on_delete_trg`), both triggers remained registered and active in Postgres.

When an order was deleted:
1. Postgres executed `orders_restore_stock_on_delete_trg` BEFORE DELETE.
2. The trigger inspected `OLD.stock_deducted` (which was `true`), read `OLD.stock_snapshot` (or fallback `order_items`), and added order quantities back into `product_variants.stock_main`.
3. Postgres then immediately executed `trg_orders_restore_stock_on_delete` BEFORE DELETE on the identical `OLD` row.
4. Because the trigger function was operating on the `OLD` row in a `BEFORE DELETE` context, `OLD.stock_deducted` remained `true`. The second trigger added the quantities back into `product_variants.stock_main` a second time.

---

## 3. Blast Radius Statement

> [!WARNING]
> Every order deleted between **2026-07-06** and the deployment of this hotfix restored its stock **twice**.
> This historical over-restoration cannot be automatically reconstructed because no transactional inventory ledger existed during this period.
> Merchants who deleted orders during this window are advised to perform a physical inventory recount.

---

## 4. Secondary Defects Discovered During Audit

1. **Returns Restock Failure**: `public.rpc_inspect_and_restock_return_item` referenced non-existent columns `product_variants.stock_quantity` and `products.stock_quantity`, causing sellable returns to fail with an exception during restock.
2. **Abandoned Cart RPC Stock Reference**: `public.rpc_validate_and_restore_abandoned_cart` also referenced `product_variants.stock_quantity`.
3. **Double-Restore on Terminal Payment Failure**: When an order was updated with `payment_status = 'failed'` and `status = 'cancelled'` concurrently, both `release_card_stock_on_terminal_payment` and `trg_orders_restore_stock_on_cancel` fired on the same `BEFORE UPDATE` event.
4. **Pending Reservation Invalidation**: `public.sync_order_stock` released reservations when editing pending orders because it only deducted stock for `confirmed, paid, shipped, completed`.
5. **Direct Client Writes**: Web clients wrote absolute stock numbers directly to `product_variants.stock_main` without locking, idempotency, or auditing.
6. **Activity Log Loss**: `activity_logs.order_id` cascaded on hard deletes, wiping out audit trails for deleted orders.

---

## 5. Remediation Plan

### Immediate Hotfix (Phase 0)
1. **Drop Duplicate Trigger**: Execute `DROP TRIGGER IF EXISTS orders_restore_stock_on_delete_trg ON public.orders;` with a verification guard ensuring exactly one delete-restore trigger remains.
2. **Fix Return and Cart RPCs**: Replace non-existent column references with `stock_main` and `stock_incubator` in `rpc_inspect_and_restock_return_item` and `rpc_validate_and_restore_abandoned_cart`.
3. **Data Repair for Qoffee**: Reset variant stock levels for Ethiopian, Coffee Collection Box, and Colombian to 100 units under explicit owner sign-off.
4. **Trigger Duplicate Probe**: Added continuous detection to `scripts/database/production-feature-probes.sql` to identify duplicate trigger bindings.

### Structural Solution (Phase 1 — Ledger Architecture)
1. **Single Write Path**: Restrict all stock mutations exclusively to `public.apply_inventory_movement()` guarded by transactional session GUC and advisory locks.
2. **Immutable Ledger**: Log every stock change to `public.inventory_movements` with idempotency keys and reasons.
3. **Order State Machine**: Introduce `public.order_inventory_desired_state` and `order_inventory_allocations` replacing fragile boolean flags and JSON snapshots.
4. **Non-Negative Stock Invariant**: Enforce `CHECK (stock_main >= 0 AND stock_incubator >= 0)`.
5. **Nightly Automated Reconciliation**: Continuous validation job comparing cached stock to ledger sums.

---

## 6. Implementation & Rollout Status

All 5 remediation blocks have been completed:

| Phase | Branch | Key Deliverables | Status |
| :--- | :--- | :--- | :--- |
| **0. Hotfix** | `fix/inventory-hotfix` | Dropped duplicate `orders_restore_stock_on_delete_trg`; fixed column names in `rpc_inspect_and_restock_return_item` and `rpc_validate_and_restore_abandoned_cart`; created Qoffee stock repair script and duplicate trigger probe. | **Completed & Verified** |
| **1. Ledger** | `fix/inventory-ledger` | Created `inventory_movements`, `order_inventory_allocations`, `inventory_reconciliation_runs`; implemented `apply_inventory_movement` single write path, `order_inventory_transition` state machine, `rpc_adjust_variant_stock`, and 12-suite unit tests in `tests/inventory-ledger.test.ts`. | **Completed & Verified** |
| **2. App Callers** | `fix/inventory-app-callers` | Converted `admin.b.$slug.orders.$id.tsx` to `replace_order_items`; converted inventory page stock edits to `rpc_adjust_variant_stock`; removed redundant `sync_order_stock` callers from Tap webhook and redirect handlers. | **Completed & Verified** |
| **3. Admin Visibility** | `feat/inventory-history-ui` | Built `InventoryHistorySheet` drawer with live ledger pagination, balance history, badges, user attribution, and order links across mobile cards, desktop rows, and header actions. | **Completed & Verified** |
| **4. Cleanup** | `chore/inventory-legacy-removal` | Dropped `orders.stock_snapshot`, `orders.stock_deducted`, deprecated `sync_order_stock` RPC wrapper, and dead trigger functions via migration `20260927100000_cleanup_legacy_inventory_artifacts.sql`; extended `production-feature-probes.sql` with trigger exclusivity, CHECK constraint validation, and ledger invariant verification; added automated CI drift check. | **Completed & Verified** |

---

## 7. Migration Ledger Reconciliation & CI Drift Detection

To ensure absolute fidelity between local migration scripts and the linked production database (`ikciahnuqhemvnyfvbyp`):

1. **Continuous CI Verification**:
   The workflow in `.github/workflows/ci.yml` runs `node scripts/database/check-migration-drift.mjs` on every commit, verifying zero discrepancy between committed SQL files and the remote schema ledger.
2. **Ledger Repair Protocol**:
   Per `docs/database-recovery.md`, any discrepancies between local and remote migration tables should be resolved using `npx supabase migration repair` under explicit owner review:
   - For remote-only versions verified to be captured in migrations: mark as applied or backfill local SQL.
   - For unapplied local migrations: execute sequentially via approved deployment pipeline.

---

## 8. Out-of-Scope Follow-up: Packaging Materials Inventory

During the audit, `packaging_materials.stock_quantity` and its corresponding trigger `trg_orders_deduct_packaging_materials` were identified as using legacy direct-decrement logic. To maintain strict scope discipline and avoid regressions in bill-of-materials (BOM) logic during the critical order stock remediation, packaging materials were kept untouched.

**Recommendation**: A subsequent milestone should migrate `packaging_materials` to the append-only inventory ledger with dedicated `packaging_movements` tracking.

