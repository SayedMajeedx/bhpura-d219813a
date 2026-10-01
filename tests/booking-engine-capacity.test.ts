import { beforeAll, describe, expect, it } from "vitest";
import { createEngineDb, type EngineDb } from "./helpers/booking-engine-db";

// The booking engine v2, run for real in Postgres (PGlite): a service has its
// own capacity, scope, buffer and notice, and every write path and read
// function answers to the same rules.

let db: EngineDb;
beforeAll(async () => {
  db = await createEngineDb();
}, 120_000);

const FULL = "BOOKING_SERVICE_FULL";

describe("two windows clash when they overlap or come closer than the buffer", () => {
  const clash = async (a: [string, string], b: [string, string], buffer: number) =>
    (
      await db.one<{ c: boolean }>(
        "select booking_windows_overlap($1::timestamptz, $2::timestamptz, $3::timestamptz, $4::timestamptz, $5) as c",
        [a[0], a[1], b[0], b[1], buffer],
      )
    ).c;
  const t = (hhmm: string) => `2026-10-20T${hhmm}:00Z`;

  it("overlap, touch and gap, with and without a buffer", async () => {
    expect(await clash([t("10:00"), t("12:00")], [t("11:00"), t("13:00")], 0)).toBe(true);
    // Touching is not overlapping.
    expect(await clash([t("10:00"), t("12:00")], [t("12:00"), t("14:00")], 0)).toBe(false);
    // The buffer keeps both sides clear, whichever comes first.
    expect(await clash([t("10:00"), t("12:00")], [t("12:15"), t("14:00")], 30)).toBe(true);
    expect(await clash([t("12:15"), t("14:00")], [t("10:00"), t("12:00")], 30)).toBe(true);
    expect(await clash([t("10:00"), t("12:00")], [t("12:30"), t("14:00")], 30)).toBe(false);
    expect(await clash([t("12:30"), t("14:00")], [t("10:00"), t("12:00")], 30)).toBe(false);
  });
});

describe("a store that sets nothing of this behaves exactly as before", () => {
  it("decides a day by lead days, horizon, weekday, block and the store's places", async () => {
    const closedDay = db.day(20);
    const weekday = (
      await db.one<{ dow: number }>("select extract(dow from $1::date)::int as dow", [closedDay])
    ).dow;
    const brand = await db.store({ dailyCapacity: 2, leadDays: 2, closedWeekdays: [weekday] });
    await db.pg.query("update booking_settings set horizon_days = 60 where brand_id = $1", [brand]);
    const plain = await db.service(brand, { capacity: null });
    const blocked = db.day(21);
    await db.pg.query(
      "insert into booking_blocks (brand_id, starts_on, ends_on) values ($1, $2, $2)",
      [brand, blocked],
    );
    const state = async (dayIso: string, staff = false) =>
      (await db.dayState(brand, dayIso, staff)).state;

    // Customers: notice and horizon apply; staff are not held by them.
    expect(await state(db.day(1))).toBe("past");
    expect(await state(db.day(1), true)).toBe("available");
    expect(await state(db.day(400))).toBe("beyond");
    expect(await state(db.day(400), true)).toBe("available");
    expect(await state(closedDay)).toBe("closed");
    expect(await state(blocked)).toBe("blocked");

    const day = db.day(25);
    expect(await db.dayState(brand, day)).toEqual({ state: "available", remaining: 2 });
    await db.staff(brand, day, "10:00", 180, [{ product_id: plain.id }]);
    expect(await db.dayState(brand, day)).toEqual({ state: "available", remaining: 1 });
    await db.staff(brand, day, "18:00", 180, [{ product_id: plain.id }]);
    expect(await db.dayState(brand, day)).toEqual({ state: "full", remaining: 0 });
    // A booking with no services (a walk-in noted by hand) uses a place too.
    const other = db.day(26);
    await db.staff(brand, other, "10:00", 180, []).catch(() => undefined);
    expect((await db.refusal(db.staff(brand, other, "10:00", 180, [])))?.message).toBe(
      "BOOKING_ITEMS_REQUIRED",
    );
  });
});

