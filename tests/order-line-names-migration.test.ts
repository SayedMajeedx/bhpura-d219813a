import { beforeAll, describe, expect, it, vi } from "vitest";
import depositMigration from "../supabase/migrations/20261023100000_booking_transfer_deposit.sql?raw";
import migration from "../supabase/migrations/20261025120000_order_line_names.sql?raw";
import { createEngineDb, type EngineDb } from "./helpers/booking-engine-db";
import { PAYMENTS, syncTrigger } from "./helpers/booking-checkout-db";

// An order line's own name in Arabic and English (migration 20261025120000): the two booking
// order builders, redefined from their live text with the names added, run for real in Postgres
// (PGlite) through the booking engine; and the lines written before it, named by the backfill.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: EngineDb;
let before: { orderId: string };

type Line = { description: string; name_ar: string | null; name_en: string | null };
const linesOf = (orderId: string) =>
  db.rows<Line>(
    "select description, name_ar, name_en from order_items where order_id = $1 order by description",
    [orderId],
  );

/** A store with a booth sold by length (and extra hours), Arabic names, and an add-on. */
async function store() {
  const brand = await db.store({ dailyCapacity: 5, leadDays: 0, minDuration: 120, step: 60 });
  const slug = await db.slugOf(brand);
  await db.pg.query(
    "update business_settings set storefront_mode = 'shop', card_enabled = true where brand_id = $1",
    [brand],
  );
  const booth = await db.service(brand, {
    name: "Booth",
    lengths: [{ minutes: 180, price: 70 }],
    extraHour: 20,
  });
  await db.pg.query("update products set name_ar = 'فوتوبوث' where id = $1", [booth.id]);
  const prints = await db.option(booth.id, brand, { name: "Instant prints", price: 30 });
  await db.pg.query("update service_options set name_ar = 'طباعة فورية' where id = $1", [prints]);
  return { brand, slug, booth, prints };
}

/** A booking staff enter as confirmed: its order is made at once (create_booking_order). */
async function staffOrder(s: Awaited<ReturnType<typeof store>>) {
  const made = await db.staff(s.brand, db.day(3), "12:00", 180, [
    { product_id: s.booth.id, name_en: "Booth", options: [{ option_id: s.prints }] },
  ]);
  const row = await db.one<{ order_id: string }>("select order_id from bookings where id = $1", [
    made.id,
  ]);
  return row.order_id;
}

beforeAll(async () => {
  db = await createEngineDb();
  await db.pg.exec(PAYMENTS);
  await db.pg.exec(syncTrigger());
  await db.pg.exec(depositMigration);
  // An order written before the migration: one English text per line.
  before = { orderId: await staffOrder(await store()) };
  await db.pg.exec(migration);
});

describe("an order line's own names", () => {
  it("are given to the lines written before, from the booking's lines", async () => {
    expect(await linesOf(before.orderId)).toEqual([
      { description: "+ Instant prints", name_ar: "+ طباعة فورية", name_en: "+ Instant prints" },
      // A line with a product is named by its product.
      { description: "Booth", name_ar: null, name_en: null },
    ]);
  });

  it("are written by create_booking_order, the description unchanged", async () => {
    const orderId = await staffOrder(await store());
    expect(await linesOf(orderId)).toEqual([
      { description: "+ Instant prints", name_ar: "+ طباعة فورية", name_en: "+ Instant prints" },
      // A name missing in one language is the other's.
      { description: "Booth", name_ar: "Booth", name_en: "Booth" },
    ]);
  });

  it("are written by place_booking_order for the add-ons and the extra time", async () => {
    const s = await store();
    const held = await db.one<{
      hold_booking: {
        booking_id: string;
        hold_token: string;
        items: Array<{ variant_id: string; quantity: number }>;
      };
    }>(
      `select hold_booking($1, $2::date, '12:00'::time, 240, $3::jsonb, $4::jsonb, '{}'::jsonb, null)`,
      [
        s.brand,
        db.day(5),
        JSON.stringify([{ product_id: s.booth.id, options: [{ option_id: s.prints }] }]),
        JSON.stringify({ name: "Sara", phone: "39990017" }),
      ],
    );
    const hold = held.hold_booking;
    const placed = await db.one<{ place_booking_order: { order_id: string } }>(
      `select place_booking_order($1, $2::uuid, $3, $4::jsonb, $5::jsonb, 'card')`,
      [
        hold.booking_id,
        hold.hold_token,
        s.slug,
        JSON.stringify({ name: "Sara", phone: "39990017" }),
        JSON.stringify(hold.items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity }))),
      ],
    );
    expect(await linesOf(placed.place_booking_order.order_id)).toEqual([
      { description: "+ Extra time", name_ar: "+ وقت إضافي", name_en: "+ Extra time" },
      { description: "+ Instant prints", name_ar: "+ طباعة فورية", name_en: "+ Instant prints" },
      // The service line is the storefront order builder's, named by its product.
      { description: "Booth", name_ar: null, name_en: null },
    ]);
  });

  it("change nothing else in the two functions", () => {
    const definition = (sql: string, name: string) => {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      return sql.slice(start, sql.indexOf("$function$", sql.indexOf("$function$", start) + 1));
    };
    // What the migration adds, taken out again: the two columns and their values.
    const withoutNames = (text: string) =>
      text
        .replace(/description, name_ar, name_en,\s*quantity/g, "description, quantity")
        .replace(
          /(\|\| COALESCE\(NULLIF\(btrim\(bi\.name_en\), ''\), NULLIF\(btrim\(bi\.name_ar\), ''\), '(?:Service|Add-on)'\),)\s*(?:(?:'(?:\+|↳) ' |CASE[\s\S]*?END\s*)\|\| COALESCE\(NULLIF\(btrim\(bi\.name_(?:ar|en)\), ''\), NULLIF\(btrim\(bi\.name_(?:ar|en)\), ''\), '[^']+'\),\s*){2}/g,
          "$1 ",
        )
        .replace(/'\+ Extra time',\s*'\+ وقت إضافي', '\+ Extra time', /, "'+ Extra time', ")
        .replace(/\s+/g, " ");
    const previous = depositMigration;
    expect(withoutNames(definition(migration, "place_booking_order"))).toBe(
      withoutNames(definition(previous, "place_booking_order")),
    );
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS name_ar text/);
  });
});
