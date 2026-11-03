import { beforeAll, describe, expect, it, vi } from "vitest";
import ordersMigration from "../supabase/migrations/20261019100000_supplier_orders_receive_into_stock.sql?raw";
import paymentsMigration from "../supabase/migrations/20261019110000_supplier_payments.sql?raw";
import piecesMigration from "../supabase/migrations/20261020100000_customer_pieces_to_supplier.sql?raw";
import afterMigration from "../supabase/migrations/20261021100000_customer_pieces_cancel_fix_alteration.sql?raw";
import vendorLanguage from "../supabase/migrations/20261115100000_vendor_language.sql?raw";
import migration from "../supabase/migrations/20261116100000_send_to_workshop_without_price.sql?raw";
import { BRAND, OTHER, openSupplierOrdersDb } from "./helpers/supplier-orders-db";

// One "Send to workshop" for every member of order staff (migration 20261116100000, step 2 of
// docs/workshop-flow-plan.md), run in a real Postgres with the real sending and receiving
// functions: a member who cannot see costs puts the piece on the supplier's order with its price
// still to add, finance staff add it (before or after it arrives), and the two readers give the
// suppliers and the pieces with no money.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let ctx: Awaited<ReturnType<typeof openSupplierOrdersDb>>;
const ORDER_STAFF = "manage_orders";
const FINANCE = "manage_orders,view_financials";

// What a receipt needs to know of undone receipts (migration 20261113100000), as live.
const RECEIPTS_UNDO = `ALTER TABLE public.purchase_order_receipts ADD COLUMN IF NOT EXISTS undone_at timestamptz;`;
const VENDOR_PHONE = `ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS phone text;`;

async function customerOrder(brand = BRAND) {
  await ctx.asServer();
  const { id } = await ctx.one<{ id: string }>(
    "INSERT INTO public.orders (brand_id) VALUES ($1) RETURNING id",
    [brand],
  );
  const line = await ctx.one<{ id: string }>(
    `INSERT INTO public.order_items (order_id, brand_id, product_id, variant_id, quantity, description, location)
     VALUES ($1, $2, $3, $4, 1, 'Black abaya · custom', 'custom') RETURNING id`,
    [id, brand, ctx.abaya, ctx.small],
  );
  return { id, line: line.id };
}

const send = async (
  order: string,
  pieces: Array<Record<string, unknown>>,
  po: string | null = null,
) =>
  (
    await ctx.db.query<{ send_order_to_supplier: string }>(
      "SELECT public.send_order_to_supplier($1, $2, $3, $4::jsonb, '2026-11-12')",
      [order, ctx.tailor, po, JSON.stringify(pieces)],
    )
  ).rows[0].send_order_to_supplier;

const lineOf = (po: string) =>
  ctx.one<{ id: string; unit_cost: string; price_pending: boolean; purpose: string }>(
    "SELECT id, unit_cost, price_pending, purpose FROM public.purchase_order_items WHERE po_id = $1 ORDER BY sort_order LIMIT 1",
    [po],
  );
const lineCost = async (orderItem: string) =>
  Number(
    (
      await ctx.one<{ unit_cost: string | null }>(
        "SELECT unit_cost FROM public.order_items WHERE id = $1",
        [orderItem],
      )
    ).unit_cost ?? 0,
  );

beforeAll(async () => {
  ctx = await openSupplierOrdersDb([
    ordersMigration,
    paymentsMigration,
    piecesMigration,
    afterMigration,
    RECEIPTS_UNDO,
    VENDOR_PHONE,
    vendorLanguage,
    migration,
  ]);
  await ctx.asServer();
  await ctx.db.query(
    "UPDATE public.vendors SET phone = '+97333334444', preferred_language = 'en' WHERE id = $1",
    [ctx.tailor],
  );
});

describe("sending a piece without seeing costs", () => {
  it("puts it on the supplier's order at no price, marked to add, whatever cost was sent", async () => {
    const order = await customerOrder();
    await ctx.asStaff(ORDER_STAFF);
    const po = await send(order.id, [{ order_item_id: order.line, unit_cost: 18 }]);
    await ctx.asServer();
    const line = await lineOf(po);
    expect(Number(line.unit_cost)).toBe(0);
    expect(line.price_pending).toBe(true);
    expect(
      (
        await ctx.one<{ fulfillment_status: string }>(
          "SELECT fulfillment_status FROM public.orders WHERE id = $1",
          [order.id],
        )
      ).fulfillment_status,
    ).toBe("SENT_TO_TAILOR");
  });

  it("needs no cost from them, and still refuses staff who do not handle orders", async () => {
    const order = await customerOrder();
    await ctx.asStaff(ORDER_STAFF);
    await expect(send(order.id, [{ order_item_id: order.line }])).resolves.toBeTruthy();
    const other = await customerOrder();
    await ctx.asStaff("manage_inventory");
    await expect(send(other.id, [{ order_item_id: other.line, unit_cost: 5 }])).rejects.toThrow(
      "NOT_AUTHORIZED",
    );
  });

  it("keeps finance staff to today's rule: their price is the piece's, and a missing one is refused", async () => {
    const order = await customerOrder();
    await ctx.asStaff(FINANCE);
    await expect(send(order.id, [{ order_item_id: order.line }])).rejects.toThrow(
      "INVALID_PIECE_COST",
    );
    const po = await send(order.id, [{ order_item_id: order.line, unit_cost: 18 }]);
    await ctx.asServer();
    const line = await lineOf(po);
    expect(Number(line.unit_cost)).toBe(18);
    expect(line.price_pending).toBe(false);
  });
});

