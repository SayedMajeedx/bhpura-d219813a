import { beforeAll, describe, expect, it, vi } from "vitest";
import depositMigration from "../supabase/migrations/20261023100000_booking_transfer_deposit.sql?raw";
import lateMigration from "../supabase/migrations/20261026100000_late_payment_keeps_a_taken_day.sql?raw";
import { createEngineDb, type EngineDb } from "./helpers/booking-engine-db";
import { PAYMENTS, syncTrigger } from "./helpers/booking-checkout-db";

// A payment that arrives after a booking's hold ran out (migration 20261026100000), run for real
// in Postgres (PGlite) through the booking engine's own hold, order, approval and move functions.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: EngineDb;

beforeAll(async () => {
  db = await createEngineDb();
  await db.pg.exec(PAYMENTS);
  await db.pg.exec(syncTrigger());
  await db.pg.exec(depositMigration);
  await db.pg.exec(lateMigration);
});

/** A store that takes one booking a day (or one per service), with a 70 BHD booth. */
async function store(options: { dailyCapacity?: number; serviceCapacity?: number } = {}) {
  const brand = await db.store({ dailyCapacity: options.dailyCapacity ?? 1, leadDays: 0 });
  const slug = await db.slugOf(brand);
  await db.pg.query(
    "update business_settings set storefront_mode = 'shop', card_enabled = false, benefit_enabled = true where brand_id = $1",
    [brand],
  );
  const svc = await db.service(brand, {
    name: "Booth",
    price: 70,
    capacity: options.serviceCapacity ?? null,
  });
  return { brand, slug, svc };
}

type Store = Awaited<ReturnType<typeof store>>;

/** A customer holds the booth on a day and places the order with a payment method. */
async function book(s: Store, method: string, dayOffset = 5) {
  const held = await db.one<{ hold_booking: { booking_id: string; hold_token: string } }>(
    `select hold_booking($1, $2::date, '12:00'::time, 120, $3::jsonb, $4::jsonb, '{}'::jsonb, null)`,
    [
      s.brand,
      db.day(dayOffset),
      JSON.stringify([{ product_id: s.svc.id, variant_id: s.svc.variantId }]),
      JSON.stringify({ name: "Sara", phone: "39990017" }),
    ],
  );
  const placed = await db.one<{ place_booking_order: { order_id: string } }>(
    `select place_booking_order($1, $2::uuid, $3, $4::jsonb, $5::jsonb, $6)`,
    [
      held.hold_booking.booking_id,
      held.hold_booking.hold_token,
      s.slug,
      JSON.stringify({ name: "Sara", phone: "39990017" }),
      JSON.stringify([{ variant_id: s.svc.variantId, quantity: 1 }]),
      method,
    ],
  );
  return { bookingId: held.hold_booking.booking_id, orderId: placed.place_booking_order.order_id };
}

/** The 24 hours pass with nobody checking the receipt. */
const holdRunsOut = (bookingId: string) =>
  db.pg.query("update bookings set hold_expires_at = now() - interval '3 hours' where id = $1", [
    bookingId,
  ]);

const approve = (orderId: string) =>
  db
    .one<{
      approve_benefit_payment: { approved: boolean; slot_taken: boolean };
    }>("select approve_benefit_payment($1)", [orderId])
    .then((row) => row.approve_benefit_payment);

const booking = (id: string) =>
  db.one<{ status: string; late_payment_slot_taken_at: string | null; notes: string | null }>(
    "select status, late_payment_slot_taken_at, notes from bookings where id = $1",
    [id],
  );
const paymentOf = (orderId: string) =>
  db
    .one<{ payment_status: string }>("select payment_status from orders where id = $1", [orderId])
    .then((row) => row.payment_status);

