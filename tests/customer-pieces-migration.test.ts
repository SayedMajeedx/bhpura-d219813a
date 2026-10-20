import { beforeAll, describe, expect, it, vi } from "vitest";
import ordersMigration from "../supabase/migrations/20261019100000_supplier_orders_receive_into_stock.sql?raw";
import paymentsMigration from "../supabase/migrations/20261019110000_supplier_payments.sql?raw";
import migration from "../supabase/migrations/20261020100000_customer_pieces_to_supplier.sql?raw";
import { BRAND, OTHER, openSupplierOrdersDb } from "./helpers/supplier-orders-db";

// A customer's made-to-order piece sent to the tailor on a supplier order (migration
// 20261020100000): sent from the customer's order in one step, at the tailor's price this time,
// never stock when it arrives, and the customer's order follows it. Run in a real Postgres with
// the real ledger, as staff in a browser session and as the server.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let ctx: Awaited<ReturnType<typeof openSupplierOrdersDb>>;
const STAFF_ORDERS = "manage_orders,view_financials";

/** A customer's order with one made-to-order line per size given, and its line ids. */
async function customerOrder(sizes: string[], quantity = 1) {
  const { id } = await ctx.one<{ id: string }>(
    "INSERT INTO public.orders (brand_id) VALUES ($1) RETURNING id",
    [BRAND],
  );
  const lines: string[] = [];
  for (const variant of sizes) {
    const line = await ctx.one<{ id: string }>(
      `INSERT INTO public.order_items (order_id, brand_id, product_id, variant_id, quantity, unit_cost, description, location)
       VALUES ($1, $2, $3, $4, $5, 15, 'Black abaya · custom', 'custom') RETURNING id`,
      [id, BRAND, ctx.abaya, variant, quantity],
    );
    lines.push(line.id);
  }
  return { id, lines };
}

const send = (
  order: string,
  lines: Array<[string, number]>,
  po: string | null = null,
  vendor = ctx.tailor,
) =>
  ctx.db.query<{ send_order_to_supplier: string }>(
    "SELECT public.send_order_to_supplier($1, $2, $3, $4::jsonb, '2026-10-28')",
    [
      order,
      vendor,
      po,
      JSON.stringify(lines.map(([order_item_id, unit_cost]) => ({ order_item_id, unit_cost }))),
    ],
  );
const stage = async (order: string) =>
  (
    await ctx.one<{ fulfillment_status: string; status: string }>(
      "SELECT fulfillment_status, status FROM public.orders WHERE id = $1",
      [order],
    )
  ).fulfillment_status;
const lineCost = async (line: string) =>
  Number(
    (
      await ctx.one<{ unit_cost: string }>(
        "SELECT unit_cost FROM public.order_items WHERE id = $1",
        [line],
      )
    ).unit_cost,
  );
const poLines = async (po: string) =>
  (
    await ctx.db.query<{
      id: string;
      order_item_id: string | null;
      product_id: string | null;
      quantity: number;
      unit_cost: string;
    }>(
      "SELECT id, order_item_id, product_id, quantity, unit_cost FROM public.purchase_order_items WHERE po_id = $1 ORDER BY sort_order",
      [po],
    )
  ).rows;

beforeAll(async () => {
  ctx = await openSupplierOrdersDb([ordersMigration, paymentsMigration, migration]);
});