describe("a service kept for the whole day (two photo booths)", () => {
  it("takes two bookings a day and refuses the third", async () => {
    const brand = await db.store({ dailyCapacity: 1 });
    const booth = await db.service(brand, { name: "Booth", capacity: 2, scope: "day" });
    const day = db.day(12);
    const item = [{ product_id: booth.id, variant_id: booth.variantId }];

    await db.staff(brand, day, "10:00", 180, item);
    await db.staff(brand, day, "18:00", 180, item);
    const refused = await db.refusal(db.staff(brand, day, "14:00", 180, item));
    expect(refused?.message).toBe(FULL);
    expect(refused?.detail).toBe(booth.id);

    // A refusal leaves nothing behind; another day is free.
    const count = await db.one<{ n: number }>(
      "select count(*)::int as n from bookings where brand_id = $1",
      [brand],
    );
    expect(count.n).toBe(2);
    await db.staff(brand, db.day(13), "14:00", 180, item);
  });

  it("is not limited by another service's capacity", async () => {
    const brand = await db.store();
    const booth = await db.service(brand, { capacity: 1 });
    const dj = await db.service(brand, { name: "DJ", capacity: 1 });
    const day = db.day(12);
    await db.staff(brand, day, "10:00", 180, [{ product_id: booth.id }]);
    // The booth is taken for the day; the DJ is free the same day.
    await db.staff(brand, day, "10:00", 180, [{ product_id: dj.id }]);
    expect(
      (await db.refusal(db.staff(brand, day, "14:00", 180, [{ product_id: booth.id }])))?.message,
    ).toBe(FULL);
  });

  it("counts a booking's quantity as that many units", async () => {
    const brand = await db.store();
    const booth = await db.service(brand, { capacity: 2 });
    const day = db.day(12);
    await db.staff(brand, day, "10:00", 180, [{ product_id: booth.id, quantity: 2 }]);
    expect(
      (await db.refusal(db.staff(brand, day, "18:00", 180, [{ product_id: booth.id }])))?.message,
    ).toBe(FULL);
    // A booking for more units than the service has can never fit.
    const other = db.day(14);
    expect(
      (
        await db.refusal(
          db.staff(brand, other, "10:00", 180, [{ product_id: booth.id, quantity: 3 }]),
        )
      )?.message,
    ).toBe(FULL);
  });

  it("is freed by a cancellation, and confirming it again checks the room", async () => {
    const brand = await db.store();
    const booth = await db.service(brand, { capacity: 1 });
    const day = db.day(12);
    const first = await db.staff(brand, day, "10:00", 180, [{ product_id: booth.id }]);
    await db.pg.query("select set_booking_status($1, 'cancelled', 'changed plans')", [first.id]);
    const second = await db.staff(brand, day, "10:00", 180, [{ product_id: booth.id }]);
    expect(second.status).toBe("confirmed");
    // The cancelled one cannot come back while the second holds the unit.
    const back = await db.refusal(
      db.pg.query("select set_booking_status($1, 'confirmed')", [first.id]),
    );
    expect(back?.message).toBe(FULL);
  });

  it("lets staff overbook on purpose", async () => {
    const brand = await db.store();
    const booth = await db.service(brand, { capacity: 1 });
    const day = db.day(12);
    await db.staff(brand, day, "10:00", 180, [{ product_id: booth.id }]);
    const extra = await db.staff(brand, day, "18:00", 180, [{ product_id: booth.id }], {
      overbook: true,
    });
    expect(extra.status).toBe("confirmed");
  });
});

