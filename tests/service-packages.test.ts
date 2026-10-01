import { beforeAll, describe, expect, it, vi } from "vitest";
import { createEngineDb, type EngineDb } from "./helpers/booking-engine-db";

// Packages: a service made of other services at its own price. Run for real in
// Postgres (PGlite): a booked package holds each included service's capacity.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: EngineDb;
beforeAll(async () => {
  db = await createEngineDb();
});

type Line = {
  product_id: string;
  name_en: string | null;
  quantity: number;
  unit_price: string;
  parent_item_id: string | null;
};
const linesOf = (bookingId: string) =>
  db.rows<Line>(
    `select product_id, name_en, quantity, unit_price, parent_item_id
       from booking_items where booking_id = $1 order by (parent_item_id is not null), name_en`,
    [bookingId],
  );
const bookingByRef = (reference: string) =>
  db.one<{ id: string; total: string; status: string }>(
    "select id, total, status from bookings where reference = $1",
    [reference],
  );

/** A store with a booth (2 of them, whole days) and prints (no limit of their own). */
async function wedding() {
  const brand = await db.store({ dailyCapacity: 1, leadDays: 0 });
  const booth = await db.service(brand, { name: "Booth", capacity: 1 });
  const backdrop = await db.service(brand, { name: "Backdrop", capacity: 2 });
  const prints = await db.service(brand, { name: "Prints" });
  return { brand, booth, backdrop, prints };
}

describe("a booked package", () => {
  it("is one priced line with its included services under it, unpriced", async () => {
    const { brand, booth, backdrop } = await wedding();
    const pkg = await db.servicePackage(
      brand,
      [{ id: booth.id }, { id: backdrop.id, quantity: 2 }],
      {
        name: "Wedding night",
        price: 90,
      },
    );
    const asked = await db.request(brand, db.day(5), "18:00", 120, [
      { product_id: pkg.id, variant_id: pkg.variantId },
    ]);
    expect(asked).toMatchObject({ status: "requested", total: 90 });

    const lines = await linesOf((await bookingByRef(String(asked.reference))).id);
    expect(
      lines.map((l) => [l.name_en, l.quantity, Number(l.unit_price), l.parent_item_id !== null]),
    ).toEqual([
      ["Wedding night", 1, 90, false],
      ["Backdrop", 2, 0, true],
      ["Booth", 1, 0, true],
    ]);
    const parent = lines.find((l) => l.parent_item_id === null)!;
    expect(
      lines.filter((l) => l.parent_item_id !== null).every((l) => l.parent_item_id !== null),
    ).toBe(true);
    expect(parent.product_id).toBe(pkg.id);
  });

  it("multiplies what it includes by how many are booked", async () => {
    const { brand, booth, backdrop } = await wedding();
    const pkg = await db.servicePackage(
      brand,
      [{ id: booth.id }, { id: backdrop.id, quantity: 2 }],
      {
        price: 50,
      },
    );
    const made = await db.staff(brand, db.day(5), "18:00", 120, [
      {
        product_id: pkg.id,
        variant_id: pkg.variantId,
        unit_price: 50,
        quantity: 1,
        name_en: "Pkg",
      },
    ]);
    const lines = await linesOf(made.id);
    expect(lines.filter((l) => l.parent_item_id).map((l) => [l.name_en, l.quantity])).toEqual([
      ["Backdrop", 2],
      ["Booth", 1],
    ]);
  });
});

