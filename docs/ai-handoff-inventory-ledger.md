# Handoff Prompt — Boutq OS: Inventory integrity remediation (ledger + order inventory state machine)

Copy everything below the line into a new AI-assistant session opened at the repository root.

---

You are a senior backend/database engineer working in the repository **`SayedMajeedx/bhpura-d219813a`** (Boutq OS — TanStack Start + React 19 + Supabase/Postgres 17 + Cloudflare Workers, multi-tenant by `brand_id`). Work directly in this checkout on a new branch `fix/inventory-ledger` off `main`.

Load these repo skills before starting: `.agents/rules/AGENTS.md`, `.agents/skills/handoff-plan-execution/SKILL.md`, `.agents/skills/order-inventory-logic/SKILL.md`, `.agents/skills/migration-hygiene/SKILL.md`, `.agents/skills/multi-tenant-security/SKILL.md`, `.agents/skills/refactor-safety/SKILL.md`, `.agents/skills/test-quality-gate/SKILL.md`, `.agents/skills/physical-goods-lifecycle/SKILL.md`, `.agents/skills/financial-data-consistency/SKILL.md`. Also read `docs/database-recovery.md` in full — its safety rules are binding.

## Context — the confirmed incident (read this first, do not re-investigate)

A merchant (brand `Qoffee`, id `c5281142-20a8-433a-983e-075d1a6a54fc`) created three variants with 100 units each, placed two storefront test orders, then **bulk-deleted** the orders from the admin orders list. Stock went to Ethiopian **101**, Colombian **102**, Coffee Collection Box **102** instead of 100/100/100.

**Root cause (verified against the live database on 2026-09-21):** the production `orders` table has **two `BEFORE DELETE` triggers that both execute `public.orders_restore_stock_on_delete()`**:

- `orders_restore_stock_on_delete_trg` — created by `supabase/migrations/20260705215628_1287d645-c64c-42a5-ad21-1f3fd91db03e.sql`
- `trg_orders_restore_stock_on_delete` — created by `supabase/migrations/20260706103909_609e0a74-c780-4100-8801-893d5e98a4e6.sql`, which dropped only its *own* new name and never dropped the old one.

Both triggers see the same `OLD` row with `stock_deducted = true`, so every deleted order has restored its stock **twice** since 2026-07-06. The bulk delete path is `deleteOrdersWithPrivateReceipts` in `src/lib/benefit-receipt.functions.ts` (one `DELETE … WHERE id IN (…)`), which is why all three variants share `updated_at = 2026-09-18T16:05:48Z`.

### Other defects confirmed in the same audit (all must be fixed by this work)

