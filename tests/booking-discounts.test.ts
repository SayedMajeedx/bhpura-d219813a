import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  bestDiscount,
  describeDiscountRule,
  discountFormColumns,
  discountFormError,
  discountFormFrom,
  discountName,
  EMPTY_DISCOUNT_FORM,
  leadDays,
  ruleApplies,
  weekdayOf,
  type DiscountRule,
} from "../src/lib/bookings/discounts";
import { createEngineDb, type EngineDb } from "./helpers/booking-engine-db";

// Booking-time discounts: the rule run for real in Postgres (PGlite), and the
// same rule in TypeScript (what the storefront shows) checked against it.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: EngineDb;
beforeAll(async () => {
  db = await createEngineDb();
});

type RuleInput = {
  name?: string;
  kind?: "percent" | "fixed";
  value: number;
  min?: number;
  max?: number | null;
  weekdays?: number[] | null;
  products?: string[] | null;
  from?: string | null;
  to?: string | null;
  active?: boolean;
};

const arrayText = (values: Array<string | number> | null | undefined) =>
  values && values.length ? `{${values.join(",")}}` : null;

const addRule = (brand: string, r: RuleInput) =>
  db.one<{ id: string }>(
    `insert into booking_discount_rules (brand_id, name_en, name_ar, kind, value, min_days, max_days,
       weekdays, product_ids, valid_from, valid_to, is_active)
     values ($1, $2, $2, $3, $4, $5, $6, $7::smallint[], $8::uuid[], $9, $10, $11) returning id`,
    [
      brand,
      r.name ?? "Offer",
      r.kind ?? "percent",
      r.value,
      r.min ?? 0,
      r.max ?? null,
      arrayText(r.weekdays),
      arrayText(r.products),
      r.from ?? null,
      r.to ?? null,
      r.active ?? true,
    ],
  );

type BookingRow = {
  id: string;
  total: string;
  discount_amount: string;
  discount_label_en: string | null;
  order_id: string | null;
  travel_fee: string | null;
};
const bookingOf = (id: string) =>
  db.one<BookingRow>(
    "select id, total, discount_amount, discount_label_en, order_id, travel_fee from bookings where id = $1",
    [id],
  );
const staffBooking = (
  brand: string,
  offset: number,
  svc: { id: string; variantId: string },
  price = 100,
  quantity = 1,
) =>
  db.staff(brand, db.day(offset), "12:00", 60, [
    { product_id: svc.id, variant_id: svc.variantId, unit_price: price, quantity },
  ]);
const discountOf = async (brand: string, offset: number, svc: { id: string; variantId: string }) =>
  Number((await bookingOf((await staffBooking(brand, offset, svc)).id)).discount_amount);

