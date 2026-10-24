import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261024120000_product_details.sql?raw";

// products.details (migration 20261024120000), run in a real Postgres: every product starts with
// no facts, the column holds an object of a bounded size, and a visitor may read it.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.products (id serial PRIMARY KEY, name text);
    INSERT INTO public.products (name) VALUES ('an abaya made before');
  `);
  await db.exec(migration);
});

const insert = (details: string) =>
  db.query("INSERT INTO public.products (name, details) VALUES ('x', $1::jsonb)", [details]);

describe("a product's facts in the database", () => {
  it("start empty for every product, the ones made before too", async () => {
    const rows = await db.query<{ details: unknown }>("SELECT details FROM public.products");
    expect(rows.rows).toEqual([{ details: {} }]);
    expect(migration).not.toMatch(/UPDATE\s+public\.products/i);
  });

  it("are an object of a bounded size", async () => {
    await expect(insert(JSON.stringify({ roast: "light" }))).resolves.toBeTruthy();
    await expect(insert(JSON.stringify(["light"]))).rejects.toThrow(/products_details_shape/);
    await expect(insert(JSON.stringify("light"))).rejects.toThrow(/products_details_shape/);
    const novel = { story: "word ".repeat(4000) };
    await expect(insert(JSON.stringify(novel))).rejects.toThrow(/products_details_shape/);
    await expect(
      db.query("INSERT INTO public.products (name, details) VALUES ('x', NULL)"),
    ).rejects.toThrow(/null/i);
  });

  it("are readable by a visitor and a signed-in shopper", async () => {
    const can = await db.query<{ anon: boolean; signed: boolean }>(`
      SELECT has_column_privilege('anon', 'public.products', 'details', 'SELECT') AS anon,
             has_column_privilege('authenticated', 'public.products', 'details', 'SELECT') AS signed
    `);
    expect(can.rows[0]).toEqual({ anon: true, signed: true });
  });
});
