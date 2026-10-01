import { beforeAll, describe, expect, it, vi } from "vitest";
import { createEngineDb, type EngineDb } from "./helpers/booking-engine-db";

// Every booking has an order, so it has an invoice: run for real in Postgres
// (PGlite), as tests/booking-engine-capacity.test.ts does for the engine.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: EngineDb;
beforeAll(async () => {
  db = await createEngineDb();
});

type OrderRow = {
  id: string;
  status: string;
  fulfillment_method: string;
  subtotal: string;
  tax_rate: string;
  tax_amount: string;
  shipping: string;
  total: string;
  currency: string;
  invoice_number: number;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  order_date: string;
};

const orderOf = (id: string | null) =>
  db.one<OrderRow>(
    "select *, to_char(order_date, 'YYYY-MM-DD') as order_date from orders where id = $1",
    [id],
  );
const linesOf = (orderId: string) =>
  db.rows<{ description: string; quantity: number; unit_price: string; line_total: string }>(
    "select description, quantity, unit_price, line_total from order_items where order_id = $1 order by description",
    [orderId],
  );
const booking = (id: string) =>
  db.one<{ status: string; order_id: string | null; total: string }>(
    "select status, order_id, total from bookings where id = $1",
    [id],
  );
const setStatus = (id: string, status: string, reason?: string) =>
  db.one("select * from set_booking_status($1, $2, $3)", [id, status, reason ?? null]);
const invoice = (id: string) =>
  db.one<{ create_booking_order: string }>("select create_booking_order($1)", [id]);
const requested = async (brand: string, svc: { id: string; variantId: string }, offset: number) => {
  const sent = await db.request(brand, db.day(offset), "12:00", 60, [
    { product_id: svc.id, variant_id: svc.variantId },
  ]);
  return db.one<{ id: string }>("select id from bookings where reference = $1", [sent.reference]);
};

describe("a booking staff enter as confirmed", () => {
  it("has its appointment order from the start, one line per service", async () => {
    const brand = await db.store({ dailyCapacity: 3 });
    const booth = await db.service(brand, { name: "Booth" });
    const prints = await db.service(brand, { name: "Prints" });
    const made = await db.staff(brand, db.day(5), "18:00", 120, [
      { product_id: booth.id, variant_id: booth.variantId, unit_price: 55, name_en: "Booth" },
      {
        product_id: prints.id,
        variant_id: prints.variantId,
        unit_price: 20,
        quantity: 2,
        name_en: "Prints",
      },
    ]);

    const stored = await booking(made.id);
    expect(stored.order_id).not.toBeNull();
    const order = await orderOf(stored.order_id);
    expect(order).toMatchObject({
      status: "confirmed",
      fulfillment_method: "appointment",
      customer_name_snapshot: "Ali",
      customer_phone_snapshot: "39990016",
      order_date: db.day(5),
      currency: "BHD",
    });
    expect(order.invoice_number).toBeGreaterThan(1000);
    expect(Number(order.subtotal)).toBe(95);
    expect(Number(order.total)).toBe(95);
    const lines = await linesOf(order.id);
    expect(lines.map((l) => [l.description, l.quantity, Number(l.line_total)])).toEqual([
      ["Booth", 1, 55],
      ["Prints", 2, 40],
    ]);
  });

  it("carries the store's VAT, excluded or included", async () => {
    const brand = await db.store({ dailyCapacity: 3 });
    const svc = await db.service(brand);
    await db.pg.query("update business_settings set default_tax_rate = 10 where brand_id = $1", [
      brand,
    ]);
    const excluded = await db.staff(brand, db.day(5), "10:00", 60, [
      { product_id: svc.id, variant_id: svc.variantId, unit_price: 100 },
    ]);
    const a = await orderOf((await booking(excluded.id)).order_id);
    expect([Number(a.tax_rate), Number(a.tax_amount), Number(a.total)]).toEqual([10, 10, 110]);

    await db.pg.query("update business_settings set vat_inclusive = true where brand_id = $1", [
      brand,
    ]);
    const included = await db.staff(brand, db.day(6), "10:00", 60, [
      { product_id: svc.id, variant_id: svc.variantId, unit_price: 110 },
    ]);
    const b = await orderOf((await booking(included.id)).order_id);
    expect([Number(b.tax_amount), Number(b.total)]).toEqual([10, 110]);
  });

  it("charges the travel fee as the order's delivery fee", async () => {
    const brand = await db.store({ dailyCapacity: 3 });
    const svc = await db.service(brand);
    const made = await db.staff(brand, db.day(5), "10:00", 60, [
      { product_id: svc.id, variant_id: svc.variantId, unit_price: 40 },
    ]);
    // The request path writes the fee on the booking; write it the same way, then invoice again.
    await db.pg.query(
      "update bookings set travel_fee = 5, total = 45, order_id = null where id = $1",
      [made.id],
    );
    const order = await orderOf((await invoice(made.id)).create_booking_order);
    expect([Number(order.shipping), Number(order.subtotal), Number(order.total)]).toEqual([
      5, 40, 45,
    ]);
  });

  it("has no order when it is only a request", async () => {
    const brand = await db.store({ dailyCapacity: 3 });
    const svc = await db.service(brand);
    const made = await db.staff(
      brand,
      db.day(5),
      "10:00",
      60,
      [{ product_id: svc.id, variant_id: svc.variantId }],
      { status: "requested" },
    );
    expect((await booking(made.id)).order_id).toBeNull();
  });
});