describe("a store's discount rules", () => {
  it("take nothing off when there are none", async () => {
    const brand = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const svc = await db.service(brand);
    const made = await bookingOf((await staffBooking(brand, 3, svc)).id);
    expect([Number(made.discount_amount), Number(made.total), made.discount_label_en]).toEqual([
      0,
      100,
      null,
    ]);
  });

  it("give 25% within a day, 10% within a week, and nothing beyond", async () => {
    const brand = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const svc = await db.service(brand);
    await addRule(brand, { name: "Last minute", value: 25, min: 0, max: 1 });
    await addRule(brand, { name: "This week", value: 10, min: 2, max: 7 });
    expect(await discountOf(brand, 1, svc)).toBe(25);
    expect(await discountOf(brand, 2, svc)).toBe(10);
    expect(await discountOf(brand, 7, svc)).toBe(10);
    expect(await discountOf(brand, 8, svc)).toBe(0);
    const near = await bookingOf((await staffBooking(brand, 1, svc)).id);
    expect(near.discount_label_en).toBe("Last minute");
    expect(Number(near.total)).toBe(75);
  });

  it("reward booking ahead as well, with a fixed amount, up to the services' price", async () => {
    const brand = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const svc = await db.service(brand);
    await addRule(brand, { kind: "fixed", value: 15, min: 30 });
    await addRule(brand, { kind: "fixed", value: 500, min: 60 });
    expect(await discountOf(brand, 29, svc)).toBe(0);
    expect(await discountOf(brand, 30, svc)).toBe(15);
    // A fixed discount is never more than the services cost.
    expect(await discountOf(brand, 60, svc)).toBe(100);
  });

  it("apply the best one when several match, never both", async () => {
    const brand = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const svc = await db.service(brand);
    await addRule(brand, { value: 10, min: 0, max: 14 });
    await addRule(brand, { kind: "fixed", value: 12, min: 0, max: 14 });
    await addRule(brand, { value: 5, min: 0, max: 14 });
    expect(await discountOf(brand, 5, svc)).toBe(12);
  });

  it("can be limited to some services, some weekdays and some booking dates", async () => {
    const brand = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const booth = await db.service(brand, { name: "Booth" });
    const prints = await db.service(brand, { name: "Prints" });
    await addRule(brand, { value: 50, products: [prints.id] });
    // Only the prints' share is discounted.
    const both = await db.staff(brand, db.day(3), "12:00", 60, [
      { product_id: booth.id, variant_id: booth.variantId, unit_price: 100 },
      { product_id: prints.id, variant_id: prints.variantId, unit_price: 40 },
    ]);
    expect(Number((await bookingOf(both.id)).discount_amount)).toBe(20);
    expect(await discountOf(brand, 3, booth)).toBe(0);

    const other = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const svc = await db.service(other);
    const day = db.day(4);
    const weekday = weekdayOf(day);
    await addRule(other, { value: 20, weekdays: [weekday] });
    expect(await discountOf(other, 4, svc)).toBe(20);
    expect(await discountOf(other, 5, svc)).toBe(0);

    const dated = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const datedSvc = await db.service(dated);
    await addRule(dated, { value: 10, from: db.day(1), to: db.day(2) });
    expect(await discountOf(dated, 5, datedSvc)).toBe(0);
    await db.pg.query(
      "update booking_discount_rules set valid_from = $2, valid_to = $3 where brand_id = $1",
      [dated, db.day(-1), db.day(1)],
    );
    expect(await discountOf(dated, 5, datedSvc)).toBe(10);
  });

  it("ignore a switched-off rule and another store's rules", async () => {
    const brand = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const rival = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const svc = await db.service(brand);
    await addRule(brand, { value: 30, active: false });
    await addRule(rival, { value: 30 });
    expect(await discountOf(brand, 3, svc)).toBe(0);
  });
});

describe("a booking with a discount", () => {
  it("adds the travel fee after the discount, and reports it to the customer", async () => {
    const brand = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const svc = await db.service(brand);
    await addRule(brand, { name: "Soon", value: 20, min: 0, max: 7 });
    await db.pg.query(
      "insert into booking_area_fees (brand_id, area_code, fee) values ($1, 'juffair', 5)",
      [brand],
    );
    const result = await db
      .one<{ request_booking: Record<string, unknown> }>(
        `select request_booking($1, $2::date, '12:00'::time, 60, $3::jsonb, $4::jsonb, $5::jsonb, null)`,
        [
          brand,
          db.day(3),
          db.items([{ product_id: svc.id, variant_id: svc.variantId }]),
          db.asJson({ name: "Sara", phone: "39990017" }),
          db.asJson({ area_code: "juffair" }),
        ],
      )
      .then((row) => row.request_booking);
    // 40 for the service, 20% off, 5 travel.
    expect(result).toMatchObject({ discount: 8, total: 37, travel_fee: 5 });
  });

  it("is invoiced with its discount, VAT after it", async () => {
    const brand = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const svc = await db.service(brand);
    await db.pg.query("update business_settings set default_tax_rate = 10 where brand_id = $1", [
      brand,
    ]);
    await addRule(brand, { name: "Soon", value: 25, min: 0, max: 7 });
    const made = await bookingOf((await staffBooking(brand, 3, svc, 100)).id);
    const order = await db.one<{
      subtotal: string;
      discount: string;
      tax_amount: string;
      total: string;
      notes: string;
    }>("select subtotal, discount, tax_amount, total, notes from orders where id = $1", [
      made.order_id,
    ]);
    expect([
      Number(order.subtotal),
      Number(order.discount),
      Number(order.tax_amount),
      Number(order.total),
    ]).toEqual([100, 25, 7.5, 82.5]);
    expect(order.notes).toContain("Soon");
  });
});