describe("approving a transfer for a booking", () => {
  it("confirms the booking while its hold runs", async () => {
    const s = await store();
    const first = await book(s, "benefit");
    expect((await approve(first.orderId)).slot_taken).toBe(false);
    expect((await booking(first.bookingId)).status).toBe("confirmed");
  });

  it("confirms it after the hold ran out while the day is still free, with no note", async () => {
    const s = await store();
    const first = await book(s, "benefit");
    await holdRunsOut(first.bookingId);
    expect((await approve(first.orderId)).slot_taken).toBe(false);
    const row = await booking(first.bookingId);
    expect(row.status).toBe("confirmed");
    expect(row.late_payment_slot_taken_at).toBeNull();
    expect(row.notes ?? "").not.toMatch(/hold ran out/);
  });

  it("records the payment but does not confirm a day another customer took meanwhile", async () => {
    const s = await store();
    const first = await book(s, "benefit");
    await holdRunsOut(first.bookingId);
    const second = await book(s, "cod");
    expect((await booking(second.bookingId)).status).toBe("confirmed");

    expect((await approve(first.orderId)).slot_taken).toBe(true);
    expect(await paymentOf(first.orderId)).toBe("paid");
    const row = await booking(first.bookingId);
    expect(row.status).toBe("expired");
    expect(row.late_payment_slot_taken_at).not.toBeNull();
    expect((await booking(second.bookingId)).status).toBe("confirmed");
  });

  it("does not confirm it when the booked service is full, though the day has room", async () => {
    const s = await store({ dailyCapacity: 3, serviceCapacity: 1 });
    const first = await book(s, "benefit");
    await holdRunsOut(first.bookingId);
    await book(s, "cod");
    expect((await approve(first.orderId)).slot_taken).toBe(true);
    expect((await booking(first.bookingId)).status).toBe("expired");
  });

  it("holds for a card paid late too (the order's payment, whoever recorded it)", async () => {
    const s = await store();
    const first = await book(s, "card");
    await holdRunsOut(first.bookingId);
    await book(s, "cod");
    await db.pg.query("update orders set payment_status = 'paid' where id = $1", [first.orderId]);
    expect((await booking(first.bookingId)).late_payment_slot_taken_at).not.toBeNull();
  });
});

describe("a paid booking whose day was taken", () => {
  async function bumped() {
    const s = await store();
    const first = await book(s, "benefit");
    await holdRunsOut(first.bookingId);
    await book(s, "cod");
    await approve(first.orderId);
    return { s, first };
  }

  it("is confirmed by moving it to a free day", async () => {
    const { first } = await bumped();
    await db.one(`select reschedule_booking($1, $2::date, '12:00'::time, 120)`, [
      first.bookingId,
      db.day(6),
    ]);
    const row = await booking(first.bookingId);
    expect(row.status).toBe("confirmed");
    expect(row.late_payment_slot_taken_at).toBeNull();
  });

  it("is not moved onto a day that is full, unless staff overbook on purpose", async () => {
    const { first } = await bumped();
    await expect(
      db.one(`select reschedule_booking($1, $2::date, '12:00'::time, 120)`, [
        first.bookingId,
        db.day(5),
      ]),
    ).rejects.toThrow(/BOOKING_DAY_FULL/);
    await db.one(`select reschedule_booking($1, $2::date, '12:00'::time, 120, true)`, [
      first.bookingId,
      db.day(5),
    ]);
    expect((await booking(first.bookingId)).status).toBe("confirmed");
  });

  it("is cancelled with its order when the store returns the money", async () => {
    const { first } = await bumped();
    await db.pg.query("update orders set status = 'cancelled' where id = $1", [first.orderId]);
    const row = await booking(first.bookingId);
    expect(row.status).toBe("cancelled");
    expect(row.late_payment_slot_taken_at).toBeNull();
  });

  it("is not moved when it ran out unpaid (nothing to keep)", async () => {
    const s = await store();
    const first = await book(s, "benefit");
    await db.pg.query("update bookings set status = 'expired' where id = $1", [first.bookingId]);
    await expect(
      db.one(`select reschedule_booking($1, $2::date, '12:00'::time, 120)`, [
        first.bookingId,
        db.day(6),
      ]),
    ).rejects.toThrow(/BOOKING_TRANSITION_INVALID/);
  });
});
