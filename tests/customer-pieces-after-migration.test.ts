import { beforeAll, describe, expect, it, vi } from "vitest";
import ordersMigration from "../supabase/migrations/20261019100000_supplier_orders_receive_into_stock.sql?raw";
import paymentsMigration from "../supabase/migrations/20261019110000_supplier_payments.sql?raw";
import piecesMigration from "../supabase/migrations/20261020100000_customer_pieces_to_supplier.sql?raw";
import migration from "../supabase/migrations/20261021100000_customer_pieces_cancel_fix_alteration.sql?raw";
import { BRAND, openSupplierOrdersDb } from "./helpers/supplier-orders-db";
import { orderReleased } from "../src/lib/order-released";

// A customer's piece after it went to the tailor (migration 20261021100000): the customer
// cancels and the store chooses (stop it, or keep it for sale), a faulty piece goes back to be
// fixed for free, and an alteration goes on the tailor's account and onto the piece's cost.
// Run in a real Postgres with the real ledger, as staff in a browser session and as the server.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let ctx: Awaited<ReturnType<typeof openSupplierOrdersDb>>;
const STAFF_ORDERS = "manage_orders,view_financials";
const STAFF_ALL = "manage_orders,view_financials,manage_inventory";

type Piece = [orderItemId: string, cost: number, purpose?: string, note?: string];

async function customerOrder(variant: string, quantity = 1) {
  const { id } = await ctx.one<{ id: string }>(
    "INSERT INTO public.orders (brand_id) VALUES ($1) RETURNING id",
    [BRAND],
  );
  const line = await ctx.one<{ id: string }>(
    `INSERT INTO public.order_items (order_id, brand_id, product_id, variant_id, quantity, unit_cost, description, location)
     VALUES ($1, $2, $3, $4, $5, 15, 'Black abaya · custom', 'custom') RETURNING id`,
    [id, BRAND, ctx.abaya, variant, quantity],
  );
  return { id, line: line.id };
}

const send = async (order: string, pieces: Piece[], po: string | null = null) =>
  (
    await ctx.db.query<{ send_order_to_supplier: string }>(
      "SELECT public.send_order_to_supplier($1, $2, $3, $4::jsonb, '2026-10-28')",
      [
        order,
        ctx.tailor,
        po,
        JSON.stringify(
          pieces.map(([order_item_id, unit_cost, purpose, note]) => ({
            order_item_id,
            unit_cost,
            ...(purpose ? { purpose } : {}),
            ...(note ? { note } : {}),
          })),
        ),
      ],
    )
  ).rows[0].send_order_to_supplier;
const release = (item: string, choice: string) =>
  ctx.db.query("SELECT public.release_customer_piece($1, $2)", [item, choice]);
const orderRow = (order: string) =>
  ctx.one<{ fulfillment_status: string }>(
    "SELECT fulfillment_status FROM public.orders WHERE id = $1",
    [order],
  );
const lineCost = async (line: string) =>
  Number(
    (
      await ctx.one<{ unit_cost: string }>(
        "SELECT unit_cost FROM public.order_items WHERE id = $1",
        [line],
      )
    ).unit_cost,
  );
const linesOf = async (po: string) =>
  (
    await ctx.db.query<{
      id: string;
      order_item_id: string | null;
      released_order_item_id: string | null;
      purpose: string;
      work_note: string | null;
      unit_cost: string;
    }>(
      "SELECT id, order_item_id, released_order_item_id, purpose, work_note, unit_cost FROM public.purchase_order_items WHERE po_id = $1 ORDER BY sort_order",
      [po],
    )
  ).rows;
const cancel = (order: string) =>
  ctx.db.query("UPDATE public.orders SET status = 'cancelled' WHERE id = $1", [order]);
const variantCost = async (variant: string) =>
  Number(
    (
      await ctx.one<{ cost_price: string } | undefined>(
        "SELECT cost_price FROM public.variant_costs WHERE variant_id = $1",
        [variant],
      )
    )?.cost_price ?? 0,
  );

beforeAll(async () => {
  ctx = await openSupplierOrdersDb([
    ordersMigration,
    paymentsMigration,
    piecesMigration,
    migration,
  ]);
});