describe("a discount set by staff", () => {
  it("replaces the rule's, shows on the booking and its order, and can be cleared", async () => {
    const brand = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const svc = await db.service(brand);
    await addRule(brand, { value: 10, min: 0, max: 7 });
    const made = await bookingOf((await staffBooking(brand, 3, svc, 100)).id);
    expect(Number(made.discount_amount)).toBe(10);

    const set = await db.one<{ discount_amount: string; total: string; discount_label_en: string }>(
      "select * from set_booking_discount($1, 30, 'Friend of the house')",
      [made.id],
    );
    expect([Number(set.discount_amount), Number(set.total), set.discount_label_en]).toEqual([
      30,
      70,
      "Friend of the house",
    ]);
    const order = await db.one<{ discount: string; total: string }>(
      "select discount, total from orders where id = $1",
      [made.order_id],
    );
    expect([Number(order.discount), Number(order.total)]).toEqual([30, 70]);

    const cleared = await db.one<{
      discount_amount: string;
      total: string;
      discount_label_en: string | null;
    }>("select * from set_booking_discount($1, 0)", [made.id]);
    expect([
      Number(cleared.discount_amount),
      Number(cleared.total),
      cleared.discount_label_en,
    ]).toEqual([0, 100, null]);
  });

  it("refuses more than the services cost, and a cancelled booking", async () => {
    const brand = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const svc = await db.service(brand);
    const made = await bookingOf((await staffBooking(brand, 3, svc, 100)).id);
    expect(
      (await db.refusal(db.one("select * from set_booking_discount($1, 101)", [made.id])))?.message,
    ).toBe("BOOKING_DISCOUNT_INVALID");
    await db.one("select * from set_booking_status($1, 'cancelled', null)", [made.id]);
    expect(
      (await db.refusal(db.one("select * from set_booking_discount($1, 5)", [made.id])))?.message,
    ).toBe("BOOKING_TRANSITION_INVALID");
  });
});

describe("what the storefront may read", () => {
  it("is the active rules of a store that takes bookings, and nothing internal", async () => {
    const brand = await db.store({ dailyCapacity: 50, leadDays: 0 });
    await addRule(brand, { name: "On", value: 10 });
    await addRule(brand, { name: "Off", value: 20, active: false });
    const rows = await db.rows<{ name_en: string }>(
      "select name_en from get_booking_discounts($1)",
      [brand],
    );
    expect(rows.map((row) => row.name_en)).toEqual(["On"]);
    expect(await db.rows("select * from get_booking_discounts($1)", [brand])).toHaveLength(1);

    const grants = await db.rows<{ fn: string; anon: boolean; authed: boolean }>(
      `select fn, has_function_privilege('anon', fn, 'execute') as anon,
              has_function_privilege('authenticated', fn, 'execute') as authed
         from unnest(array[
           'get_booking_discounts(uuid)', 'apply_booking_discount(uuid)',
           'reprice_order_totals(uuid)', 'set_booking_discount(uuid, numeric, text)'
         ]) as fn`,
    );
    expect(Object.fromEntries(grants.map((g) => [g.fn.split("(")[0], [g.anon, g.authed]]))).toEqual(
      {
        get_booking_discounts: [true, true],
        apply_booking_discount: [false, false],
        reprice_order_totals: [false, false],
        set_booking_discount: [false, true],
      },
    );
  });
});

describe("the TypeScript rule agrees with the database", () => {
  it("gives the same discount across rules, services and days", async () => {
    const brand = await db.store({ dailyCapacity: 50, leadDays: 0 });
    const booth = await db.service(brand, { name: "Booth" });
    const prints = await db.service(brand, { name: "Prints" });
    await addRule(brand, { value: 25, min: 0, max: 1 });
    await addRule(brand, { value: 10, min: 2, max: 7 });
    await addRule(brand, { kind: "fixed", value: 15, min: 14, weekdays: [0, 1, 2, 3, 4, 5, 6] });
    await addRule(brand, { value: 40, min: 3, max: 20, products: [prints.id] });
    await addRule(brand, { kind: "fixed", value: 8, min: 5, max: 9, weekdays: [1, 3, 5] });
    await addRule(brand, { value: 12, min: 0, active: false });

    const stored = await db.rows<Record<string, unknown>>(
      `select id, name_en, name_ar, kind, value::float8 as value, min_days, max_days, weekdays,
              product_ids, to_char(valid_from, 'YYYY-MM-DD') as valid_from,
              to_char(valid_to, 'YYYY-MM-DD') as valid_to
         from booking_discount_rules where brand_id = $1 and is_active order by created_at`,
      [brand],
    );
    const rules = stored.map((row) => ({
      ...row,
      weekdays: (row.weekdays as number[] | null) ?? null,
    })) as DiscountRule[];

    const lines = [
      { product_id: booth.id, line_total: 70 },
      { product_id: prints.id, line_total: 30 },
    ];
    for (const lead of [1, 2, 3, 5, 6, 7, 8, 9, 14, 15, 20, 21, 40]) {
      const made = await db.staff(brand, db.day(lead), "12:00", 60, [
        { product_id: booth.id, variant_id: booth.variantId, unit_price: 70 },
        { product_id: prints.id, variant_id: prints.variantId, unit_price: 30 },
      ]);
      const sql = Number((await bookingOf(made.id)).discount_amount);
      const ts = bestDiscount(rules, { day: db.day(lead), today: db.day(0), lines })?.amount ?? 0;
      expect(ts, `lead ${lead}`).toBe(sql);
    }
  });
});