1. **Returns restock RPC is broken.** Live `public.rpc_inspect_and_restock_return_item` (defined in `20260829102831_returns_and_exchanges_suite.sql`, last replaced in `20260910143000_fix_return_restock_branch_fallback_and_loyalty_cap.sql`) reads/writes `product_variants.stock_quantity` and `products.stock_quantity`. Those columns **do not exist** — the real columns are `product_variants.stock`, `stock_main`, `stock_incubator` (`stock` is a cached sum maintained by trigger `trg_product_variants_sync_stock`). Sellable returns therefore error and never restock. `public.rpc_validate_and_restore_abandoned_cart` (`20260904120000_complete_abandoned_cart_recovery.sql`) has the same `v_variant.stock_quantity` bug.
2. **Second double-restore path.** Two `BEFORE UPDATE` triggers on `orders` — `release_card_stock_on_terminal_payment` (fires on `UPDATE OF payment_status, payment_method`) and `trg_orders_restore_stock_on_cancel` (fires on `UPDATE OF status`) — both restore from `OLD.stock_snapshot` when `OLD.stock_deducted`. One `UPDATE` that sets a card order to `payment_status='failed'` **and** `status='cancelled'` restores twice. The admin order Save button (`src/routes/_authenticated/admin.b.$slug.orders.$id.tsx`, `orderPayload` around line 1518) always sends both columns.
3. **Reservation silently released on pending orders.** `public.sync_order_stock(uuid)` (latest file version `20260903213000_allow_custom_tailoring_order_location.sql`) only deducts for `status IN ('confirmed','paid','shipped','completed')`. Storefront checkout (`place_storefront_order_internal_20260710`, latest in `20260917100000_products_made_to_order_flag.sql`) reserves eagerly at `status='pending'`, but any admin Save on that still-pending order calls `sync_order_stock` and releases the reservation while the order remains live. Admin-created orders at `pending` never reserve at all.
4. **`/api/orders/status` never touches stock** (`src/routes/api.orders.status.ts`). Quick actions and batch actions in `src/routes/_authenticated/admin.b.$slug.orders.index.tsx` can move an order into or out of a deducting status without any stock effect.
5. **Snapshot key collision.** Checkout builds `orders.stock_snapshot` with `v_snapshot || jsonb_build_object(variant_id || '|main', qty)` per cart line; the same variant on two lines overwrites the key, so cancellation under-restores. It also inserts `order_items.location='main'` even for the portion taken from `stock_incubator`.
6. **Admin stock edits are absolute client-side writes** — `src/routes/_authenticated/admin.b.$slug.inventory.tsx` (`update()` near line 6795) does `UPDATE product_variants SET stock_main = N` from the browser: last-writer-wins against concurrent orders, no reason, no actor, no audit trail. Other direct writers: `src/lib/universal-importer.ts`, `src/lib/generate-variants.functions.ts`, `src/lib/instagram-ai-importer.ts`, `src/components/incubators/BatchIncubatorTransferModal.tsx`, incubator RPCs in `20260821193000_incubator_consignment_management.sql` / `20260825185500_support_unallocated_incubator_stock_transfer.sql` / `20260825203000_incubator_sales_reporting_packaging.sql`.
7. **No ledger.** `public.inventory_movement_logs` exists (returns suite) but is only written by the returns flow. Stock cannot be reconstructed, audited, or reconciled.
8. **Non-transactional item edits.** Admin Save deletes all `order_items` for the order and re-inserts them from the browser (`orders.$id.tsx` ~line 1673) before calling `sync_order_stock`. A failure between the delete and the insert leaves an order with no items but `stock_deducted = true`.
9. **Migration drift.** `npx supabase migration list` shows roughly 20 local-only and 20 remote-only versions (remote changes were applied via the dashboard). **Migration files do not describe production.** Verify every function/trigger you touch with `npx supabase db query --linked` (read-only) before writing the replacement. `docs/database-recovery.md` forbids `db push` while drift is unexplained.
10. **Hard deletes destroy evidence.** `activity_logs.order_id` cascades, so the incident's own audit trail vanished.

### Environment facts