describe("a package holds each included service's capacity", () => {
  it("blocks the booth for another booking of the booth, or of another package with it", async () => {
    const { brand, booth, backdrop } = await wedding();
    const pkg = await db.servicePackage(brand, [{ id: booth.id }, { id: backdrop.id }]);
    const other = await db.servicePackage(brand, [{ id: booth.id }], { name: "Booth only" });
    await db.staff(brand, db.day(5), "18:00", 120, [
      { product_id: pkg.id, variant_id: pkg.variantId, unit_price: 100, name_en: "Pkg" },
    ]);
    // The same day: the one booth is taken, by a booking of it or of a package with it.
    expect(
      (
        await db.refusal(
          db.staff(brand, db.day(5), "12:00", 60, [
            { product_id: booth.id, variant_id: booth.variantId },
          ]),
        )
      )?.message,
    ).toBe("BOOKING_SERVICE_FULL");
    expect(
      (
        await db.refusal(
          db.staff(brand, db.day(5), "12:00", 60, [
            { product_id: other.id, variant_id: other.variantId },
          ]),
        )
      )?.message,
    ).toBe("BOOKING_SERVICE_FULL");
    // Another day is free.
    await db.staff(brand, db.day(6), "12:00", 60, [
      { product_id: other.id, variant_id: other.variantId },
    ]);
  });

  it("is blocked by a booking of one of its services, and counts what is booked", async () => {
    const { brand, booth, backdrop } = await wedding();
    const pkg = await db.servicePackage(brand, [
      { id: booth.id },
      { id: backdrop.id, quantity: 2 },
    ]);
    // Two backdrops are used on the day...
    await db.staff(brand, db.day(5), "10:00", 60, [
      { product_id: backdrop.id, variant_id: backdrop.variantId, quantity: 1 },
    ]);
    // ...so a package needing two cannot be booked, but one booth alone still can.
    expect(
      (
        await db.refusal(
          db.staff(brand, db.day(5), "12:00", 60, [
            { product_id: pkg.id, variant_id: pkg.variantId },
          ]),
        )
      )?.detail,
    ).toBe(backdrop.id);
    await db.staff(brand, db.day(5), "12:00", 60, [
      { product_id: booth.id, variant_id: booth.variantId },
    ]);
  });

  it("does not use the store's daily places when everything in it has its own capacity", async () => {
    const { brand, booth, backdrop, prints } = await wedding();
    const governed = await db.servicePackage(brand, [{ id: booth.id }, { id: backdrop.id }], {
      name: "Governed",
    });
    const mixed = await db.servicePackage(brand, [{ id: backdrop.id }, { id: prints.id }], {
      name: "Mixed",
    });
    // The store takes one booking a day. A governed package leaves that place free...
    await db.staff(brand, db.day(5), "10:00", 60, [
      { product_id: governed.id, variant_id: governed.variantId },
    ]);
    expect((await db.dayState(brand, db.day(5))).state).toBe("available");
    // ...a package with a service of no limit of its own takes it.
    await db.staff(brand, db.day(5), "12:00", 60, [
      { product_id: mixed.id, variant_id: mixed.variantId },
    ]);
    expect((await db.dayState(brand, db.day(5))).state).toBe("full");
  });

  it("asks for the longest notice of what it includes", async () => {
    const brand = await db.store({ dailyCapacity: 5, leadDays: 0 });
    const cake = await db.service(brand, { name: "Cake", notice: 24 * 7 });
    const booth = await db.service(brand, { name: "Booth" });
    const pkg = await db.servicePackage(brand, [{ id: booth.id }, { id: cake.id }]);
    const refused = await db.refusal(
      db.request(brand, db.day(3), "18:00", 120, [
        { product_id: pkg.id, variant_id: pkg.variantId },
      ]),
    );
    expect(refused?.message).toMatch(/BOOKING_DAY_(PAST|FULL)/);
    const ok = await db.request(brand, db.day(9), "18:00", 120, [
      { product_id: pkg.id, variant_id: pkg.variantId },
    ]);
    expect(ok.status).toBe("requested");
  });
});

describe("what a customer is offered", () => {
  it("shows a package's days and start times as those of its services", async () => {
    const { brand, booth, backdrop } = await wedding();
    const pkg = await db.servicePackage(brand, [{ id: booth.id }, { id: backdrop.id }]);
    await db.staff(brand, db.day(5), "10:00", 60, [
      { product_id: booth.id, variant_id: booth.variantId },
    ]);
    const days = await db.availability(brand, [pkg.id], db.day(5), db.day(6));
    expect(days.map((row) => [row.day, row.state]).sort()).toEqual(
      expect.arrayContaining([
        [db.day(5), "full"],
        [db.day(6), "available"],
      ]),
    );
    // The rows are the included services', not the package's own id.
    expect(days.every((row) => row.product_id !== pkg.id)).toBe(true);
  });

  it("shows free start times for a package from its time-scoped services", async () => {
    const brand = await db.store({
      dailyCapacity: 5,
      leadDays: 0,
      openTime: "10:00",
      lastStart: "13:00",
      slot: 60,
    });
    const court = await db.service(brand, { name: "Court", capacity: 1, scope: "time" });
    const pkg = await db.servicePackage(brand, [{ id: court.id }]);
    await db.staff(brand, db.day(5), "11:00", 60, [
      { product_id: court.id, variant_id: court.variantId },
    ]);
    const starts = await db.starts(brand, db.day(5), [pkg.id], 60);
    expect(starts.map((row) => [row.start_time, row.free])).toEqual([
      ["10:00", true],
      ["11:00", false],
      ["12:00", true],
      ["13:00", true],
    ]);
  });
});

