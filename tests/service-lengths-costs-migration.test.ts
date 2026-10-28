import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import original from "../supabase/migrations/20261028130000_service_lengths.sql?raw";
import fix from "../supabase/migrations/20261028150000_service_lengths_no_cost_reads.sql?raw";

// Saving a service in the editor failed with "permission denied for table products" (found on
// Aurora, 2026-10-28): set_service_lengths runs as the signed-in member and read two cost columns
// that `authenticated` cannot select. Run here as a role that cannot, as the database does.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const SVC = "00000000-0000-4000-8000-0000000000c2";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE public.products (
      id uuid PRIMARY KEY, brand_id uuid NOT NULL,
      cost_price numeric NOT NULL DEFAULT 0, direct_packaging_cost numeric, vendor_id uuid
    );
    CREATE TABLE public.product_variants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid, brand_id uuid NOT NULL,
      product_id uuid NOT NULL REFERENCES public.products(id),
      size text, selling_price numeric NOT NULL DEFAULT 0, original_price numeric,
      duration_minutes integer, cost_price numeric NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TABLE public.booking_items (id serial PRIMARY KEY, variant_id uuid);
    CREATE TABLE public.order_items (id serial PRIMARY KEY, variant_id uuid);
    INSERT INTO public.products (id, brand_id) VALUES ('${SVC}', '${BRAND}');
    -- As in production: the cost columns are not selectable by a signed-in member, and everything
    -- else is (the grants of migration 20261008100000 and its successors).
    GRANT USAGE ON SCHEMA public, auth TO authenticated;
    GRANT SELECT (id, brand_id), INSERT, UPDATE, DELETE ON public.products TO authenticated;
    GRANT SELECT (id, user_id, brand_id, product_id, size, selling_price, original_price,
                  duration_minutes, created_at),
          INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
  `);
  await db.exec(original);
});

/** The call as a signed-in member makes it. */
const saveAsMember = async (lengths: unknown[], cost: number | null = null) => {
  await db.exec("SET ROLE authenticated");
  try {
    await db.query("SELECT public.set_service_lengths($1, $2::jsonb, $3)", [
      SVC,
      JSON.stringify(lengths),
      cost,
    ]);
  } finally {
    await db.exec("RESET ROLE");
  }
};

const variants = async () =>
  (
    await db.query<{ minutes: number | null; price: string; cost: string }>(
      `SELECT duration_minutes AS minutes, selling_price AS price, cost_price AS cost
         FROM public.product_variants WHERE product_id = $1 ORDER BY duration_minutes`,
      [SVC],
    )
  ).rows;

describe("before the fix", () => {
  it("is refused to a member who cannot read costs", async () => {
    await expect(saveAsMember([{ minutes: 60, price: 40 }])).rejects.toThrow(/permission denied/);
  });
});

describe("after the fix", () => {
  beforeAll(async () => {
    await db.exec(fix);
  });

  it("saves the lengths for a member who cannot read costs", async () => {
    await saveAsMember([
      { minutes: 60, price: 40 },
      { minutes: 120, price: 70 },
    ]);
    expect((await variants()).map((v) => [v.minutes, Number(v.price)])).toEqual([
      [60, 40],
      [120, 70],
    ]);
  });

  it("changes a price without touching the cost already there, and writes a cost that is sent", async () => {
    await db.exec("UPDATE public.product_variants SET cost_price = 12 WHERE duration_minutes = 60");
    await saveAsMember([
      { minutes: 60, price: 45 },
      { minutes: 120, price: 70 },
    ]);
    let rows = await variants();
    expect(rows.find((v) => v.minutes === 60)).toMatchObject({ cost: "12" });
    expect(Number(rows.find((v) => v.minutes === 60)!.price)).toBe(45);

    await saveAsMember(
      [
        { minutes: 60, price: 45 },
        { minutes: 120, price: 70 },
      ],
      15,
    );
    rows = await variants();
    expect(rows.map((v) => v.cost)).toEqual(["15", "15"]);
  });

  it("is the same function, with the same grants", () => {
    expect(fix).toMatch(/CREATE OR REPLACE FUNCTION public\.set_service_lengths\(/);
    expect(fix).toMatch(/SECURITY INVOKER/);
    expect(fix).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.set_service_lengths\(uuid, jsonb, numeric\) TO authenticated/,
    );
    // It reads no whole product row (the cost columns are in it).
    expect(fix.replace(/--[^\n]*/g, "")).not.toMatch(/SELECT \* INTO/);
  });
});