describe("a request from the storefront", () => {
  it("is invoiced on demand as a pending order, once", async () => {
    const brand = await db.store({ dailyCapacity: 3 });
    const svc = await db.service(brand);
    const asked = await requested(brand, svc, 6);
    expect((await booking(asked.id)).order_id).toBeNull();

    const first = (await invoice(asked.id)).create_booking_order;
    const again = (await invoice(asked.id)).create_booking_order;
    expect(again).toBe(first);
    expect(await db.rows("select 1 from orders where id = $1", [first])).toHaveLength(1);
    expect((await orderOf(first)).status).toBe("pending");
    expect((await orderOf(first)).customer_name_snapshot).toBe("Sara");
    expect((await booking(asked.id)).status).toBe("requested");
  });

  it("gets its order when it is confirmed", async () => {
    const brand = await db.store({ dailyCapacity: 3 });
    const svc = await db.service(brand);
    const asked = await requested(brand, svc, 7);
    await setStatus(asked.id, "confirmed");
    const confirmed = await booking(asked.id);
    expect(confirmed.status).toBe("confirmed");
    expect((await orderOf(confirmed.order_id)).status).toBe("confirmed");
  });

  it("turns a quote into a confirmed order when it is confirmed", async () => {
    const brand = await db.store({ dailyCapacity: 3 });
    const svc = await db.service(brand);
    const asked = await requested(brand, svc, 8);
    const orderId = (await invoice(asked.id)).create_booking_order;
    await setStatus(asked.id, "confirmed");
    expect((await booking(asked.id)).order_id).toBe(orderId);
    expect((await orderOf(orderId)).status).toBe("confirmed");
  });
});

describe("the booking and its order go together", () => {
  it("cancel the order with the booking, and reopen it when reinstated", async () => {
    const brand = await db.store({ dailyCapacity: 3 });
    const svc = await db.service(brand);
    const made = await db.staff(brand, db.day(9), "10:00", 60, [
      { product_id: svc.id, variant_id: svc.variantId },
    ]);
    const orderId = (await booking(made.id)).order_id;
    await setStatus(made.id, "cancelled", "Customer asked");
    expect((await orderOf(orderId)).status).toBe("cancelled");
    await setStatus(made.id, "confirmed");
    expect((await orderOf(orderId)).status).toBe("confirmed");
  });

  it("leave a completed order alone when the booking is cancelled", async () => {
    const brand = await db.store({ dailyCapacity: 3 });
    const svc = await db.service(brand);
    const made = await db.staff(brand, db.day(9), "10:00", 60, [
      { product_id: svc.id, variant_id: svc.variantId },
    ]);
    const orderId = (await booking(made.id)).order_id;
    await db.pg.query("update orders set status = 'completed' where id = $1", [orderId]);
    await setStatus(made.id, "cancelled");
    expect((await orderOf(orderId)).status).toBe("completed");
  });

  it("refuse to invoice a hold or an unknown booking, and keep it from anonymous callers", async () => {
    const brand = await db.store({ dailyCapacity: 3 });
    const svc = await db.service(brand);
    const made = await db.staff(brand, db.day(9), "10:00", 60, [
      { product_id: svc.id, variant_id: svc.variantId },
    ]);
    await db.pg.query(
      "update bookings set order_id = null, status = 'hold', hold_expires_at = now() + interval '10 min' where id = $1",
      [made.id],
    );
    expect((await db.refusal(invoice(made.id)))?.message).toBe("BOOKING_TRANSITION_INVALID");
    expect((await db.refusal(invoice("00000000-0000-4000-8000-000000000001")))?.message).toBe(
      "BOOKING_NOT_FOUND",
    );

    const grants = await db.one<{ anon: boolean; authed: boolean }>(
      `select has_function_privilege('anon', 'create_booking_order(uuid)', 'execute') as anon,
              has_function_privilege('authenticated', 'create_booking_order(uuid)', 'execute') as authed`,
    );
    expect(grants).toEqual({ anon: false, authed: true });
  });
});