- The Supabase CLI is already linked to production project `ikciahnuqhemvnyfvbyp`. `npx supabase db query --linked "<sql>"` works for read-only introspection. **Never run a write against `--linked` unless the owner has explicitly approved that exact statement in chat.**
- `.env` contains `SUPABASE_SERVICE_ROLE_KEY`; node scripts using `@supabase/supabase-js` must be run from the repo root so the package resolves.
- Quality gates: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test` (vitest), `npm run db:migrations:check`. There are pre-existing vitest failures on `main` — record the baseline before you start; any *new* failure is yours.
- Migrations live in `supabase/migrations/YYYYMMDDHHMMSS_<safe-name>.sql`. Never edit or rename an applied migration; always add a new forward migration. Every migration must be idempotent (`IF EXISTS` / `IF NOT EXISTS` / `CREATE OR REPLACE`) and end with `NOTIFY pgrst, 'reload schema';`.
- Functions that touch stock are `SECURITY DEFINER` with `SET search_path = public`; keep that pattern and keep the existing `REVOKE … FROM PUBLIC, anon` / `GRANT … TO authenticated, service_role` grants.

## Non-negotiable design principles

1. **Exactly one code path may change `product_variants.stock_main` / `stock_incubator`.** After this work, no trigger, RPC, server function, or browser code writes those columns except `public.apply_inventory_movement(...)`.
2. **Every stock change is an append-only ledger row with an idempotency key.** Re-firing a trigger, replaying a webhook, retrying a request, or running a repair twice must be a provable no-op.
3. **Order inventory is an explicit state machine**, not a boolean plus a JSON snapshot. Desired state is derived from `(status, payment_status, payment_method)` by a policy that lives in one place.
4. **The invariant `stock_main = SUM(ledger.delta WHERE location='main')` (and likewise for `incubator`) holds for every variant at all times**, and a scheduled job proves it.
5. Stock can never go negative through application code; a `CHECK` constraint enforces it and oversell fails loudly with `INSUFFICIENT_STOCK:<variant_id>` (keep this exact error prefix — the UI matches on it).
6. Multi-tenant: every new table has `brand_id`, RLS enabled, and policies mirroring `orders`. Never let a brand see or move another brand's stock.

## Mission — in this order, one PR per numbered block

### 0. Hotfix PR (`fix/inventory-hotfix`) — small, ship first

1. New migration `supabase/migrations/<timestamp>_drop_duplicate_order_delete_trigger.sql`:
   ```sql
   DROP TRIGGER IF EXISTS orders_restore_stock_on_delete_trg ON public.orders;
   -- keep trg_orders_restore_stock_on_delete as the single delete-restore trigger
   ```
   plus a `DO $$` block that `RAISE EXCEPTION`s if, after the drop, more than one trigger on `public.orders` executes `orders_restore_stock_on_delete()`.
2. New migration fixing the two broken RPCs: `CREATE OR REPLACE` `rpc_inspect_and_restock_return_item` and `rpc_validate_and_restore_abandoned_cart` with the **live** bodies (fetch them with `pg_get_functiondef` — do not trust the migration files) replacing `stock_quantity` with `stock_main` on `product_variants` (restock into `stock_main`), removing the `products.stock_quantity` update entirely, and computing availability as `COALESCE(stock_main,0)+COALESCE(stock_incubator,0)`. Keep every other line identical.
3. Add to `scripts/database/production-feature-probes.sql` a probe that lists `(function, count(*))` for triggers on `orders`, `order_items`, `product_variants` and flags any function bound more than once.
4. Data repair for Qoffee — prepare, do **not** execute without approval:
   ```sql
   UPDATE public.product_variants SET stock_main = 100 WHERE id IN (
     '8b7dd36d-a06c-41a8-bcc6-280256f39f79', -- Ethiopian (101 -> 100)
     '867bc6c1-a188-45b1-95ff-50738287ce31', -- Coffee Collection Box (102 -> 100)
     'da2ee9b2-aa7e-4167-a52c-6b0fe7e077e7'  -- Colombian (102 -> 100)
   ) AND brand_id = 'c5281142-20a8-433a-983e-075d1a6a54fc';
   ```
   Put it in `scripts/database/repair-qoffee-stock-2026-09.sql` with a header explaining why, and show the owner the current values immediately before they approve.
5. Write `docs/inventory-incident-2026-09.md`: timeline, root cause, blast radius statement ("every order deleted between 2026-07-06 and the hotfix restored its stock twice; this cannot be reconstructed because no ledger existed — merchants who deleted orders should recount"), and the fix.
6. Apply the two hotfix migrations to production **only** via the process in `docs/database-recovery.md` (backup verified → staging → probes → production → probes), with the owner's explicit approval for the production step. If drift blocks `db push`, apply with `npx supabase db query --linked --file <migration>` after approval and then `npx supabase migration repair --status applied <version>`; document exactly what you did.

### 1. Ledger PR (`fix/inventory-ledger`) — the real fix

#### 1a. Schema (one migration, additive)

- `public.inventory_movements`:
  `id uuid pk`, `brand_id uuid not null → brands`, `variant_id uuid not null → product_variants`, `location text not null check (location in ('main','incubator'))`, `delta integer not null check (delta <> 0)`, `balance_after integer not null check (balance_after >= 0)`, `reason text not null check (reason in ('order_reserve','order_release','order_commit','manual_adjust','return_restock','transfer','import','correction','reconciliation'))`, `reference_type text`, `reference_id uuid`, `idempotency_key text not null`, `actor_id uuid`, `note text`, `created_at timestamptz default now()`.
  Unique index on `(brand_id, idempotency_key)`. Indexes on `(variant_id, created_at desc)` and `(reference_type, reference_id)`. RLS: brand members `SELECT` via `can_access_brand(brand_id)`; **no** `INSERT/UPDATE/DELETE` for `authenticated` — only `service_role` and the `SECURITY DEFINER` function write it.
- `public.order_inventory_allocations`: `order_id → orders on delete cascade`, `variant_id`, `location`, `quantity int > 0`, `brand_id`, primary key `(order_id, variant_id, location)`. This replaces `orders.stock_snapshot`.
- `ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS inventory_state text NOT NULL DEFAULT 'none' CHECK (inventory_state IN ('none','reserved','committed','released'))`. Keep `stock_deducted` / `stock_snapshot` for now (read-only, backfilled, dropped in block 4).
- `public.inventory_reconciliation_runs`: `id, brand_id nullable, started_at, finished_at, variants_checked, drift_count, details jsonb`.
- Backfill: for every variant, insert one `inventory_movements` row with `reason='reconciliation'`, `idempotency_key='baseline:'||variant_id||':'||location`, `delta = current stock`, `balance_after = current stock` (skip zero). For every order with `stock_deducted = true`, insert `order_inventory_allocations` from `stock_snapshot` (parse `'<uuid>|<location>'` keys; legacy keys without `|` mean `main`) and set `inventory_state='reserved'` (or `'committed'` when `status IN ('completed','delivered')`).
- `ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_stock_nonnegative CHECK (stock_main >= 0 AND stock_incubator >= 0) NOT VALID;` then `VALIDATE CONSTRAINT` in the same migration only if `SELECT count(*) FROM product_variants WHERE stock_main < 0 OR stock_incubator < 0` is zero; otherwise leave `NOT VALID`, log the offending rows into the incident doc, and validate in a follow-up.

#### 1b. The single write path

`public.apply_inventory_movement(p_brand_id uuid, p_variant_id uuid, p_location text, p_delta int, p_reason text, p_reference_type text, p_reference_id uuid, p_idempotency_key text, p_actor_id uuid, p_note text) RETURNS public.inventory_movements`:

- `SECURITY DEFINER`, `SET search_path = public`.
- Take `pg_advisory_xact_lock(hashtext(p_variant_id::text))`, then `SELECT … FOR UPDATE` the variant and assert `brand_id = p_brand_id`.
- If a row with `(p_brand_id, p_idempotency_key)` already exists, **return it unchanged** (idempotent no-op).
- Compute new balance; if `< 0` raise `INSUFFICIENT_STOCK:<variant_id>`.
- `UPDATE product_variants SET stock_main|stock_incubator = new balance` (this is the only place that statement exists), insert the ledger row, return it.
- Grant `EXECUTE` to `authenticated, service_role`; the function itself checks `can_access_brand(p_brand_id)` unless `auth.uid()` is null (service role / trigger context).
- Column-level lockdown after all callers are migrated (end of this PR): `REVOKE UPDATE (stock, stock_main, stock_incubator) ON public.product_variants FROM authenticated;` and a `BEFORE UPDATE OF stock_main, stock_incubator` trigger that raises unless a session GUC `inventory.apply_via_ledger` is set to `'1'` by `apply_inventory_movement` (`set_config(..., true)` local to the transaction). This makes bypass impossible even for `SECURITY DEFINER` functions written later.

Convenience wrapper for admin edits: `public.rpc_adjust_variant_stock(p_variant_id uuid, p_location text, p_mode text /* 'set' | 'delta' */, p_value int, p_reason text /* manual_adjust|correction|import|transfer */, p_note text)` — resolves brand from the variant, checks `can_access_brand`, converts `'set'` into a delta under the same advisory lock, calls `apply_inventory_movement` with `idempotency_key = 'adjust:'||gen_random_uuid()`.

#### 1c. Order inventory state machine

- `public.order_inventory_desired_state(p_status text, p_payment_status text, p_payment_method text) RETURNS text` — pure, `IMMUTABLE`, the **only** place the policy lives:
  - `released` when `status IN ('cancelled','canceled','refunded','voided','failed')` **or** `payment_status IN ('failed','declined')` (any case).
  - `committed` when `status IN ('completed','delivered','picked_up')`.
  - `none` when `status IN ('draft','archived_historical')` or status is null/blank.
  - otherwise `reserved` (this includes `pending`, `pending_payment`, `pending_verification`, `confirmed`, `paid`, `packing`, `sent_to_tailor`, `received_from_tailor`, `shipped`). **Reservations are never dropped for an unpaid card order except through the verified Tap failure path** — that path sets `payment_status` to `failed/declined`, which this function maps to `released`.
- `public.order_inventory_transition(p_order_id uuid)`:
  - Locks the order `FOR UPDATE`, computes desired state, reads current allocations.
  - Builds the wanted allocation from `order_items` **grouped by `(variant_id, location)`** (duplicate lines summed), excluding `location='custom'` and null `variant_id`. For a line with `location='main'` whose main stock is insufficient, split main/incubator exactly as checkout does today and record the real split as two allocation rows.
  - Applies the diff via `apply_inventory_movement` with keys `order_reserve:<order_id>:<variant_id>:<location>:<n>` where `n` is a per-order monotonic counter stored on `orders.inventory_revision` (add the column). Releases use `order_release:…`, commits use `order_commit:…` (commit is a state change only — no stock delta — unless you decide committed stock should leave a separate "sold" location; do not do that in this PR).
  - Sets `orders.inventory_state`, `stock_deducted` (kept in sync for the transition period), and clears `stock_snapshot`.
- **One trigger** `trg_orders_inventory` — `AFTER INSERT OR UPDATE OF status, payment_status, payment_method ON public.orders FOR EACH ROW` → calls `order_inventory_transition(NEW.id)` — and **one** `BEFORE DELETE` trigger that releases (idempotently, via the ledger) then allows the delete. Also `AFTER INSERT OR UPDATE OR DELETE ON public.order_items` → transition the parent order (statement-level with a transition table is fine; make it re-entrant so `replace_order_items` does not thrash).
- Drop: `trg_orders_restore_stock_on_cancel`, `release_card_stock_on_terminal_payment` (keep its **cancellation and activity-log side effects** by moving them into a small `BEFORE UPDATE OF payment_status` trigger that only sets `status`/`fulfillment_status` and logs — no stock code), `trg_orders_restore_stock_on_delete`, `orders_restore_stock_on_delete_trg`, and the stock body of `sync_order_stock`. Redefine `public.sync_order_stock(uuid)` as a thin authorised wrapper around `order_inventory_transition` so existing callers keep working, then remove the client calls in block 2.
- Rewrite the stock section of `place_storefront_order_internal_20260710` (fetch the **live** definition first) to insert `order_items` and let the trigger reserve; keep the pre-check so the customer gets `INSUFFICIENT_STOCK` before an order row is created. Remove its direct `UPDATE product_variants` statements and snapshot building.
- Migrate the incubator transfer RPCs (`transfer_to_incubator`, `return_from_incubator`, `record_incubator_sale`, `reverse_incubator_sale` — confirm live names) to two ledger movements each (`transfer` out of one location, into the other) sharing a common `reference_id`.
- `public.replace_order_items(p_order_id uuid, p_items jsonb)` — server-side, one transaction, authorised via `can_access_brand`, deletes + inserts items, then the trigger reconciles. It replaces the browser delete/insert in `orders.$id.tsx`.

#### 1d. Reconciliation job

- `public.reconcile_inventory(p_brand_id uuid DEFAULT NULL) RETURNS public.inventory_reconciliation_runs` — for each variant compares `stock_main/stock_incubator` to the ledger sum; on drift inserts a `reason='reconciliation'` movement to correct the cached column (never the ledger), records the run, and returns it.
- Schedule nightly via `pg_cron` if enabled on the project (check `SELECT * FROM cron.job`), otherwise via the existing Worker cron in `wrangler.json` calling a service-role server function. Drift > 0 must surface in the admin (block 3) and in logs.

#### 1e. Tests for this PR (mandatory, block merge without them)

Use a **local** Supabase (`npx supabase start`; never the linked project) and vitest with the service-role client. Add `tests/inventory-ledger.db.test.ts` covering, with a fresh brand per test:

1. Storefront checkout reserves; cancel → exactly N; delete → exactly N; cancel then delete → exactly N.
2. Card order: `payment_status='failed'` and `status='cancelled'` in **one** UPDATE → exactly N; Tap webhook replay (same update twice) → exactly N.
3. Pending storefront order edited by admin (notes only) → stock stays reserved.
4. Admin-created order at `pending` → reserved; moved to `cancelled` via `/api/orders/status` payload shape → released.
5. Same variant on two cart lines → reserved qty = sum; cancel → exactly N.
6. Reserve 3 from a variant with `main=2, incubator=5` → allocations `(main,2),(incubator,1)`; cancel restores both locations.
7. `replace_order_items` increasing/decreasing/removing a line → allocation diff applied, no double counting.
8. Two concurrent checkouts for the last unit → exactly one succeeds with `INSUFFICIENT_STOCK` on the other; stock ends at 0, never −1.
9. Return restock of a sellable item → `+qty` on `stock_main` with a `return_restock` ledger row; inspecting the same item twice → `ITEM_ALREADY_RESTOCKED`, no second movement.
10. `apply_inventory_movement` called twice with the same idempotency key → one ledger row, one stock change.
11. After every scenario above, assert the invariant: for every variant, `stock_main = SUM(delta) FILTER (location='main')` and `stock_incubator` likewise.
12. Direct `UPDATE product_variants SET stock_main = 5` as `authenticated` → permission error; as `service_role` outside the ledger → raised by the guard trigger.

Also update `tests/card-stock-policy-migration.test.ts` (it asserts behaviour of the old trigger — read it before you break it).

### 2. Application PR (`fix/inventory-app-callers`)

- `src/routes/_authenticated/admin.b.$slug.orders.$id.tsx`: remove the `sync_order_stock` RPC calls, the manual delete/insert of `order_items` (call `replace_order_items`), the client-side "stock precheck" (let the DB raise `INSUFFICIENT_STOCK` and keep the existing toast `t("orderDetail.insufficientStock")`), and the hand-written "Stock decreased/restored" activity-log strings (the ledger is the record; render it instead).
- `src/routes/api.public.payments.tap-redirect.ts`, `src/routes/api.public.webhooks.tap.ts`, `src/lib/tap-payment-reconciliation.server.ts`: remove `sync_order_stock` calls (the trigger handles it). Keep every payment verification step unchanged.
- `src/routes/_authenticated/admin.b.$slug.inventory.tsx`: all stock edits go through `rpc_adjust_variant_stock` with a required reason (default `manual_adjust`) and optional note; the inline editors must send **deltas or explicit "set to N" with the value the user saw**, never a blind absolute write. Same for `BatchIncubatorTransferModal.tsx`, `universal-importer.ts` (reason `import`), `generate-variants.functions.ts` and `instagram-ai-importer.ts` (initial stock on **insert** is allowed to set `stock_main` directly only if the insert trigger records a `baseline`/`import` ledger row — implement that trigger so inserts are covered too).
- Order deletion: change the admin list's delete/bulk-delete to **void** (`status='voided'`, `fulfillment_status='CANCELLED'`) instead of hard delete for any order that has ledger movements or an invoice number; keep hard delete only for `super_admin` and route it through a server function that logs to `activity_logs` with `order_id` **after** changing `activity_logs.order_id` to `ON DELETE SET NULL` (migration in block 1 or here).
- `src/lib/returns.functions.ts` / `src/lib/abandoned-carts.functions.ts`: no change expected beyond the RPC fixes; verify the UI paths end to end.
- Mobile app (`apps/boutq-os-mobile/src/app/order/[id].tsx` updates `orders` directly) — no stock code there; just confirm status changes still trigger correctly.
- Update `src/integrations/supabase/types.ts` (regenerate with `npx supabase gen types typescript --linked > …` after the migrations are applied to staging, or hand-add the new tables/functions consistently).

### 3. Admin visibility PR (`feat/inventory-history-ui`)

- Variant "Stock history" drawer in the inventory page: ledger rows with reason, delta, balance after, actor, note, and a link to the order/return. Arabic + English, RTL-safe, per `.agents/skills/rtl-arabic-consistency/SKILL.md`.
- Order page: show `inventory_state` and the allocation rows; a "Release reservation" action for super admins only (creates an `order_release` movement with a note).
- Dashboard banner when the last `inventory_reconciliation_runs.drift_count > 0`.
- Low-stock threshold per brand (`business_settings.low_stock_threshold`, default 5) used by `enqueue_mobile_low_stock_push` and the dashboard, replacing any hard-coded number.

### 4. Cleanup PR (`chore/inventory-legacy-removal`) — only after 1–3 are in production for a week with zero drift

- Drop `orders.stock_snapshot`, `orders.stock_deducted`, the `sync_order_stock` wrapper, and any dead trigger functions.
- Repair the migration ledger per `docs/database-recovery.md`: for every remote-only version, capture its effect into a local migration file (or document that its schema is already represented) and for every local-only version confirm it is applied; finish with `npx supabase migration list` showing zero drift. Add a CI job (see `docs/ci-cd.md`) that runs `npx supabase migration list --linked` and fails on drift.
- Extend `scripts/database/production-feature-probes.sql` with: exactly one trigger per stock function; `CHECK` constraint valid; ledger invariant holds for all variants.

## Rules for how you work

- **Read the live definition before replacing any function or trigger** (`npx supabase db query --linked "SELECT pg_get_functiondef('public.<name>'::regproc)"`). Preserve every non-stock side effect (activity logs, notifications, invoice numbers, contact snapshots).
- Never run `db reset`, `db push`, or any write against the linked project without explicit owner approval in chat for that specific action. Local Supabase is where you test.
- One migration per concern, idempotent, timestamped after `20260925100000`, ending with `NOTIFY pgrst, 'reload schema';`. Run `npm run db:migrations:check` after every migration you add.
- Keep the multi-tenant guarantees: every new function checks `can_access_brand` unless running as service role; every new table has RLS with the same shape as `orders`.
- Do not widen scope into packaging materials (`packaging_materials.stock_quantity`, `trg_orders_deduct_packaging_materials`) in this work — note it in the incident doc as a follow-up candidate for the same ledger pattern.
- Before each PR: `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run db:migrations:check` — all green except the recorded pre-existing baseline. Each PR description lists exactly which live functions/triggers were replaced and pastes the before/after trigger inventory from the probe.
- Commit messages end with `Co-Authored-By:` for yourself as configured in the session; PR descriptions end with the generated-with line the session provides.

## Definition of done

- Placing, cancelling, failing, editing, voiding, or deleting an order — through the storefront, the admin detail page, the admin list quick/batch actions, `/api/orders/status`, the Tap redirect/webhook/cron, or the mobile app — leaves stock **exactly** where it should be, and the test suite in block 1e proves it, including concurrency and double-firing.
- Returns restock and abandoned-cart restore work end to end.
- `SELECT` on `inventory_movements` explains every unit of stock for every variant; the nightly reconciliation reports zero drift.
- No client code and no non-ledger SQL can change `stock_main`/`stock_incubator`.
- The Qoffee variants read 100/100/100 (after owner-approved repair), and the incident doc exists.
- `npx supabase migration list` shows zero drift (block 4).
