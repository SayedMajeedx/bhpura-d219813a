import { beforeAll, describe, expect, it, vi } from "vitest";
import fixMigration from "../supabase/migrations/20261002150000_fix_storefront_checkout_and_held_bookings.sql?raw";
import { createEngineDb, type EngineDb } from "./helpers/booking-engine-db";

// A checkout that failed, a transfer waiting for its receipt, and what staff can
// do with a held booking: run for real in Postgres (PGlite).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: EngineDb;
beforeAll(async () => {
  db = await createEngineDb();
});

type Held = {
  status: string;
  confirmed_at: string | null;
  hold_minutes: number | null;
  order_id: string | null;
};
const bookingRow = (id: string) =>
  db.one<Held>(
    `select status, confirmed_at,
            round(extract(epoch from (hold_expires_at - now())) / 60)::integer as hold_minutes, order_id
       from bookings where id = $1`,
    [id],
  );

/** Holds a booking for a service and places its order with a payment method. */
async function placed(method: "card" | "benefit" | "cash", options: { dayOffset?: number } = {}) {
  const brand = await db.store({ dailyCapacity: 3, leadDays: 0, holdMinutes: 15 });
  const slug = await db.slugOf(brand);
  await db.pg.query("update business_settings set storefront_mode = 'shop' where brand_id = $1", [
    brand,
  ]);
  const svc = await db.service(brand, { name: "Booth", price: 70 });
  const held = await db.one<{ hold_booking: { booking_id: string; hold_token: string } }>(
    `select hold_booking($1, $2::date, '12:00'::time, 120, $3::jsonb, $4::jsonb, '{}'::jsonb, null)`,
    [
      brand,
      db.day(options.dayOffset ?? 5),
      JSON.stringify([{ product_id: svc.id, variant_id: svc.variantId }]),
      JSON.stringify({ name: "Sara", phone: "39990017" }),
    ],
  );
  await db.one(`select place_booking_order($1, $2::uuid, $3, $4::jsonb, $5::jsonb, $6)`, [
    held.hold_booking.booking_id,
    held.hold_booking.hold_token,
    slug,
    JSON.stringify({ name: "Sara", phone: "39990017" }),
    JSON.stringify([{ variant_id: svc.variantId, quantity: 1 }]),
    method,
  ]);
  return { brand, bookingId: held.hold_booking.booking_id, svc };
}

describe("a booking placed with its payment method", () => {
  it("holds the day for half an hour while a card pays", async () => {
    const { bookingId } = await placed("card");
    const row = await bookingRow(bookingId);
    expect(row.status).toBe("hold");
    expect(row.confirmed_at).toBeNull();
    expect(row.hold_minutes).toBeGreaterThanOrEqual(29);
    expect(row.hold_minutes).toBeLessThanOrEqual(30);
    expect(row.order_id).not.toBeNull();
  });

  it("holds the day for a day while a BenefitPay receipt is verified, not confirmed on upload", async () => {
    const { bookingId } = await placed("benefit");
    const row = await bookingRow(bookingId);
    expect(row.status).toBe("hold");
    expect(row.confirmed_at).toBeNull();
    expect(row.hold_minutes).toBeGreaterThanOrEqual(24 * 60 - 1);
    expect(row.hold_minutes).toBeLessThanOrEqual(24 * 60);
  });

  it("is confirmed at once when it is paid on the day", async () => {
    const { bookingId } = await placed("cash");
    const row = await bookingRow(bookingId);
    expect(row.status).toBe("confirmed");
    expect(row.confirmed_at).not.toBeNull();
    expect(row.hold_minutes).toBeNull();
  });
});

describe("what staff do with a held booking", () => {
  const setStatus = (id: string, status: string) =>
    db.one("select * from set_booking_status($1, $2, null)", [id, status]);

  it("confirm it once the payment is checked, which frees it from its time limit", async () => {
    const { bookingId } = await placed("benefit");
    await setStatus(bookingId, "confirmed");
    const row = await bookingRow(bookingId);
    expect(row.status).toBe("confirmed");
    expect(row.hold_minutes).toBeNull();
    expect(row.confirmed_at).not.toBeNull();
  });

  it("confirm one that ran out, while the day is still free", async () => {
    const { bookingId } = await placed("card");
    await db.pg.query(
      "update bookings set status = 'expired', hold_expires_at = now() - interval '1 hour' where id = $1",
      [bookingId],
    );
    await setStatus(bookingId, "confirmed");
    expect((await bookingRow(bookingId)).status).toBe("confirmed");
  });

  it("cannot confirm a held booking whose day has been taken", async () => {
    const { brand, bookingId, svc } = await placed("card", { dayOffset: 6 });
    await db.pg.query(
      "update bookings set status = 'expired', hold_expires_at = now() - interval '1 hour' where id = $1",
      [bookingId],
    );
    await db.pg.query("update booking_settings set daily_capacity = 1 where brand_id = $1", [
      brand,
    ]);
    await db.staff(brand, db.day(6), "18:00", 60, [
      { product_id: svc.id, variant_id: svc.variantId },
    ]);
    expect((await db.refusal(setStatus(bookingId, "confirmed")))?.message).toBe("BOOKING_DAY_FULL");
  });

  it("release one, which cancels its order too", async () => {
    const { bookingId } = await placed("benefit");
    const before = await bookingRow(bookingId);
    await setStatus(bookingId, "cancelled");
    const row = await bookingRow(bookingId);
    expect(row.status).toBe("cancelled");
    expect(row.hold_minutes).toBeNull();
    const order = await db.one<{ status: string }>("select status from orders where id = $1", [
      before.order_id,
    ]);
    expect(order.status).toBe("cancelled");
  });
});

describe("the storefront order builder's invoice number", () => {
  // It built "INV-YYMMDD-XXXXXX" for the integer column orders.invoice_number, so no
  // storefront order could be placed. The orders trigger numbers the invoice.
  it("is left to the database, as an integer", () => {
    expect(fixMigration).not.toContain("'INV-'");
    expect(fixMigration).toContain("v_invoice integer;");
    expect(fixMigration).toMatch(/v_invoice := 0;/);
    expect(fixMigration).toContain(
      "SELECT invoice_number INTO v_invoice FROM public.orders WHERE id = v_order_id;",
    );
  });
});
