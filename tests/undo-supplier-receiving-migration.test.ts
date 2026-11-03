import { beforeAll, describe, expect, it, vi } from "vitest";
import ordersMigration from "../supabase/migrations/20261019100000_supplier_orders_receive_into_stock.sql?raw";
import paymentsMigration from "../supabase/migrations/20261019110000_supplier_payments.sql?raw";
import piecesMigration from "../supabase/migrations/20261020100000_customer_pieces_to_supplier.sql?raw";
import afterMigration from "../supabase/migrations/20261021100000_customer_pieces_cancel_fix_alteration.sql?raw";
import migration from "../supabase/migrations/20261113100000_undo_supplier_receiving.sql?raw";
import { BRAND, openSupplierOrdersDb } from "./helpers/supplier-orders-db";

// Undoing a supplier order's receiving (migration 20261113100000): the pieces leave the stock
// through the ledger, the cost goes back when nothing changed it, the order opens again and can be
// cancelled or deleted. Run in a real Postgres (PGlite) with the real ledger and reconciliation,
// as the store's staff in a browser session and as the server.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let ctx: Awaited<ReturnType<typeof openSupplierOrdersDb>>;

beforeAll(async () => {
  ctx = await openSupplierOrdersDb([
    ordersMigration,
    paymentsMigration,
    piecesMigration,
    afterMigration,
    migration,
  ]);
});

type Undone = {
  status: string;
  repeated: boolean;
  receipts?: number;
  pieces?: number;
  taken_out?: number;
  costs_kept?: number;
};

const undo = async (
  po: string,
  receipts: string[] | null = null,
  mode = "take_out",
  request = ctx.requestId(),
) =>
  (
    await ctx.db.query<{ undo_purchase_order_receipts: Undone }>(
      "SELECT public.undo_purchase_order_receipts($1, $2::uuid[], $3, $4)",
      [po, receipts, mode, request],
    )
  ).rows[0].undo_purchase_order_receipts;

const receiptsOf = async (po: string) =>
  (
    await ctx.db.query<{
      id: string;
      quantity: number;
      undone_at: string | null;
      undo_mode: string | null;
      undo_taken_out: number | null;
    }>(
      "SELECT id, quantity, undone_at, undo_mode, undo_taken_out FROM public.purchase_order_receipts WHERE po_id = $1 ORDER BY received_at, id",
      [po],
    )
  ).rows;

/** Takes pieces out of the store's stock, as a count or a sale would (a negative count adds). */
const takeOut = (variant: string, pieces: number, key: string) =>
  ctx.db.query(
    `SELECT public.apply_inventory_movement($1, $2, 'main', $3, 'correction', NULL, NULL, $4, NULL, 'counted')`,
    [BRAND, variant, -pieces, key],
  );