describe("a customer cancels after the piece was sent", () => {
  it("can stop the piece with the tailor: the line goes and nothing is owed for it", async () => {
    await ctx.asServer();
    const order = await customerOrder(ctx.small);
    await ctx.asStaff(STAFF_ORDERS);
    const po = await send(order.id, [[order.line, 18]]);
    const [line] = await linesOf(po);
    // Only once the order is cancelled.
    await expect(release(line.id, "stop")).rejects.toThrow("ORDER_NOT_CANCELLED");
    await ctx.asServer();
    await cancel(order.id);
    await ctx.asStaff(STAFF_ORDERS);
    await release(line.id, "stop");
    await ctx.asServer();
    expect(await linesOf(po)).toHaveLength(0);
    expect(Number((await ctx.order(po)).total_amount)).toBe(0);
  });

  it("can keep a piece still at the tailor for sale: it joins the stock when it arrives", async () => {
    await ctx.asServer();
    const order = await customerOrder(ctx.medium);
    const before = await ctx.stock(ctx.medium);
    await ctx.asStaff(STAFF_ORDERS);
    const po = await send(order.id, [[order.line, 20]]);
    const [line] = await linesOf(po);
    await ctx.asServer();
    await cancel(order.id);
    // Putting a piece in stock needs the stock permission too.
    await ctx.asStaff(STAFF_ORDERS);
    await expect(release(line.id, "stock")).rejects.toThrow("NOT_AUTHORIZED");
    await ctx.asStaff(STAFF_ALL);
    await release(line.id, "stock");
    await ctx.asServer();
    expect((await linesOf(po))[0]).toMatchObject({
      order_item_id: null,
      released_order_item_id: order.line,
    });
    await ctx.asStaff(STAFF_ALL);
    await ctx.receive(po, [[line.id, 1]]);
    await ctx.asServer();
    expect(await ctx.stock(ctx.medium)).toBe(before + 1);
  });

  it("puts a piece that had already arrived on the shelf now, at what it cost, once", async () => {
    await ctx.asServer();
    const order = await customerOrder(ctx.large);
    const before = await ctx.stock(ctx.large);
    await ctx.asStaff(STAFF_ORDERS);
    const po = await send(order.id, [[order.line, 24]]);
    const [line] = await linesOf(po);
    await ctx.receive(po, [[line.id, 1]]);
    await ctx.asServer();
    expect(await ctx.stock(ctx.large)).toBe(before);
    await cancel(order.id);
    await ctx.asStaff(STAFF_ALL);
    // Arrived: it cannot be stopped any more.
    await expect(release(line.id, "stop")).rejects.toThrow("PIECE_ALREADY_ARRIVED");
    await release(line.id, "stock");
    await expect(release(line.id, "stock")).rejects.toThrow("PURCHASE_ORDER_LINE_NOT_FOUND");
    await ctx.asServer();
    expect(await ctx.stock(ctx.large)).toBe(before + 1);
    expect(await variantCost(ctx.large)).toBe(24);
    // The ledger agrees, so the nightly reconciliation leaves it.
    await ctx.db.query("SELECT public.reconcile_inventory()");
    expect(await ctx.stock(ctx.large)).toBe(before + 1);
  });

  it("sends no piece of an order already cancelled", async () => {
    await ctx.asServer();
    const order = await customerOrder(ctx.small);
    await cancel(order.id);
    await ctx.asStaff(STAFF_ORDERS);
    await expect(send(order.id, [[order.line, 18]])).rejects.toThrow("ORDER_CANCELLED");
    await ctx.asServer();
  });
});

