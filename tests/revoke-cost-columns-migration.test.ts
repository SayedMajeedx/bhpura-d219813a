import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261008100000_revoke_cost_columns_from_signed_in.sql?raw";
import { diffCatalogColumns } from "../scripts/database/check-catalog-column-grants.mjs";

vi.setConfig({ testTimeout: 60_000 });

// Phase 3: a signed-in account (staff or shopper) can no longer read the old cost columns, while the
// admin keeps reading every other column and keeps writing the costs; the live check reports a
// column left out of the grant or a cost column readable again.

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE TABLE public.products (
      id uuid PRIMARY KEY, brand_id uuid NOT NULL, name text, base_price numeric,
      cost_price numeric DEFAULT 0, direct_packaging_cost numeric DEFAULT 0, vendor_id uuid);
    CREATE TABLE public.product_variants (
      id uuid PRIMARY KEY, product_id uuid NOT NULL, brand_id uuid NOT NULL, sku text,
      selling_price numeric, cost_price numeric DEFAULT 0);
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.products, public.product_variants
      TO authenticated, service_role;
    INSERT INTO public.products (id, brand_id, name, base_price, cost_price, vendor_id)
      VALUES ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-00000000000a', 'Abaya', 40, 12.5, NULL);
    INSERT INTO public.product_variants (id, product_id, brand_id, sku, selling_price, cost_price)
      VALUES ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
              '00000000-0000-4000-8000-00000000000a', 'SKU1', 40, 11);
  `);
  await db.exec(migration);
  return db;
}

const as = async (db: PGlite, role: string, sql: string) => {
  await db.exec(`SET ROLE ${role};`);
  try {
    return await db.query<Record<string, unknown>>(sql);
  } finally {
    await db.exec(`RESET ROLE;`);
  }
};

describe("signed-in accounts and the old cost columns", () => {
  it("still read every other column, including `select *`-free lists and filters", async () => {
    const db = await database();
    const rows = await as(
      db,
      "authenticated",
      `SELECT id, brand_id, name, base_price FROM public.products WHERE brand_id IS NOT NULL ORDER BY name`,
    );
    expect(rows.rows).toHaveLength(1);
    expect(
      (await as(db, "authenticated", `SELECT sku, selling_price FROM public.product_variants`))
        .rows,
    ).toEqual([{ sku: "SKU1", selling_price: "40" }]);
  });

  it("can no longer read a cost column, by name or through a star", async () => {
    const db = await database();
    for (const sql of [
      `SELECT cost_price FROM public.products`,
      `SELECT direct_packaging_cost FROM public.products`,
      `SELECT vendor_id FROM public.products`,
      `SELECT * FROM public.products`,
      `SELECT cost_price FROM public.product_variants`,
      `SELECT * FROM public.product_variants`,
      `SELECT id FROM public.products WHERE cost_price > 0`,
    ]) {
      await expect(as(db, "authenticated", sql)).rejects.toThrow(/permission denied/);
    }
  });

  it("can still write the cost columns (the sync triggers copy them), and the server still reads them", async () => {
    const db = await database();
    await as(db, "authenticated", `UPDATE public.products SET cost_price = 20, vendor_id = NULL`);
    await as(
      db,
      "authenticated",
      `INSERT INTO public.products (id, brand_id, name, cost_price)
       VALUES ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-00000000000a', 'Scarf', 3)`,
    );
    const server = await as(
      db,
      "service_role",
      `SELECT cost_price::float AS c FROM public.products ORDER BY name`,
    );
    expect(server.rows).toEqual([{ c: 20 }, { c: 3 }]);
  });

  it("is safe to run twice", async () => {
    const db = await database();
    await db.exec(migration);
    await expect(as(db, "authenticated", `SELECT cost_price FROM public.products`)).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("the live column check", () => {
  const row = (table: string, column: string, authenticated: boolean, anon = false) => ({
    table_name: table,
    column_name: column,
    authenticated,
    anon,
  });

  it("passes when costs are hidden and every other column is readable by staff", () => {
    expect(
      diffCatalogColumns([
        row("products", "id", true, true),
        row("products", "cost_price", false),
        row("products", "user_id", true),
        row("product_variants", "barcode", true),
        row("product_variants", "cost_price", false),
      ]),
    ).toEqual([]);
  });

  it("reports a cost column readable again, and a column the admin cannot read", () => {
    expect(
      diffCatalogColumns([
        row("products", "cost_price", true),
        row("products", "vendor_id", false, true),
        row("products", "new_column", false),
        row("product_variants", "barcode", true, true),
      ]),
    ).toEqual([
      { column: "products.cost_price", kind: "cost-readable-by-signed-in" },
      { column: "products.vendor_id", kind: "cost-readable-by-visitors" },
      { column: "products.new_column", kind: "not-readable-by-signed-in" },
      { column: "product_variants.barcode", kind: "readable-by-visitors" },
    ]);
  });
});
