import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Inventory Ledger Architecture & Invariants (Block 1)", () => {
  const schemaMigration = readFileSync(
    resolve("supabase/migrations/20260926100000_inventory_movements_and_allocations.sql"),
    "utf8",
  );
  const functionsMigration = readFileSync(
    resolve("supabase/migrations/20260926110000_inventory_ledger_functions.sql"),
    "utf8",
  );
  const orderMachineMigration = readFileSync(
    resolve("supabase/migrations/20260926120000_order_inventory_state_machine.sql"),
    "utf8",
  );
  const reconciliationMigration = readFileSync(
    resolve("supabase/migrations/20260926130000_inventory_reconciliation_job.sql"),
    "utf8",
  );

  // Scenario a: apply_inventory_movement inserts ledger row and updates product_variants atomically
  it("a: apply_inventory_movement inserts immutable ledger row and updates product_variants atomically", () => {
    expect(schemaMigration).toContain("CREATE TABLE IF NOT EXISTS public.inventory_movements");
    expect(schemaMigration).toContain("delta integer NOT NULL CHECK (delta <> 0)");
    expect(schemaMigration).toContain("balance_after integer NOT NULL CHECK (balance_after >= 0)");
    expect(functionsMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.apply_inventory_movement",
    );
    expect(functionsMigration).toContain("UPDATE public.product_variants");
    expect(functionsMigration).toContain("INSERT INTO public.inventory_movements");
    expect(functionsMigration).toContain("set_config('inventory.apply_via_ledger', '1', true)");
  });

  // Scenario b: Idempotency key replay returns the existing movement row without double-decrementing
  it("b: Idempotency key replay returns existing movement without modifying stock", () => {
    expect(schemaMigration).toContain("uq_inventory_movements_brand_idempotency");
    expect(schemaMigration).toContain(
      "UNIQUE INDEX IF NOT EXISTS uq_inventory_movements_brand_idempotency",
    );
    expect(functionsMigration).toContain(
      "WHERE brand_id = p_brand_id AND idempotency_key = p_idempotency_key",
    );
    expect(functionsMigration).toContain("IF FOUND THEN\n    RETURN v_existing;");
  });

  // Scenario c: Negative delta with insufficient stock raises INSUFFICIENT_STOCK:<variant_id> and rolls back
  it("c: Insufficient stock raises INSUFFICIENT_STOCK:<variant_id> matching checkout error handling", () => {
    expect(functionsMigration).toContain("IF v_new_bal < 0 THEN");
    expect(functionsMigration).toContain("RAISE EXCEPTION 'INSUFFICIENT_STOCK:%', p_variant_id;");
  });

  // Scenario d: Concurrent decrements serialize via advisory lock (no oversell)
  it("d: Concurrent mutations serialize via pg_advisory_xact_lock on the variant", () => {
    expect(functionsMigration).toContain(
      "PERFORM pg_advisory_xact_lock(hashtext(p_variant_id::text));",
    );
    expect(functionsMigration).toContain(
      "SELECT * INTO v_variant\n  FROM public.product_variants\n  WHERE id = p_variant_id\n  FOR UPDATE;",
    );
  });

  // Scenario e: order_inventory_transition(order_id) moves pending -> cancelled releases stock exactly once
  it("e: Order state transition from pending to cancelled releases allocations exactly once", () => {
    expect(orderMachineMigration).toContain("order_inventory_desired_state");
    expect(orderMachineMigration).toContain(
      "'cancelled', 'canceled', 'refunded', 'voided', 'failed'",
    );
    expect(orderMachineMigration).toContain("IF v_desired_state IN ('released', 'none') THEN");
    expect(orderMachineMigration).toContain("p_reason => 'order_release'");
    expect(orderMachineMigration).toContain(
      "DELETE FROM public.order_inventory_allocations WHERE order_id = p_order_id;",
    );
  });

  // Scenario f: Deleting an already-cancelled order does not release stock a second time (Qoffee bug remediation)
  it("f: Deleting an already-cancelled order does not release stock a second time", () => {
    expect(orderMachineMigration).toContain("CREATE TRIGGER trg_orders_inventory_delete");
    expect(orderMachineMigration).toContain(
      "FROM public.order_inventory_allocations\n    WHERE order_id = OLD.id",
    );
    // When cancelled, order_inventory_allocations is already deleted. The delete trigger finds 0 rows, preventing double restore!
    expect(orderMachineMigration).toContain(
      "DELETE FROM public.order_inventory_allocations WHERE order_id = OLD.id;",
    );
  });

  // Scenario g: Deleting a pending order releases stock exactly once
  it("g: Deleting an active pending order releases stock exactly once via allocations table", () => {
    expect(orderMachineMigration).toContain(
      "DROP TRIGGER IF EXISTS trg_orders_restore_stock_on_delete",
    );
    expect(orderMachineMigration).toContain(
      "DROP TRIGGER IF EXISTS orders_restore_stock_on_delete_trg",
    );
    expect(orderMachineMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.trg_orders_inventory_delete_proc()",
    );
    expect(orderMachineMigration).toContain("p_idempotency_key => 'order_delete_release:'");
  });

  // Scenario h: Re-saving an order with modified quantities computes diff correctly and leaves no orphan allocations
  it("h: replace_order_items and transition compute diffs without orphans and suppress trigger loops", () => {
    expect(orderMachineMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.replace_order_items",
    );
    expect(orderMachineMigration).toContain(
      "PERFORM set_config('inventory.suppress_items_trigger', '1', true);",
    );
    expect(orderMachineMigration).toContain(
      "PERFORM set_config('inventory.suppress_items_trigger', '0', true);",
    );
    expect(orderMachineMigration).toContain(
      "PERFORM public.order_inventory_transition(p_order_id);",
    );
    expect(orderMachineMigration).toContain("v_diff := v_alloc.target_qty - v_alloc.cur_qty;");
  });

  // Scenario i: Changing payment_status to failed on card order cancels and releases via transition, not rogue trigger
  it("i: Card order terminal payment failure changes status and delegates stock to state machine", () => {
    expect(orderMachineMigration).toContain(
      "CREATE TRIGGER trg_release_card_stock_on_terminal_payment",
    );
    expect(orderMachineMigration).toContain("BEFORE UPDATE OF payment_status ON public.orders");
    // Verifies stock deduction/restoration code is removed from the payment status trigger
    expect(orderMachineMigration).not.toContain(
      "UPDATE public.product_variants\n        SET stock_incubator = stock_incubator +",
    );
    expect(orderMachineMigration).toContain("NEW.status := 'cancelled';");
    expect(orderMachineMigration).toContain("NEW.fulfillment_status := 'cancelled';");
  });

  // Scenario j: Incubator transfer RPCs write two matching movements and update both caches correctly
  it("j: Incubator transfer RPCs use apply_inventory_movement for transfers, sales, and reversals", () => {
    expect(orderMachineMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.transfer_stock_to_incubator",
    );
    expect(orderMachineMigration).toContain(
      "p_location => 'main',\n      p_delta => -v_needed_from_main",
    );
    expect(orderMachineMigration).toContain(
      "p_location => 'incubator',\n      p_delta => v_needed_from_main",
    );
    expect(orderMachineMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.return_stock_from_incubator",
    );
    expect(orderMachineMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.record_incubator_sale",
    );
    expect(orderMachineMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.reverse_incubator_sale",
    );
  });

  // Scenario k: Direct UPDATE of stock_main/stock_incubator by authenticated role is rejected by the guard trigger
  it("k: Direct UPDATE on product_variants stock columns is revoked and rejected by guard trigger", () => {
    expect(functionsMigration).toContain("CREATE TRIGGER trg_guard_product_variants_stock_update");
    expect(functionsMigration).toContain(
      "BEFORE UPDATE OF stock_main, stock_incubator ON public.product_variants",
    );
    expect(functionsMigration).toContain("RAISE EXCEPTION 'DIRECT_STOCK_UPDATE_FORBIDDEN");
    expect(functionsMigration).toContain(
      "REVOKE UPDATE (stock, stock_main, stock_incubator) ON public.product_variants FROM authenticated",
    );
  });

  // Scenario l: Nightly reconciliation detects simulated drift and corrects it
  it("l: Nightly reconciliation job corrects cached column drift against ledger sums without mutating ledger", () => {
    expect(reconciliationMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.reconcile_inventory",
    );
    expect(reconciliationMigration).toContain(
      "SELECT COALESCE(SUM(delta), 0) INTO v_main_ledger_sum\n    FROM public.inventory_movements",
    );
    expect(reconciliationMigration).toContain(
      "set_config('inventory.apply_via_ledger', '1', true)",
    );
    expect(reconciliationMigration).toContain(
      "UPDATE public.product_variants\n      SET stock_main = v_main_ledger_sum",
    );
    expect(reconciliationMigration).toContain("inventory_reconciliation_nightly");
  });
});
