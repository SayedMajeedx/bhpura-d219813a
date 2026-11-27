import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261225100000_order_line_cost_unknown.sql?raw";

// An order line whose piece has no cost recorded keeps no cost, never zero (migration
// 20261225100000), so the reports' "cost data is incomplete" check sees it. Run in a real
// Postgres (PGlite) with the real trigger function.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
let db: PGlite;

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    item_kind text NOT NULL DEFAULT 'product', is_package boolean NOT NULL DEFAULT false
  );
  CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid REFERENCES public.products(id),
    brand_id uuid NOT NULL, cost_price numeric NOT NULL DEFAULT 0
  );
  CREATE TABLE public.product_costs (
    product_id uuid PRIMARY KEY REFERENCES public.products(id), brand_id uuid NOT NULL,
    cost_price numeric NOT NULL DEFAULT 0
  );
  CREATE TABLE public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid, variant_id uuid,
    quantity integer NOT NULL DEFAULT 1, unit_cost numeric
  );
  CREATE FUNCTION public.snapshot_order_item_unit_cost() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RETURN NEW; END $$;
  CREATE TRIGGER snapshot_order_item_unit_cost_trigger BEFORE INSERT ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_item_unit_cost();
`;

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];

const newProduct = async (cost = 0, kind: { item_kind?: string; is_package?: boolean } = {}) => {
  const { id } = await one<{ id: string }>(
    "INSERT INTO public.products (brand_id, item_kind, is_package) VALUES ($1, $2, $3) RETURNING id",
    [BRAND, kind.item_kind ?? "product", kind.is_package ?? false],
  );
  await db.query(
    "INSERT INTO public.product_costs (product_id, brand_id, cost_price) VALUES ($1, $2, $3)",
    [id, BRAND, cost],
  );
  return id;
};
const newSize = async (product: string, cost = 0) =>
  (
    await one<{ id: string }>(
      "INSERT INTO public.product_variants (product_id, brand_id, cost_price) VALUES ($1, $2, $3) RETURNING id",
      [product, BRAND, cost],
    )
  ).id;
const lineCost = async (values: { product?: string; variant?: string; unit_cost?: number }) => {
  const row = await one<{ unit_cost: string | null }>(
    "INSERT INTO public.order_items (product_id, variant_id, unit_cost) VALUES ($1, $2, $3) RETURNING unit_cost",
    [values.product ?? null, values.variant ?? null, values.unit_cost ?? null],
  );
  return row.unit_cost == null ? null : Number(row.unit_cost);
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(migration);
});

describe("an order line's cost", () => {
  it("is its size's own cost, else its product's", async () => {
    const product = await newProduct(21.25);
    expect(await lineCost({ product, variant: await newSize(product, 30) })).toBe(30);
    expect(await lineCost({ product, variant: await newSize(product, 0) })).toBe(21.25);
    expect(await lineCost({ product })).toBe(21.25);
  });

  it("stays empty when neither the size nor the product has a cost", async () => {
    const product = await newProduct(0);
    expect(await lineCost({ product, variant: await newSize(product, 0) })).toBeNull();
    expect(await lineCost({ product })).toBeNull();
  });

  it("keeps a cost it was given, a zero included", async () => {
    const product = await newProduct(0);
    const size = await newSize(product, 0);
    expect(await lineCost({ product, variant: size, unit_cost: 7 })).toBe(7);
    expect(await lineCost({ product, variant: size, unit_cost: 0 })).toBe(0);
  });

  it("is zero for a service or a package with no cost", async () => {
    const service = await newProduct(0, { item_kind: "service" });
    expect(await lineCost({ product: service, variant: await newSize(service, 0) })).toBe(0);
    const pack = await newProduct(0, { item_kind: "service", is_package: true });
    expect(await lineCost({ product: pack, variant: await newSize(pack, 0) })).toBe(0);
    // A service with a cost keeps it.
    const priced = await newProduct(4, { item_kind: "service" });
    expect(await lineCost({ product: priced, variant: await newSize(priced, 0) })).toBe(4);
  });

  it("stays empty for a line with no product, as before", async () => {
    expect(await lineCost({})).toBeNull();
  });

  it("is not callable from a browser", async () => {
    const grants = await db.query<{ grantee: string }>(
      `SELECT grantee FROM information_schema.routine_privileges
        WHERE routine_name = 'snapshot_order_item_unit_cost' AND grantee IN ('anon', 'authenticated', 'PUBLIC')`,
    );
    expect(grants.rows).toEqual([]);
  });
});