describe("a rule in words and in its form", () => {
  const rule = (patch: Partial<DiscountRule>): DiscountRule => ({
    id: "r",
    name_en: null,
    name_ar: null,
    kind: "percent",
    value: 25,
    min_days: 0,
    max_days: 1,
    weekdays: null,
    product_ids: null,
    valid_from: null,
    valid_to: null,
    ...patch,
  });

  it("counts days and weekdays like the database", () => {
    expect(leadDays("2026-10-08", "2026-10-01")).toBe(7);
    expect(weekdayOf("2026-10-04")).toBe(0);
    expect(ruleApplies(rule({ min_days: 2, max_days: 7 }), "2026-10-08", "2026-10-01")).toBe(true);
    expect(ruleApplies(rule({ min_days: 2, max_days: 7 }), "2026-10-09", "2026-10-01")).toBe(false);
    expect(ruleApplies(rule({ weekdays: [1] }), "2026-10-04", "2026-10-03")).toBe(false);
  });

  it("is described for the merchant and the customer", () => {
    expect(describeDiscountRule(rule({}), false)).toBe("25% off · within 1 day");
    expect(describeDiscountRule(rule({ min_days: 2, max_days: 7, value: 10 }), false)).toBe(
      "10% off · 2 to 7 days ahead",
    );
    expect(
      describeDiscountRule(rule({ kind: "fixed", value: 5, min_days: 30, max_days: null }), false),
    ).toBe("5 off · 30+ days ahead");
    expect(describeDiscountRule(rule({ weekdays: [2, 0] }), false)).toBe(
      "25% off · within 1 day · Sun, Tue",
    );
    expect(describeDiscountRule(rule({}), true)).toBe("خصم 25% · خلال يوم");
    expect(discountName(rule({ name_en: "Last minute" }), false)).toBe("Last minute");
    expect(discountName(rule({ name_en: "Last minute" }), true)).toBe("Last minute");
    expect(discountName(rule({}), false)).toBe("25% off · within 1 day");
  });

  it("reads and writes the merchant's form, and refuses nonsense", () => {
    const form = { ...EMPTY_DISCOUNT_FORM, value: "25", min_days: "0", max_days: "1" };
    expect(discountFormError(form, false)).toBeNull();
    expect(discountFormColumns(form)).toMatchObject({
      kind: "percent",
      value: 25,
      min_days: 0,
      max_days: 1,
      weekdays: null,
      product_ids: null,
      is_active: true,
    });
    expect(discountFormError({ ...form, value: "" }, false)).toMatch(/Enter the discount/);
    expect(discountFormError({ ...form, value: "120" }, false)).toMatch(/over 100%/);
    expect(discountFormError({ ...form, min_days: "5", max_days: "2" }, false)).toMatch(/last day/);
    expect(discountFormError({ ...form, max_days: "x" }, false)).toMatch(/whole numbers/);
    expect(
      discountFormError({ ...form, valid_from: "2026-10-05", valid_to: "2026-10-01" }, false),
    ).toMatch(/end date/);
    // Every weekday means no weekday limit.
    expect(discountFormColumns({ ...form, weekdays: [0, 1, 2, 3, 4, 5, 6] }).weekdays).toBeNull();
    expect(discountFormFrom(rule({ max_days: null, weekdays: [1] })).max_days).toBe("");
  });
});