describe("sending a customer's pieces to the tailor", () => {
  it("makes the supplier order from the customer's order, at the tailor's price, in one step", async () => {
    await ctx.asServer();
    const order = await customerOrder([ctx.small, ctx.medium]);
    await ctx.asStaff(STAFF_ORDERS);
    const { rows } = await send(order.id, [
      [order.lines[0], 18],
      [order.lines[1], 22.5],
    ]);
    const po = rows[0].send_order_to_supplier;
    await ctx.asServer();
    const lines = await poLines(po);
    expect(lines.map((l) => [l.order_item_id, l.product_id, Number(l.unit_cost)])).toEqual([
      [order.lines[0], ctx.abaya, 18],
      [order.lines[1], ctx.abaya, 22.5],
    ]);
    expect(await ctx.order(po)).toMatchObject({ status: "ordered", total_amount: "40.500" });
    expect(await stage(order.id)).toBe("SENT_TO_TAILOR");
  });

  it("adds to an open order of the same tailor, and never sends a piece twice", async () => {
    await ctx.asServer();
    const first = await customerOrder([ctx.small]);
    const second = await customerOrder([ctx.large]);
    await ctx.asStaff(STAFF_ORDERS);
    const po = (await send(first.id, [[first.lines[0], 18]])).rows[0].send_order_to_supplier;
    const same = (await send(second.id, [[second.lines[0], 20]], po)).rows[0]
      .send_order_to_supplier;
    expect(same).toBe(po);
    // Sent again on the same order: nothing changes. On another order: refused.
    await send(first.id, [[first.lines[0], 18]], po);
    await expect(send(first.id, [[first.lines[0], 18]])).rejects.toThrow(
      "ORDER_LINE_ALREADY_WITH_SUPPLIER",
    );
    await ctx.asServer();
    expect(await poLines(po)).toHaveLength(2);
  });

  it("is for staff who handle orders and see the finances, with the store's own supplier", async () => {
    await ctx.asServer();
    const order = await customerOrder([ctx.small]);
    const { id: theirs } = await ctx.one<{ id: string }>(
      "INSERT INTO public.vendors (brand_id, name) VALUES ($1, 'Elsewhere') RETURNING id",
      [OTHER],
    );
    for (const permissions of ["manage_orders", "view_financials"]) {
      await ctx.asStaff(permissions);
      await expect(send(order.id, [[order.lines[0], 10]])).rejects.toThrow("NOT_AUTHORIZED");
    }
    await ctx.asStaff(STAFF_ORDERS);
    await expect(send(order.id, [[order.lines[0], 10]], null, theirs)).rejects.toThrow(
      "SUPPLIER_NOT_FOUND",
    );
    await expect(send(order.id, [[order.lines[0], -1]])).rejects.toThrow("INVALID_PIECE_COST");
    await expect(send(order.id, [])).rejects.toThrow("NOTHING_TO_SEND");
    await ctx.asServer();
  });

  it("keeps what a screen may change of a customer's piece to its price", async () => {
    await ctx.asServer();
    const order = await customerOrder([ctx.small]);
    await ctx.asStaff(STAFF_ORDERS);
    const po = (await send(order.id, [[order.lines[0], 18]])).rows[0].send_order_to_supplier;
    const [line] = await poLines(po);
    await ctx.db.query("UPDATE public.purchase_order_items SET unit_cost = 19 WHERE id = $1", [
      line.id,
    ]);
    await expect(
      ctx.db.query("UPDATE public.purchase_order_items SET quantity = 3 WHERE id = $1", [line.id]),
    ).rejects.toThrow("CUSTOMER_PIECE_IS_SENT_FROM_ITS_ORDER");
    await expect(
      ctx.db.query(
        "INSERT INTO public.purchase_order_items (po_id, order_item_id, description, quantity, unit_cost) VALUES ($1, $2, 'x', 1, 1)",
        [po, order.lines[0]],
      ),
    ).rejects.toThrow("CUSTOMER_PIECE_IS_SENT_FROM_ITS_ORDER");
    await ctx.asServer();
  });
});

describe("receiving a customer's piece", () => {
  it("adds nothing to the stock, gives the order line its real cost, and brings the order back", async () => {
    await ctx.asServer();
    const order = await customerOrder([ctx.small, ctx.medium]);
    const before = { small: await ctx.stock(ctx.small), medium: await ctx.stock(ctx.medium) };
    await ctx.asStaff(STAFF_ORDERS);
    const po = (
      await send(order.id, [
        [order.lines[0], 18],
        [order.lines[1], 22],
      ])
    ).rows[0].send_order_to_supplier;
    const [a, b] = await poLines(po);

    // Only finances are needed: no stock moves.
    await ctx.receive(po, [[a.id, 1]]);
    await ctx.asServer();
    expect(await ctx.stock(ctx.small)).toBe(before.small);
    expect(await lineCost(order.lines[0])).toBe(18);
    // One piece of the order is still at the tailor.
    expect(await stage(order.id)).toBe("SENT_TO_TAILOR");

    await ctx.asStaff(STAFF_ORDERS);
    await ctx.receive(po, [[b.id, 1]]);
    await ctx.asServer();
    expect(await stage(order.id)).toBe("RECEIVED_FROM_TAILOR");
    expect(await lineCost(order.lines[1])).toBe(22);
    expect(await ctx.stock(ctx.medium)).toBe(before.medium);
    expect((await ctx.order(po)).status).toBe("received");
  });

  it("takes its share of the order's other costs, like any piece", async () => {
    await ctx.asServer();
    const order = await customerOrder([ctx.small]);
    await ctx.asStaff(STAFF_ORDERS);
    const po = (await send(order.id, [[order.lines[0], 20]])).rows[0].send_order_to_supplier;
    await ctx.db.query(
      "INSERT INTO public.purchase_order_items (po_id, description, quantity, unit_cost) VALUES ($1, 'Delivery', 1, 4)",
      [po],
    );
    const [piece] = await poLines(po);
    await ctx.receive(po, [[piece.id, 1]]);
    await ctx.asServer();
    expect(await lineCost(order.lines[0])).toBe(24);
  });

  it("still needs the stock permission for the store's own pieces", async () => {
    await ctx.asStaff("view_financials");
    const po = await ctx.newOrder([{ variant: ctx.small, quantity: 1, unit_cost: 10 }]);
    const [line] = await ctx.items(po.id);
    await expect(ctx.receive(po.id, [[line.id, 1]])).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asServer();
  });
});