describe("a service kept only for its own hours (a pool, one at a time, 30 minutes to clean)", () => {
  it("refuses a booking inside the clean-up time and takes one after it", async () => {
    const brand = await db.store();
    const pool = await db.service(brand, { name: "Pool", capacity: 1, scope: "time", buffer: 30 });
    const day = db.day(12);
    const item = [{ product_id: pool.id }];
    await db.staff(brand, day, "10:00", 60, item); // 10:00-11:00

    // 11:00 and 11:15 start inside the 30 minutes; 11:30 is clear.
    expect((await db.refusal(db.staff(brand, day, "11:00", 60, item)))?.message).toBe(FULL);
    expect((await db.refusal(db.staff(brand, day, "10:30", 60, item)))?.message).toBe(FULL);
    await db.staff(brand, day, "11:30", 60, item);
    // Hours apart need no thought.
    await db.staff(brand, day, "15:00", 120, item);
  });

  it("takes any number at different hours of one day, without using the store's one place", async () => {
    const brand = await db.store({ dailyCapacity: 1 });
    const pool = await db.service(brand, { capacity: 1, scope: "time" });
    const day = db.day(12);
    for (const start of ["10:00", "12:00", "14:00", "16:00"]) {
      await db.staff(brand, day, start, 60, [{ product_id: pool.id }]);
    }
    expect((await db.dayState(brand, day)).state).toBe("available");
  });

  it("checks the new time when a booking moves", async () => {
    const brand = await db.store();
    const pool = await db.service(brand, { capacity: 1, scope: "time" });
    const day = db.day(12);
    const item = [{ product_id: pool.id }];
    await db.staff(brand, day, "10:00", 60, item);
    const mine = await db.staff(brand, day, "14:00", 60, item);

    const clash = await db.refusal(
      db.pg.query("select reschedule_booking($1, $2::date, '10:30'::time, 60, false)", [
        mine.id,
        day,
      ]),
    );
    expect(clash?.message).toBe(FULL);
    await db.pg.query("select reschedule_booking($1, $2::date, '11:00'::time, 60, false)", [
      mine.id,
      day,
    ]);
    const moved = await db.one<{ s: string }>(
      "select to_char(starts_at at time zone 'Asia/Bahrain', 'HH24:MI') as s from bookings where id = $1",
      [mine.id],
    );
    expect(moved.s).toBe("11:00");
    // Staff may still move it onto an occupied time on purpose.
    await db.pg.query("select reschedule_booking($1, $2::date, '10:30'::time, 60, true)", [
      mine.id,
      day,
    ]);
  });
});

describe("the store's daily places", () => {
  it("still limit a service with no capacity of its own, as before", async () => {
    const brand = await db.store({ dailyCapacity: 1 });
    const plain = await db.service(brand, { capacity: null });
    const day = db.day(12);
    await db.staff(brand, day, "10:00", 180, [{ product_id: plain.id }]);
    expect(
      (await db.refusal(db.staff(brand, day, "18:00", 180, [{ product_id: plain.id }])))?.message,
    ).toBe("BOOKING_DAY_FULL");
    expect((await db.dayState(brand, day)).state).toBe("full");
  });

  it("are not used up by bookings governed by service capacities", async () => {
    const brand = await db.store({ dailyCapacity: 1 });
    const booth = await db.service(brand, { capacity: 3 });
    const plain = await db.service(brand, { capacity: null });
    const day = db.day(12);
    await db.staff(brand, day, "10:00", 180, [{ product_id: booth.id }]);
    await db.staff(brand, day, "14:00", 180, [{ product_id: booth.id }]);
    // The store's one place is still free for a plain service...
    expect((await db.dayState(brand, day)).state).toBe("available");
    await db.staff(brand, day, "18:00", 180, [{ product_id: plain.id }]);
    // ...and then it is taken.
    expect((await db.dayState(brand, day)).state).toBe("full");
    // The booth is not blocked by that.
    await db.staff(brand, day, "20:00", 120, [{ product_id: booth.id }]);
  });

  it("are used by a booking that mixes in a service without capacity", async () => {
    const brand = await db.store({ dailyCapacity: 1 });
    const booth = await db.service(brand, { capacity: 3 });
    const plain = await db.service(brand, { capacity: null });
    const day = db.day(12);
    await db.staff(brand, day, "10:00", 180, [{ product_id: booth.id }, { product_id: plain.id }]);
    expect((await db.dayState(brand, day)).state).toBe("full");
  });
});