describe("undoing a supplier order's receiving", () => {
  it("takes the pieces out through the ledger, brings the cost back and opens the order", async () => {
    await ctx.asServer();
    const variant = await ctx.newVariant(ctx.abaya);
    // Two pieces already on the shelf, through the ledger as an opening stock is.
    await takeOut(variant, -2, "opening");
    await ctx.asStaff();
    const po = await ctx.newOrder([{ variant, quantity: 3, unit_cost: 20 }]);
    const [line] = await ctx.items(po.id);
    await ctx.receive(po.id, [[line.id, 3]]);
    await ctx.asServer();
    expect(await ctx.stock(variant)).toBe(5);
    expect(await ctx.cost(variant)).toBe(20);

    await ctx.asStaff();
    const result = await undo(po.id);
    expect(result).toMatchObject({ status: "ordered", receipts: 1, pieces: 3, taken_out: 3 });

    await ctx.asServer();
    expect(await ctx.stock(variant)).toBe(2);
    expect(await ctx.cost(variant)).toBe(0);
    expect((await ctx.items(po.id))[0].received_quantity).toBe(0);
    expect(await ctx.order(po.id)).toMatchObject({ status: "ordered", received_at: null });
    const moves = (
      await ctx.db.query<{ delta: number; reason: string; reference_type: string }>(
        "SELECT delta, reason, reference_type FROM public.inventory_movements WHERE reference_id = $1 ORDER BY created_at, delta DESC",
        [po.id],
      )
    ).rows;
    expect(moves).toEqual([
      { delta: 3, reason: "manual_adjust", reference_type: "purchase_order" },
      { delta: -3, reason: "correction", reference_type: "purchase_order" },
    ]);
    // The ledger is the authority: the nightly reconciliation leaves the stock as it is.
    await ctx.db.query("SELECT public.reconcile_inventory()");
    expect(await ctx.stock(variant)).toBe(2);
    // The receipt stays on record, marked undone.
    expect(await receiptsOf(po.id)).toEqual([
      expect.objectContaining({ quantity: 3, undo_mode: "take_out", undo_taken_out: 3 }),
    ]);
    expect((await receiptsOf(po.id))[0].undone_at).not.toBeNull();

    // Open again: staff can cancel it, and delete it.
    await ctx.asStaff();
    await ctx.db.query("UPDATE public.purchase_orders SET status = 'cancelled' WHERE id = $1", [
      po.id,
    ]);
    await ctx.db.query("DELETE FROM public.purchase_orders WHERE id = $1", [po.id]);
    await ctx.asServer();
    expect(
      (await ctx.db.query("SELECT 1 FROM public.purchase_orders WHERE id = $1", [po.id])).rows,
    ).toHaveLength(0);
  });

  it("undoes one receipt, the latest first, and the cost steps back through each", async () => {
    await ctx.asServer();
    const variant = await ctx.newVariant(ctx.abaya);
    await ctx.asStaff();
    const po = await ctx.newOrder([{ variant, quantity: 4, unit_cost: 10 }]);
    const [line] = await ctx.items(po.id);
    await ctx.receive(po.id, [[line.id, 2]]);
    await ctx.asServer();
    expect(await ctx.cost(variant)).toBe(10);
    // The line's price changes before the rest arrives: 20 a piece, averaged with the 2 at 10.
    await ctx.db.query("UPDATE public.purchase_order_items SET unit_cost = 20 WHERE id = $1", [
      line.id,
    ]);
    await ctx.asStaff();
    await ctx.receive(po.id, [[line.id, 2]]);
    await ctx.asServer();
    expect(await ctx.cost(variant)).toBe(15);
    const [, second] = await receiptsOf(po.id);

    await ctx.asStaff();
    expect(await undo(po.id, [second.id])).toMatchObject({
      status: "partially_received",
      pieces: 2,
    });
    await ctx.asServer();
    expect(await ctx.stock(variant)).toBe(2);
    expect(await ctx.cost(variant)).toBe(10);
    expect((await ctx.items(po.id))[0].received_quantity).toBe(2);
    // An undone receipt is not undone twice.
    await ctx.asStaff();
    await expect(undo(po.id, [second.id])).rejects.toThrow("RECEIPT_NOT_FOUND");
    expect(await undo(po.id)).toMatchObject({ status: "ordered", receipts: 1 });
    await ctx.asServer();
    expect(await ctx.cost(variant)).toBe(0);
    await ctx.asStaff();
    await expect(undo(po.id)).rejects.toThrow("NOTHING_TO_UNDO");
  });

  it("leaves a cost someone changed since, and says so", async () => {
    await ctx.asServer();
    const variant = await ctx.newVariant(ctx.abaya);
    await ctx.asStaff();
    const po = await ctx.newOrder([{ variant, quantity: 1, unit_cost: 12 }]);
    const [line] = await ctx.items(po.id);
    await ctx.receive(po.id, [[line.id, 1]]);
    await ctx.asServer();
    await ctx.db.query("UPDATE public.variant_costs SET cost_price = 14 WHERE variant_id = $1", [
      variant,
    ]);
    await ctx.asStaff();
    expect(await undo(po.id)).toMatchObject({ costs_kept: 1 });
    await ctx.asServer();
    expect(await ctx.cost(variant)).toBe(14);
  });

  it("asks what to do when the pieces already left the store", async () => {
    await ctx.asServer();
    const variant = await ctx.newVariant(ctx.abaya);
    await ctx.asStaff();
    const po = await ctx.newOrder([{ variant, quantity: 5, unit_cost: 18 }]);
    const [line] = await ctx.items(po.id);
    await ctx.receive(po.id, [[line.id, 5]]);
    await ctx.asServer();
    // Pura's PO-0001: four of the five counted out again.
    await takeOut(variant, 4, "count-1");
    expect(await ctx.stock(variant)).toBe(1);

    await ctx.asStaff();
    await expect(undo(po.id)).rejects.toThrow(/RECEIPT_PIECES_GONE:[0-9a-f-]+:1/);
    // Nothing moved: the refusal rolled the whole undo back.
    await ctx.asServer();
    expect(await ctx.stock(variant)).toBe(1);
    expect((await ctx.items(po.id))[0].received_quantity).toBe(5);

    await ctx.asStaff();
    expect(await undo(po.id, null, "what_is_left")).toMatchObject({
      status: "ordered",
      pieces: 5,
      taken_out: 1,
    });
    await ctx.asServer();
    expect(await ctx.stock(variant)).toBe(0);
    expect((await receiptsOf(po.id))[0]).toMatchObject({
      undo_mode: "what_is_left",
      undo_taken_out: 1,
    });
  });

  it("can leave the stock as it is and undo the record only", async () => {
    await ctx.asServer();
    const variant = await ctx.newVariant(ctx.abaya);
    await ctx.asStaff();
    const po = await ctx.newOrder([{ variant, quantity: 2, unit_cost: 9 }]);
    const [line] = await ctx.items(po.id);
    await ctx.receive(po.id, [[line.id, 2]]);
    await ctx.asStaff();
    expect(await undo(po.id, null, "leave")).toMatchObject({ status: "ordered", taken_out: 0 });
    await ctx.asServer();
    expect(await ctx.stock(variant)).toBe(2);
  });

  it("happens once for one press", async () => {
    await ctx.asServer();
    const variant = await ctx.newVariant(ctx.abaya);
    await ctx.asStaff();
    const po = await ctx.newOrder([{ variant, quantity: 2, unit_cost: 9 }]);
    const [line] = await ctx.items(po.id);
    await ctx.receive(po.id, [[line.id, 1]]);
    await ctx.receive(po.id, [[line.id, 1]]);
    const [first] = await receiptsOf(po.id);
    const press = ctx.requestId();
    expect(await undo(po.id, [first.id], "take_out", press)).toMatchObject({ repeated: false });
    expect(await undo(po.id, [first.id], "take_out", press)).toMatchObject({ repeated: true });
    await ctx.asServer();
    expect(await ctx.stock(variant)).toBe(1);
  });

  it("does not undo a customer's piece", async () => {
    await ctx.asServer();
    const { id: orderId } = await ctx.one<{ id: string }>(
      "INSERT INTO public.orders (brand_id, fulfillment_status) VALUES ($1, 'NEEDS_PACKING') RETURNING id",
      [BRAND],
    );
    const orderLine = await ctx.one<{ id: string }>(
      `INSERT INTO public.order_items (order_id, brand_id, product_id, variant_id, quantity, unit_cost, description, location)
       VALUES ($1, $2, $3, $4, 1, 15, 'Black abaya · custom', 'custom') RETURNING id`,
      [orderId, BRAND, ctx.abaya, ctx.small],
    );
    await ctx.asStaff("manage_orders,view_financials,manage_inventory");
    const po = (
      await ctx.db.query<{ send_order_to_supplier: string }>(
        "SELECT public.send_order_to_supplier($1, $2, NULL, $3::jsonb, '2026-11-10')",
        [orderId, ctx.tailor, JSON.stringify([{ order_item_id: orderLine.id, unit_cost: 18 }])],
      )
    ).rows[0].send_order_to_supplier;
    const [line] = await ctx.items(po);
    await ctx.receive(po, [[line.id, 1]]);
    await expect(undo(po)).rejects.toThrow("RECEIPT_IS_A_CUSTOMER_PIECE");
  });

  it("is for staff who manage the stock and see the costs, of that store", async () => {
    await ctx.asServer();
    const variant = await ctx.newVariant(ctx.abaya);
    await ctx.asStaff();
    const po = await ctx.newOrder([{ variant, quantity: 1, unit_cost: 9 }]);
    const [line] = await ctx.items(po.id);
    await ctx.receive(po.id, [[line.id, 1]]);
    for (const permissions of ["view_financials", "manage_inventory"]) {
      await ctx.asStaff(permissions);
      await expect(undo(po.id)).rejects.toThrow("NOT_AUTHORIZED");
    }
    await ctx.asStaff("manage_inventory,view_financials", "00000000-0000-4000-8000-0000000000b2");
    await expect(undo(po.id)).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asStaff();
    await expect(undo(po.id, null, "burn")).rejects.toThrow("INVALID_UNDO_MODE");
    // The receipts are the database's: staff read them and write nothing.
    await expect(
      ctx.db.query("UPDATE public.purchase_order_receipts SET undone_at = now() WHERE po_id = $1", [
        po.id,
      ]),
    ).rejects.toThrow(/permission denied/);
  });
});
