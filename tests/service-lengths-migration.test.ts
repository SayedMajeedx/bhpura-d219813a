import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261028130000_service_lengths.sql?raw";

// A service's lengths saved as one set (migration 20261028130000; Aurora's Diamond Package showed
// 4 hours, twice, when only 5 were chosen), run in a real Postgres: a length stored twice keeps
// its first variant and what pointed at the others; a length can no longer be stored twice; and
// set_service_lengths makes a service's variants exactly the lengths sent, however many times.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const PKG = "00000000-0000-4000-8000-0000000000c1";
const SVC = "00000000-0000-4000-8000-0000000000c2";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE public.products (id uuid PRIMARY KEY, brand_id uuid NOT NULL);
    CREATE TABLE public.product_variants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid, brand_id uuid NOT NULL,
      product_id uuid NOT NULL REFERENCES public.products(id),
      size text, selling_price numeric NOT NULL DEFAULT 0, original_price numeric,
      duration_minutes integer, cost_price numeric NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TABLE public.booking_items (id serial PRIMARY KEY,
      variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL);
    CREATE TABLE public.order_items (id serial PRIMARY KEY,
      variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL);
    INSERT INTO public.products VALUES ('${PKG}', '${BRAND}'), ('${SVC}', '${BRAND}');
  `);
  // The Diamond Package as it was: 5 hours (with a booking), and 4 hours stored twice, the second
  // with an order line.
  const five = await insertVariant(PKG, 300, 160, 215);
  await insertVariant(PKG, 240, 161, null);
  const fourAgain = await insertVariant(PKG, 240, 161, null);
  await db.query("INSERT INTO public.booking_items (variant_id) VALUES ($1)", [five]);
  await db.query("INSERT INTO public.order_items (variant_id) VALUES ($1)", [fourAgain]);
  await db.exec(migration);
});

async function insertVariant(
  product: string,
  minutes: number | null,
  price: number,
  was: number | null,
) {
  const row = await db.query<{ id: string }>(
    `INSERT INTO public.product_variants (brand_id, product_id, duration_minutes, selling_price, original_price)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [BRAND, product, minutes, price, was],
  );
  return row.rows[0].id;
}

const variants = async (product: string) =>
  (
    await db.query<{ id: string; minutes: number | null; price: string; was: string | null }>(
      `SELECT id, duration_minutes AS minutes, selling_price AS price, original_price AS was
         FROM public.product_variants WHERE product_id = $1 ORDER BY duration_minutes NULLS FIRST`,
      [product],
    )
  ).rows;

const save = (product: string, lengths: unknown[]) =>
  db.query("SELECT public.set_service_lengths($1, $2::jsonb)", [product, JSON.stringify(lengths)]);

describe("a length stored twice", () => {
  it("keeps its first variant, and an order of the other points at it", async () => {
    const rows = await variants(PKG);
    expect(rows.map((r) => r.minutes)).toEqual([240, 300]);
    const four = rows.find((r) => r.minutes === 240)!.id;
    const order = await db.query<{ variant_id: string }>(
      "SELECT variant_id FROM public.order_items",
    );
    expect(order.rows[0].variant_id).toBe(four);
  });

  it("can no longer happen", async () => {
    await expect(insertVariant(PKG, 300, 1, null)).rejects.toThrow(/duplicate key/);
  });
});

describe("saving a service's lengths", () => {
  it("leaves exactly the lengths sent, keeping a booked length's own variant", async () => {
    const before = (await variants(PKG)).find((r) => r.minutes === 300)!.id;
    const five = [{ minutes: 300, price: 160, compare_at: 215, size: "5 hours" }];
    await save(PKG, five);
    await save(PKG, five); // a second press of Save changes nothing
    const rows = await variants(PKG);
    expect(rows).toEqual([{ id: before, minutes: 300, price: "160", was: "215" }]);
    const booking = await db.query<{ variant_id: string }>(
      "SELECT variant_id FROM public.booking_items",
    );
    expect(booking.rows[0].variant_id).toBe(before);
    // The order line of the removed 4 hours keeps its line, with no variant.
    const order = await db.query<{ variant_id: string | null }>(
      "SELECT variant_id FROM public.order_items",
    );
    expect(order.rows[0].variant_id).toBeNull();
  });

  it("adds a length, updates one, and switches to one fixed price and back", async () => {
    await save(SVC, [
      { minutes: 180, price: 40, compare_at: null, size: "3 hours" },
      { minutes: 240, price: 45, compare_at: 60, size: "4 hours" },
    ]);
    expect((await variants(SVC)).map((r) => [r.minutes, r.price, r.was])).toEqual([
      [180, "40", null],
      [240, "45", "60"],
    ]);
    await save(SVC, [{ minutes: null, price: 30, compare_at: null, size: "Service" }]);
    expect((await variants(SVC)).map((r) => [r.minutes, r.price])).toEqual([[null, "30"]]);
    await save(SVC, [{ minutes: 180, price: 40, compare_at: null, size: "3 hours" }]);
    expect((await variants(SVC)).map((r) => [r.minutes, r.price])).toEqual([[180, "40"]]);
  });

  it("refuses what the editor would refuse", async () => {
    await expect(save(SVC, [])).rejects.toThrow(/INVALID_LENGTHS/);
    await expect(
      save(SVC, [{ minutes: 180, price: 0, compare_at: null, size: "3 hours" }]),
    ).rejects.toThrow(/INVALID_PRICE/);
    await expect(
      save(SVC, [{ minutes: 180, price: 50, compare_at: 40, size: "3 hours" }]),
    ).rejects.toThrow(/INVALID_COMPARE_AT/);
    await expect(
      save(SVC, [
        { minutes: 180, price: 40, compare_at: null, size: "3 hours" },
        { minutes: 180, price: 45, compare_at: null, size: "3 hours" },
      ]),
    ).rejects.toThrow(/DUPLICATE_LENGTH/);
    await expect(
      save(SVC, [
        { minutes: 180, price: 40, compare_at: null, size: "3 hours" },
        { minutes: null, price: 45, compare_at: null, size: "Service" },
      ]),
    ).rejects.toThrow(/INVALID_LENGTHS/);
    // A refused save changes nothing.
    expect((await variants(SVC)).map((r) => [r.minutes, r.price])).toEqual([[180, "40"]]);
  });
});