describe("notice", () => {
  it("a service's own notice replaces the store's lead days", async () => {
    // The store wants 3 days; the pool only 12 hours.
    const brand = await db.store({ leadDays: 3 });
    const slow = await db.service(brand, { name: "Slow", capacity: 1, scope: "time" });
    const pool = await db.service(brand, { name: "Pool", capacity: 1, scope: "time", notice: 12 });
    const rows = await db.availability(brand, [slow.id, pool.id], db.day(1), db.day(1));
    const state = (id: string) => rows.find((row) => row.product_id === id)?.state;
    // Slow has no notice of its own, so the store's lead days apply to it.
    expect(state(slow.id)).toBe("past");
    expect(state(pool.id)).toBe("available");
  });

  it("is enforced on a request, and a mixed booking keeps the store's lead days", async () => {
    const brand = await db.store({ leadDays: 3 });
    const pool = await db.service(brand, { capacity: 1, scope: "time", notice: 12 });
    const far = await db.service(brand, { capacity: 1, scope: "time", notice: 24 * 100 });
    const plain = await db.service(brand, { capacity: 1, scope: "time" });
    const tomorrow = db.day(1);

    const ok = await db.request(brand, tomorrow, "22:00", 60, [{ product_id: pool.id }]);
    expect(ok.status).toBe("requested");
    // A service that wants 100 days' notice refuses tomorrow.
    expect(
      (await db.refusal(db.request(brand, tomorrow, "22:00", 60, [{ product_id: far.id }])))
        ?.message,
    ).toBe("BOOKING_DAY_PAST");
    // With a service that has no notice of its own, the store's 3 days apply to the whole booking.
    expect(
      (
        await db.refusal(
          db.request(brand, tomorrow, "22:00", 60, [
            { product_id: pool.id },
            { product_id: plain.id },
          ]),
        )
      )?.message,
    ).toBe("BOOKING_DAY_PAST");
  });

  it("is checked per start time", async () => {
    const brand = await db.store();
    const pool = await db.service(brand, { capacity: 1, scope: "time", notice: 24 * 365 });
    const rows = await db.starts(brand, db.day(12), [pool.id], 60);
    expect(rows.every((row) => !row.free && row.reason !== null)).toBe(true);
  });
});

describe("the free days for the chosen services", () => {
  it("count the units left on a day, and mark the day full when none are", async () => {
    const brand = await db.store();
    const booth = await db.service(brand, { capacity: 2 });
    const day = db.day(12);
    const states = async () =>
      (await db.availability(brand, [booth.id], day, day)).map((row) => [row.state, row.remaining]);

    expect(await states()).toEqual([["available", 2]]);
    await db.staff(brand, day, "10:00", 180, [{ product_id: booth.id }]);
    expect(await states()).toEqual([["available", 1]]);
    await db.staff(brand, day, "18:00", 180, [{ product_id: booth.id }]);
    expect(await states()).toEqual([["full", 0]]);
  });

  it("report closed and blocked days, and leave out an inactive or unknown service", async () => {
    const closedDay = db.day(12);
    const weekday = (
      await db.one<{ dow: number }>("select extract(dow from $1::date)::int as dow", [closedDay])
    ).dow;
    const brand = await db.store({ closedWeekdays: [weekday] });
    const booth = await db.service(brand, { capacity: 1 });
    const hidden = await db.service(brand, { capacity: 1, active: false });
    const blocked = db.day(13);
    await db.pg.query(
      "insert into booking_blocks (brand_id, starts_on, ends_on) values ($1, $2, $2)",
      [brand, blocked],
    );

    const rows = await db.availability(
      brand,
      [booth.id, hidden.id, "00000000-0000-4000-8000-0000000000ff"],
      closedDay,
      blocked,
    );
    expect(rows.map((row) => [row.day, row.state])).toEqual([
      [closedDay, "closed"],
      [blocked, "blocked"],
    ]);
    expect(rows.every((row) => row.product_id === booth.id)).toBe(true);
  });

  it("count the free start times of an hourly service", async () => {
    const brand = await db.store();
    const pool = await db.service(brand, { capacity: 1, scope: "time" });
    const day = db.day(12);
    const free = async () => (await db.availability(brand, [pool.id], day, day, 60))[0];

    // 10:00 to 22:00 every half hour: 25 starts.
    expect(await free()).toMatchObject({ state: "available", remaining: 25 });
    await db.staff(brand, day, "12:00", 120, [{ product_id: pool.id }]); // 12:00-14:00
    // 11:30 to 13:30 (5 starts) now clash.
    expect(await free()).toMatchObject({ state: "available", remaining: 20 });
    // All day taken: no start left.
    await db.staff(brand, day, "10:00", 120, [{ product_id: pool.id }]);
    await db.staff(brand, day, "14:00", 480, [{ product_id: pool.id }]); // to 22:00
    // 22:00 only touches the end of that booking: still free.
    expect(await free()).toMatchObject({ state: "available", remaining: 1 });
    await db.staff(brand, day, "22:00", 60, [{ product_id: pool.id }]);
    expect(await free()).toMatchObject({ state: "full", remaining: 0 });
  });

  it("refuse a bad question", async () => {
    const brand = await db.store();
    const booth = await db.service(brand, { capacity: 1 });
    const bad = await db.refusal(db.availability(brand, [booth.id], db.day(12), db.day(200)));
    expect(bad?.message).toBe("BOOKING_RANGE_INVALID");
    expect((await db.refusal(db.availability(brand, [], db.day(12), db.day(13))))?.message).toBe(
      "BOOKING_RANGE_INVALID",
    );
  });

  it("answer nothing for a store without bookings", async () => {
    const brand = await db.one<{ id: string }>("insert into brands default values returning id");
    const booth = await db.service(brand.id, { capacity: 1 });
    expect(await db.availability(brand.id, [booth.id], db.day(12), db.day(13))).toEqual([]);
  });
});

