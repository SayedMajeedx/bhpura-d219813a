import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261007170000_cost_tables_staff_only.sql?raw";

vi.setConfig({ testTimeout: 60_000 });

// Phase 1 of moving costs into staff-only tables: the tables are filled from the old columns, the
// two sides stay equal in both directions without the triggers calling each other, and only the
// brand's own staff can see a cost row.

const BRAND_A = "00000000-0000-4000-8000-00000000000a";
const BRAND_B = "00000000-0000-4000-8000-00000000000b";
const STAFF_A = "00000000-0000-4000-8000-0000000000a1";
const STAFF_B = "00000000-0000-4000-8000-0000000000b1";
const SHOPPER = "00000000-0000-4000-8000-0000000000c1";
const P1 = "00000000-0000-4000-8000-000000000101";
const V1 = "00000000-0000-4000-8000-000000000201";

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE SCHEMA auth;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    CREATE TABLE public.brands (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, brand_id uuid);
    CREATE FUNCTION public.can_access_brand(_brand_id uuid) RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.brand_id = _brand_id)
    $$;
    CREATE TABLE public.products (
      id uuid PRIMARY KEY, brand_id uuid NOT NULL, name text,
      cost_price numeric DEFAULT 0, direct_packaging_cost numeric DEFAULT 0.000, vendor_id uuid);
    CREATE TABLE public.product_variants (
      id uuid PRIMARY KEY, product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
      brand_id uuid NOT NULL, cost_price numeric DEFAULT 0);
    INSERT INTO public.brands VALUES ('${BRAND_A}'), ('${BRAND_B}');
    INSERT INTO public.profiles VALUES ('${STAFF_A}', '${BRAND_A}'), ('${STAFF_B}', '${BRAND_B}');
    -- Rows that exist before the migration (the backfill must carry them over).
    INSERT INTO public.products (id, brand_id, name, cost_price, direct_packaging_cost)
      VALUES ('${P1}', '${BRAND_A}', 'Abaya', 12.5, 0.75);
    INSERT INTO public.product_variants (id, product_id, brand_id, cost_price)
      VALUES ('${V1}', '${P1}', '${BRAND_A}', 11);
  `);
  await db.exec(migration);
  return db;
}

const one = async (db: PGlite, sql: string) => (await db.query<Record<string, unknown>>(sql)).rows;

const as = async (db: PGlite, role: string, uid: string | null, sql: string) => {
  await db.exec(`SET test.uid = '${uid ?? ""}'; SET ROLE ${role};`);
  try {
    return await db.query<Record<string, unknown>>(sql);
  } finally {
    await db.exec(`RESET ROLE;`);
  }
};

describe("cost tables: filled from the old columns", () => {
  it("carries every existing product and variant over", async () => {
    const db = await database();
    expect(
      await one(
        db,
        `SELECT cost_price::float AS c, direct_packaging_cost::float AS d FROM public.product_costs`,
      ),
    ).toEqual([{ c: 12.5, d: 0.75 }]);
    expect(await one(db, `SELECT cost_price::float AS c FROM public.variant_costs`)).toEqual([
      { c: 11 },
    ]);
  });
});

describe("cost tables: both sides stay equal", () => {
  it("copies a new product and variant, and a changed old column, to the tables", async () => {
    const db = await database();
    await db.exec(`
      INSERT INTO public.products (id, brand_id, name, cost_price) VALUES
        ('00000000-0000-4000-8000-000000000102', '${BRAND_B}', 'Scarf', 3);
      INSERT INTO public.product_variants (id, product_id, brand_id, cost_price) VALUES
        ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', '${BRAND_B}', 2);
      UPDATE public.products SET cost_price = 14, vendor_id = '${STAFF_B}' WHERE id = '${P1}';
      UPDATE public.product_variants SET cost_price = 13 WHERE id = '${V1}';
    `);
    expect(
      await one(
        db,
        `SELECT brand_id, cost_price::float AS c FROM public.product_costs ORDER BY cost_price`,
      ),
    ).toEqual([
      { brand_id: BRAND_B, c: 3 },
      { brand_id: BRAND_A, c: 14 },
    ]);
    expect(
      await one(db, `SELECT vendor_id FROM public.product_costs WHERE product_id = '${P1}'`),
    ).toEqual([{ vendor_id: STAFF_B }]);
    expect(
      await one(db, `SELECT cost_price::float AS c FROM public.variant_costs ORDER BY cost_price`),
    ).toEqual([{ c: 2 }, { c: 13 }]);
  });

  it("copies a change made in the tables back to the old columns, without looping", async () => {
    const db = await database();
    await db.exec(`
      UPDATE public.product_costs SET cost_price = 20, direct_packaging_cost = 1 WHERE product_id = '${P1}';
      UPDATE public.variant_costs SET cost_price = 18 WHERE variant_id = '${V1}';
    `);
    expect(
      await one(
        db,
        `SELECT cost_price::float AS c, direct_packaging_cost::float AS d FROM public.products WHERE id = '${P1}'`,
      ),
    ).toEqual([{ c: 20, d: 1 }]);
    expect(
      await one(
        db,
        `SELECT cost_price::float AS c FROM public.product_variants WHERE id = '${V1}'`,
      ),
    ).toEqual([{ c: 18 }]);
    // The guard flag is left off, so the next write syncs again.
    await db.exec(`UPDATE public.products SET cost_price = 21 WHERE id = '${P1}'`);
    expect(
      await one(
        db,
        `SELECT cost_price::float AS c FROM public.product_costs WHERE product_id = '${P1}'`,
      ),
    ).toEqual([{ c: 21 }]);
  });

  it("does not let one brand's cost row move another brand's product", async () => {
    const db = await database();
    await db.exec(`
      UPDATE public.product_costs SET brand_id = '${BRAND_B}', cost_price = 99 WHERE product_id = '${P1}';
    `);
    expect(
      await one(db, `SELECT cost_price::float AS c FROM public.products WHERE id = '${P1}'`),
    ).toEqual([{ c: 12.5 }]);
  });
});

describe("cost tables: who can see them", () => {
  const read = `SELECT cost_price::float AS c FROM public.product_costs`;

  it("shows a brand's staff their own costs only", async () => {
    const db = await database();
    expect((await as(db, "authenticated", STAFF_A, read)).rows).toEqual([{ c: 12.5 }]);
    expect((await as(db, "authenticated", STAFF_B, read)).rows).toEqual([]);
  });

  it("shows a signed-in shopper and a visitor nothing", async () => {
    const db = await database();
    expect((await as(db, "authenticated", SHOPPER, read)).rows).toEqual([]);
    expect((await as(db, "authenticated", null, read)).rows).toEqual([]);
    await expect(as(db, "anon", null, read)).rejects.toThrow(/permission denied/);
    await expect(
      as(db, "anon", null, `SELECT cost_price FROM public.variant_costs`),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets staff write their own brand's cost and refuses another brand's", async () => {
    const db = await database();
    await as(db, "authenticated", STAFF_A, `UPDATE public.product_costs SET cost_price = 15`);
    expect(
      await one(db, `SELECT cost_price::float AS c FROM public.products WHERE id = '${P1}'`),
    ).toEqual([{ c: 15 }]);
    await expect(
      as(
        db,
        "authenticated",
        STAFF_B,
        `INSERT INTO public.product_costs (product_id, brand_id, cost_price)
         VALUES ('00000000-0000-4000-8000-000000000999', '${BRAND_A}', 1)`,
      ),
    ).rejects.toThrow(/row-level security/);
    const moved = await as(
      db,
      "authenticated",
      STAFF_B,
      `UPDATE public.product_costs SET cost_price = 1`,
    );
    expect(moved.affectedRows).toBe(0);
  });
});