describe("adding the price", () => {
  it("is finance staff's: their price clears the mark, nobody else's does", async () => {
    const order = await customerOrder();
    await ctx.asStaff(ORDER_STAFF);
    const po = await send(order.id, [{ order_item_id: order.line }]);
    await ctx.asServer();
    const { id } = await lineOf(po);

    // A browser cannot mark a price to add, nor clear one without the permission.
    await ctx.asStaff("manage_inventory");
    await ctx.db.query(
      "UPDATE public.purchase_order_items SET price_pending = false WHERE id = $1",
      [id],
    );
    await ctx.asServer();
    expect((await lineOf(po)).price_pending).toBe(true);

    await ctx.asStaff(FINANCE);
    await ctx.db.query("UPDATE public.purchase_order_items SET unit_cost = 21 WHERE id = $1", [id]);
    await ctx.asServer();
    const line = await lineOf(po);
    expect(Number(line.unit_cost)).toBe(21);
    expect(line.price_pending).toBe(false);
  });

  it("after the piece arrived, gives its order line the cost receiving would have", async () => {
    const order = await customerOrder();
    await ctx.asStaff(ORDER_STAFF);
    const po = await send(order.id, [{ order_item_id: order.line }]);
    await ctx.asStaff(FINANCE);
    const { id } = await lineOf(po);
    await ctx.receive(po, [[id, 1]]);
    expect(await lineCost(order.line)).toBe(0);

    // The price of an arrived piece can still be added (and only that).
    await ctx.db.query("UPDATE public.purchase_order_items SET unit_cost = 24 WHERE id = $1", [id]);
    expect(await lineCost(order.line)).toBe(24);
    await expect(
      ctx.db.query("UPDATE public.purchase_order_items SET unit_cost = 30 WHERE id = $1", [id]),
    ).rejects.toThrow("PURCHASE_ORDER_LINE_ALREADY_RECEIVED");
  });

  it("adds an alteration's price to what the piece already cost, once", async () => {
    const order = await customerOrder();
    await ctx.asStaff(FINANCE);
    const made = await send(order.id, [{ order_item_id: order.line, unit_cost: 20 }]);
    await ctx.receive(made, [[(await lineOf(made)).id, 1]]);
    expect(await lineCost(order.line)).toBe(20);

    await ctx.asStaff(ORDER_STAFF);
    const altered = await send(order.id, [
      { order_item_id: order.line, purpose: "alteration", note: "Shorten the sleeves" },
    ]);
    await ctx.asStaff(FINANCE);
    const { id } = await lineOf(altered);
    await ctx.receive(altered, [[id, 1]]);
    expect(await lineCost(order.line)).toBe(20);
    await ctx.db.query("UPDATE public.purchase_order_items SET unit_cost = 4 WHERE id = $1", [id]);
    expect(await lineCost(order.line)).toBe(24);
  });
});

describe("what staff without finance access read", () => {
  it("the suppliers with their language, phone and open orders, and no amount", async () => {
    await ctx.asStaff(ORDER_STAFF);
    const { workshop_suppliers: suppliers } = await ctx.one<{
      workshop_suppliers: Array<Record<string, unknown>>;
    }>("SELECT public.workshop_suppliers($1)", [BRAND]);
    expect(suppliers).toHaveLength(1);
    expect(suppliers[0]).toMatchObject({
      id: ctx.tailor,
      name: "Umm Ali tailoring",
      phone: "+97333334444",
      preferred_language: "en",
    });
    const open = suppliers[0].open_orders as Array<Record<string, unknown>>;
    expect(open.length).toBeGreaterThan(0);
    expect(Object.keys(open[0]).sort()).toEqual(["expected_at", "id", "po_number"]);
    expect(JSON.stringify(suppliers)).not.toMatch(/total|paid|cost|amount/);
  });

  it("where an order's pieces are, with no amount", async () => {
    const order = await customerOrder();
    await ctx.asStaff(ORDER_STAFF);
    const po = await send(order.id, [{ order_item_id: order.line }]);
    const { order_workshop_pieces: pieces } = await ctx.one<{
      order_workshop_pieces: Array<Record<string, unknown>>;
    }>("SELECT public.order_workshop_pieces($1)", [order.id]);
    expect(pieces).toEqual([
      expect.objectContaining({
        order_item_id: order.line,
        po_id: po,
        purpose: "make",
        price_pending: true,
        expected_at: "2026-11-12",
        vendor_name: "Umm Ali tailoring",
        preferred_language: "en",
      }),
    ]);
    expect(JSON.stringify(pieces)).not.toMatch(/unit_cost|total|paid|amount/);
  });

  it("nothing of another store, and nothing for staff who handle neither orders nor money", async () => {
    await ctx.asStaff(ORDER_STAFF);
    await expect(ctx.db.query("SELECT public.workshop_suppliers($1)", [OTHER])).rejects.toThrow(
      "NOT_AUTHORIZED",
    );
    const order = await customerOrder();
    await ctx.asStaff("manage_inventory");
    await expect(ctx.db.query("SELECT public.workshop_suppliers($1)", [BRAND])).rejects.toThrow(
      "NOT_AUTHORIZED",
    );
    await expect(
      ctx.db.query("SELECT public.order_workshop_pieces($1)", [order.id]),
    ).rejects.toThrow("NOT_AUTHORIZED");
  });
});