describe("the free start times of a day", () => {
  it("disable the times that clash with a booking, buffer included", async () => {
    const brand = await db.store();
    const pool = await db.service(brand, { capacity: 1, scope: "time", buffer: 30 });
    const day = db.day(12);
    await db.staff(brand, day, "12:00", 120, [{ product_id: pool.id }]); // 12:00-14:00

    const rows = await db.starts(brand, day, [pool.id], 60);
    const at = (time: string) => rows.find((row) => row.start_time === time);
    expect(at("10:00")?.free).toBe(true);
    expect(at("10:30")?.free).toBe(true); // ends 11:30, the clean-up ends 12:00
    expect(at("11:00")).toMatchObject({ free: false, reason: "taken" });
    expect(at("13:30")).toMatchObject({ free: false, reason: "taken" });
    expect(at("14:00")).toMatchObject({ free: false, reason: "taken" }); // still cleaning
    expect(at("14:30")?.free).toBe(true);
    expect(rows).toHaveLength(25);
  });

  it("need every chosen service to be free", async () => {
    const brand = await db.store();
    const pool = await db.service(brand, { capacity: 1, scope: "time" });
    const lights = await db.service(brand, { capacity: 1, scope: "time" });
    const day = db.day(12);
    await db.staff(brand, day, "12:00", 60, [{ product_id: lights.id }]);
    const rows = await db.starts(brand, day, [pool.id, lights.id], 60);
    expect(rows.find((row) => row.start_time === "12:00")?.free).toBe(false);
    expect(rows.find((row) => row.start_time === "15:00")?.free).toBe(true);
    // The pool alone is free at 12:00.
    const alone = await db.starts(brand, day, [pool.id], 60);
    expect(alone.find((row) => row.start_time === "12:00")?.free).toBe(true);
  });

  it("say why a day cannot be booked", async () => {
    const brand = await db.store({ dailyCapacity: 1 });
    const plain = await db.service(brand, { capacity: null });
    const booth = await db.service(brand, { capacity: 2 });
    const day = db.day(12);
    await db.staff(brand, day, "10:00", 180, [{ product_id: plain.id }]); // the store's one place

    const plainRows = await db.starts(brand, day, [plain.id], 60);
    expect(plainRows.every((row) => !row.free && row.reason === "full")).toBe(true);
    // A service governed by its own capacity is not held up by the store's place.
    expect((await db.starts(brand, day, [booth.id], 60)).every((row) => row.free)).toBe(true);
  });

  it("refuse a bad question", async () => {
    const brand = await db.store();
    const booth = await db.service(brand, { capacity: 1 });
    expect((await db.refusal(db.starts(brand, db.day(12), [booth.id], 5)))?.message).toBe(
      "BOOKING_RANGE_INVALID",
    );
  });
});