describe("a piece back for a fix or an alteration", () => {
  it("goes back to be fixed for free, and the order waits for it again", async () => {
    await ctx.asServer();
    const order = await customerOrder(ctx.small);
    await ctx.asStaff(STAFF_ORDERS);
    const po = await send(order.id, [[order.line, 18]]);
    const [made] = await linesOf(po);
    // Not back yet: not sent for a fix.
    await expect(send(order.id, [[order.line, 0, "fix", "Hem"]])).rejects.toThrow(
      "ORDER_LINE_ALREADY_WITH_SUPPLIER",
    );
    await ctx.receive(po, [[made.id, 1]]);
    await ctx.asServer();
    expect((await orderRow(order.id)).fulfillment_status).toBe("RECEIVED_FROM_TAILOR");

    await ctx.asStaff(STAFF_ORDERS);
    const fixPo = await send(order.id, [[order.line, 0, "fix", "The hem is uneven"]]);
    // Pressed twice: one fix.
    await send(order.id, [[order.line, 0, "fix", "The hem is uneven"]], fixPo);
    await ctx.asServer();
    const fixLines = (await linesOf(fixPo)).filter((l) => l.purpose === "fix");
    expect(fixLines).toHaveLength(1);
    expect(fixLines[0].work_note).toBe("The hem is uneven");
    expect((await orderRow(order.id)).fulfillment_status).toBe("SENT_TO_TAILOR");

    await ctx.asStaff(STAFF_ORDERS);
    await ctx.receive(fixPo, [[fixLines[0].id, 1]]);
    await ctx.asServer();
    expect((await orderRow(order.id)).fulfillment_status).toBe("RECEIVED_FROM_TAILOR");
    expect(await lineCost(order.line)).toBe(18);
  });

  it("goes for an alteration at the tailor's charge, added to the piece's cost; the order stays", async () => {
    await ctx.asServer();
    const order = await customerOrder(ctx.medium);
    await ctx.asStaff(STAFF_ORDERS);
    const po = await send(order.id, [[order.line, 20]]);
    const [made] = await linesOf(po);
    await ctx.receive(po, [[made.id, 1]]);
    await ctx.asServer();
    await ctx.db.query("UPDATE public.orders SET fulfillment_status = 'DELIVERED' WHERE id = $1", [
      order.id,
    ]);

    await ctx.asStaff(STAFF_ORDERS);
    const altPo = await send(order.id, [[order.line, 3.5, "alteration", "Shorten by 2 cm"]]);
    await ctx.asServer();
    expect((await orderRow(order.id)).fulfillment_status).toBe("DELIVERED");
    expect(Number((await ctx.order(altPo)).total_amount)).toBeGreaterThanOrEqual(3.5);
    const [alt] = (await linesOf(altPo)).filter((l) => l.purpose === "alteration");

    await ctx.asStaff(STAFF_ORDERS);
    await ctx.receive(altPo, [[alt.id, 1]]);
    await ctx.asServer();
    expect(await lineCost(order.line)).toBe(23.5);
    expect((await orderRow(order.id)).fulfillment_status).toBe("DELIVERED");
  });

  it("keeps what a line is for to the database", async () => {
    await ctx.asServer();
    const order = await customerOrder(ctx.large);
    await ctx.asStaff(STAFF_ORDERS);
    const po = await send(order.id, [[order.line, 18]]);
    const [line] = await linesOf(po);
    await expect(
      ctx.db.query("UPDATE public.purchase_order_items SET purpose = 'fix' WHERE id = $1", [
        line.id,
      ]),
    ).rejects.toThrow("CUSTOMER_PIECE_IS_SENT_FROM_ITS_ORDER");
    await expect(send(order.id, [[order.line, 1, "repair"]], po)).rejects.toThrow(
      "INVALID_PURPOSE",
    );
    await ctx.asServer();
  });
});

describe("whether an order is cancelled", () => {
  it("reads the same in the screens as in the database", async () => {
    await ctx.asServer();
    const statuses = [
      "confirmed",
      "cancelled",
      "Canceled",
      "refunded",
      "voided",
      "failed",
      "completed",
      "draft",
      "",
      null,
    ];
    const payments = ["paid", "pending", "failed", "declined", "refunded", null];
    for (const status of statuses) {
      for (const payment of payments) {
        const { state } = await ctx.one<{ state: string }>(
          "SELECT public.order_inventory_desired_state($1, $2, 'card') AS state",
          [status, payment],
        );
        expect([status, payment, orderReleased(status, payment)]).toEqual([
          status,
          payment,
          state === "released",
        ]);
      }
    }
  });
});
