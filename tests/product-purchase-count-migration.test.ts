import { describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261008110000_product_recent_purchase_count.sql?raw";

vi.setConfig({ testTimeout: 60_000 });

// The social proof badge ("Purchased N times in the last 7 days") needs a count a visitor may read.
// The function answers only at or above 3, only for an active product of that store, only when the
// store keeps the badge on, and counts each recent, non-cancelled, non-draft order once.

const BRAND_A = "00000000-0000-4000-8000-00000000000a";
const BRAND_B = "00000000-0000-4000-8000-00000000000b";
const P1 = "00000000-0000-4000-8000-000000000101";
const P2 = "00000000-0000-4000-8000-000000000102";
const PB = "00000000-0000-4000-8000-000000000201";

let orderSeq = 0;
const order = (brand: string, status: string, daysAgo: number, items: Array<[string, string]>) => {
  const id = `00000000-0000-4000-8000-0000000003${String(++orderSeq).padStart(2, "0")}`;
  return `
    INSERT INTO public.orders (id, brand_id, status, created_at)
      VALUES ('${id}', '${brand}', '${status}', now() - interval '${daysAgo} days');
    ${items
      .map(
        ([product, line]) =>
          `INSERT INTO public.order_items (id, order_id, brand_id, product_id)
           VALUES ('00000000-0000-4000-8000-0000000004${line}', '${id}', '${brand}', '${product}');`,
      )
      .join("\n")}`;
};

async function database(extra = "", settings = true) {
  orderSeq = 0;
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text UNIQUE, is_active boolean DEFAULT true);
    CREATE TABLE public.business_settings (brand_id uuid PRIMARY KEY, social_proof_enabled boolean);
    CREATE TABLE public.products (id uuid PRIMARY KEY, brand_id uuid, is_active boolean DEFAULT true);
    CREATE TABLE public.orders (id uuid PRIMARY KEY, brand_id uuid, status text, created_at timestamptz);
    CREATE TABLE public.order_items (id uuid PRIMARY KEY, order_id uuid, brand_id uuid, product_id uuid);
    INSERT INTO public.brands VALUES ('${BRAND_A}', 'pura'), ('${BRAND_B}', 'qoffee');
    ${settings ? `INSERT INTO public.business_settings VALUES ('${BRAND_A}', true);` : ""}
    INSERT INTO public.products VALUES ('${P1}', '${BRAND_A}'), ('${P2}', '${BRAND_A}'), ('${PB}', '${BRAND_B}');
    ${extra}
  `);
  await db.exec(migration);
  return db;
}

const count = async (db: PGlite, slug: string, product: string, role = "anon") => {
  await db.exec(`SET ROLE ${role};`);
  try {
    const r = await db.query<{ n: number | null }>(
      `SELECT public.get_product_recent_purchase_count('${slug}', '${product}'::uuid) AS n`,
    );
    return r.rows[0].n;
  } finally {
    await db.exec(`RESET ROLE;`);
  }
};

describe("get_product_recent_purchase_count", () => {
  it("answers only at or above three, and nothing below (so small sales stay private)", async () => {
    const two = await database(
      order(BRAND_A, "completed", 1, [[P1, "01"]]) + order(BRAND_A, "confirmed", 2, [[P1, "02"]]),
    );
    expect(await count(two, "pura", P1)).toBeNull();
    const three = await database(
      order(BRAND_A, "completed", 1, [[P1, "01"]]) +
        order(BRAND_A, "confirmed", 2, [[P1, "02"]]) +
        order(BRAND_A, "packing", 3, [[P1, "03"]]),
    );
    expect(await count(three, "pura", P1)).toBe(3);
    expect(await count(three, "pura", P2)).toBeNull();
  });

  it("counts each order once, even with the product on two lines", async () => {
    const db = await database(
      order(BRAND_A, "completed", 1, [
        [P1, "01"],
        [P1, "02"],
      ]) + order(BRAND_A, "completed", 2, [[P1, "03"]]),
    );
    // Two orders, three lines: below the threshold, so nothing.
    expect(await count(db, "pura", P1)).toBeNull();
  });

  it("leaves out cancelled orders, drafts and orders older than a week", async () => {
    const db = await database(
      order(BRAND_A, "completed", 1, [[P1, "01"]]) +
        order(BRAND_A, "Cancelled", 1, [[P1, "02"]]) +
        order(BRAND_A, "draft", 1, [[P1, "03"]]) +
        order(BRAND_A, "completed", 8, [[P1, "04"]]) +
        order(BRAND_A, "pending", 2, [[P1, "05"]]) +
        order(BRAND_A, "confirmed", 6, [[P1, "06"]]),
    );
    // Only the completed, the pending and the confirmed one count: three.
    expect(await count(db, "pura", P1)).toBe(3);
  });

  it("is silent when the store turned the badge off, and on for a store with no settings row", async () => {
    const recent = [1, 2, 3, 4]
      .map((n) => order(BRAND_A, "completed", n, [[P1, `0${n}`]]))
      .join("");
    const off = await database(recent);
    await off.exec(`UPDATE public.business_settings SET social_proof_enabled = false`);
    expect(await count(off, "pura", P1)).toBeNull();
    const none = await database(recent, false);
    expect(await count(none, "pura", P1)).toBe(4);
  });

  it("only answers for an active product of that store, in an active store", async () => {
    const recent = [1, 2, 3].map((n) => order(BRAND_B, "completed", n, [[PB, `0${n}`]])).join("");
    const db = await database(recent);
    expect(await count(db, "qoffee", PB)).toBe(3);
    // The same product through another store's slug: nothing.
    expect(await count(db, "pura", PB)).toBeNull();
    expect(await count(db, "no-such-store", PB)).toBeNull();
    await db.exec(`UPDATE public.products SET is_active = false WHERE id = '${PB}'`);
    expect(await count(db, "qoffee", PB)).toBeNull();
    await db.exec(
      `UPDATE public.products SET is_active = true WHERE id = '${PB}'; UPDATE public.brands SET is_active = false WHERE id = '${BRAND_B}'`,
    );
    expect(await count(db, "qoffee", PB)).toBeNull();
  });

  it("can be run by a visitor and by a signed-in account, and exposes no table to them", async () => {
    const recent = [1, 2, 3].map((n) => order(BRAND_A, "completed", n, [[P1, `0${n}`]])).join("");
    const db = await database(recent);
    expect(await count(db, "pura", P1, "anon")).toBe(3);
    expect(await count(db, "pura", P1, "authenticated")).toBe(3);
    await db.exec(`SET ROLE anon;`);
    await expect(db.query(`SELECT count(*) FROM public.order_items`)).rejects.toThrow(
      /permission denied/,
    );
    await db.exec(`RESET ROLE;`);
  });
});