describe("requests, holds and confirmations", () => {
  it("refuse a request for a service with no room, and take no place while it waits", async () => {
    const brand = await db.store();
    const booth = await db.service(brand, { capacity: 1 });
    const day = db.day(12);
    const item = [{ product_id: booth.id }];

    const request = await db.request(brand, day, "10:00", 180, item);
    expect(request.status).toBe("requested");
    // A request takes no place: a second customer can ask for the same unit.
    const second = await db.request(brand, day, "10:00", 180, item);
    expect(second.reference).not.toBe(request.reference);

    // Once one is confirmed, a new request is refused.
    await db.staff(brand, day, "10:00", 180, item);
    expect((await db.refusal(db.request(brand, day, "10:00", 180, item)))?.message).toBe(FULL);
  });

  it("confirm the first request and refuse the second for the same last unit", async () => {
    const brand = await db.store();
    const booth = await db.service(brand, { capacity: 1 });
    const day = db.day(12);
    const item = [{ product_id: booth.id }];
    const one = await db.request(brand, day, "10:00", 180, item);
    const two = await db.request(brand, day, "10:00", 180, item);
    const idOf = async (reference: unknown) =>
      (await db.one<{ id: string }>("select id from bookings where reference = $1", [reference]))
        .id;

    await db.pg.query("select set_booking_status($1, 'confirmed')", [await idOf(one.reference)]);
    const refused = await db.refusal(
      db.pg.query("select set_booking_status($1, 'confirmed')", [await idOf(two.reference)]),
    );
    expect(refused?.message).toBe(FULL);
  });

  it("count a running checkout hold, and not one that ran out", async () => {
    const brand = await db.store();
    const booth = await db.service(brand, { capacity: 1 });
    const day = db.day(12);
    const item = [{ product_id: booth.id }];
    const held = await db.request(brand, day, "10:00", 180, item);
    // What hold_booking does after request_booking: the booking becomes a hold.
    await db.pg.query(
      "update bookings set status = 'hold', hold_expires_at = now() + interval '15 minutes' where reference = $1",
      [held.reference],
    );
    expect((await db.refusal(db.request(brand, day, "10:00", 180, item)))?.message).toBe(FULL);

    await db.pg.query(
      "update bookings set hold_expires_at = now() - interval '1 minute' where reference = $1",
      [held.reference],
    );
    const again = await db.request(brand, day, "10:00", 180, item);
    expect(again.status).toBe("requested");
  });

  it("let an expired hold be paid only while its service still has room", async () => {
    const brand = await db.store();
    const booth = await db.service(brand, { capacity: 1 });
    const day = db.day(12);
    const item = [{ product_id: booth.id }];
    const held = await db.request(brand, day, "10:00", 180, item);
    const id = (
      await db.one<{ id: string }>("select id from bookings where reference = $1", [held.reference])
    ).id;
    await db.pg.query(
      "update bookings set status = 'expired', hold_expires_at = now() - interval '1 hour' where id = $1",
      [id],
    );
    // What place_booking_order asks before it accepts an expired hold.
    await db.pg.query("select assert_booking_services_free($1)", [id]);
    await db.staff(brand, day, "10:00", 180, item);
    expect(
      (await db.refusal(db.pg.query("select assert_booking_services_free($1)", [id])))?.message,
    ).toBe(FULL);
  });

  it("do not govern bookings of other stores", async () => {
    const mine = await db.store();
    const theirs = await db.store();
    const booth = await db.service(mine, { capacity: 1 });
    const other = await db.service(theirs, { capacity: 1 });
    const day = db.day(12);
    await db.staff(mine, day, "10:00", 180, [{ product_id: booth.id }]);
    await db.staff(theirs, day, "10:00", 180, [{ product_id: other.id }]);
    // A product id from another store is not this store's service.
    const stranger = await db.refusal(
      db.request(mine, day, "10:00", 180, [{ product_id: other.id }]),
    );
    expect(stranger?.message).toBe("BOOKING_PRODUCT_NOT_FOUND");
  });
});

describe("what the public may call", () => {
  const can = async (role: string, signature: string) =>
    (
      await db.one<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [
        role,
        signature,
      ])
    ).ok;

  it("lets the storefront ask for availability, and keeps the internals private", async () => {
    expect(
      await can("anon", "public.get_service_availability(uuid, uuid[], date, date, integer)"),
    ).toBe(true);
    expect(await can("anon", "public.get_service_free_starts(uuid, date, uuid[], integer)")).toBe(
      true,
    );
    for (const internal of [
      "public.booking_service_units_used(uuid, uuid, date, timestamptz, timestamptz, uuid)",
      "public.booking_service_has_room(uuid, uuid, date, timestamptz, timestamptz, integer, uuid)",
      "public.assert_booking_services_free(uuid)",
      "public.booking_is_governed(uuid)",
    ]) {
      expect(await can("anon", internal)).toBe(false);
      expect(await can("authenticated", internal)).toBe(false);
    }
  });
});