describe("a package's order", () => {
  it("lists what it includes, free, under the priced package line", async () => {
    const { brand, booth, backdrop } = await wedding();
    const pkg = await db.servicePackage(brand, [{ id: booth.id }, { id: backdrop.id }], {
      price: 80,
    });
    const made = await db.staff(brand, db.day(5), "18:00", 120, [
      { product_id: pkg.id, variant_id: pkg.variantId, unit_price: 80, name_en: "Wedding night" },
    ]);
    const order = await db.rows<{ description: string; unit_price: string; line_total: string }>(
      `select oi.description, oi.unit_price, oi.line_total
         from order_items oi join bookings b on b.order_id = oi.order_id
        where b.id = $1 order by oi.description`,
      [made.id],
    );
    expect(order.map((l) => [l.description, Number(l.line_total)])).toEqual([
      ["Wedding night", 80],
      ["↳ Backdrop", 0],
      ["↳ Booth", 0],
    ]);
    const total = await db.one<{ total: string }>(
      "select o.total from orders o join bookings b on b.order_id = o.id where b.id = $1",
      [made.id],
    );
    expect(Number(total.total)).toBe(80);
  });

  it("is held for checkout as the package line alone", async () => {
    const { brand, booth, backdrop } = await wedding();
    await db.pg.query("update business_settings set storefront_mode = 'shop' where brand_id = $1", [
      brand,
    ]);
    const pkg = await db.servicePackage(brand, [{ id: booth.id }, { id: backdrop.id }], {
      price: 70,
    });
    const held = await db.one<{
      hold_booking: { items: Array<{ product_id: string; unit_price: number }> };
    }>(
      `select hold_booking($1, $2::date, '18:00'::time, 120, $3::jsonb, $4::jsonb, '{}'::jsonb, null)`,
      [
        brand,
        db.day(5),
        db.items([{ product_id: pkg.id, variant_id: pkg.variantId }]),
        db.asJson({ name: "Sara", phone: "39990017" }),
      ],
    );
    expect(held.hold_booking.items.map((i) => [i.product_id, Number(i.unit_price)])).toEqual([
      [pkg.id, 70],
    ]);
  });
});

describe("what a package may be made of", () => {
  it("is services of the same store, never another package", async () => {
    const { brand, booth } = await wedding();
    const other = await db.store({ dailyCapacity: 1 });
    const foreign = await db.service(other, { name: "Foreign" });
    const pkg = await db.servicePackage(brand, [{ id: booth.id }]);
    const inner = await db.servicePackage(brand, [{ id: booth.id }], { name: "Inner" });
    const add = (packageId: string, productId: string) =>
      db.pg.query(
        "insert into service_package_items (brand_id, package_id, product_id) values ($1, $2, $3)",
        [brand, packageId, productId],
      );
    expect((await db.refusal(add(pkg.id, foreign.id)))?.message).toBe("PACKAGE_ITEM_INVALID");
    expect((await db.refusal(add(pkg.id, inner.id)))?.message).toBe("PACKAGE_ITEM_INVALID");
    expect((await db.refusal(add(pkg.id, pkg.id)))?.message).toMatch(
      /PACKAGE_ITEM_INVALID|violates check/,
    );
    // The package itself must be a package.
    expect((await db.refusal(add(booth.id, pkg.id)))?.message).toBe("PACKAGE_INVALID");
    // A service that is included in a package cannot become a package.
    expect(
      (
        await db.refusal(
          db.pg.query("update products set is_package = true where id = $1", [booth.id]),
        )
      )?.message,
    ).toBe("PACKAGE_ITEM_INVALID");
  });

  it("keeps the helpers out of reach of the browser", async () => {
    const grants = await db.rows<{ fn: string; anon: boolean; authed: boolean }>(
      `select fn, has_function_privilege('anon', fn, 'execute') as anon,
              has_function_privilege('authenticated', fn, 'execute') as authed
         from unnest(array[
           'booking_expand_product_ids(uuid, uuid[])', 'booking_rule_items(uuid, jsonb)',
           'expand_booking_packages(uuid)'
         ]) as fn`,
    );
    expect(grants.every((g) => !g.anon && !g.authed)).toBe(true);
  });
});
