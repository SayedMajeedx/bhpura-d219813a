import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import costTables from "../supabase/migrations/20261007170000_cost_tables_staff_only.sql?raw";
import migration from "../supabase/migrations/20261019120000_cost_parts_and_line_cost_fallback.sql?raw";

// A product's cost in parts, and an order line that takes its product's cost when its size has
// none (migration 20261019120000). Run in a real Postgres (PGlite) with the real two-way sync
// between `products.cost_price` and `product_costs` (migration 20261007170000).
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
let db: PGlite;

/** A function of a migration, whichever way it was created. */
const functionOf = (sql: string, name: string) => {
  const start = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${name}\\(`));
  const tag = /\$(\w*)\$/.exec(sql.slice(start))![0];
  const open = sql.indexOf(tag, start);
  const end = sql.indexOf(tag, open + tag.length);
  return `${sql.slice(start, end + tag.length)};`;
};

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL,
    cost_price numeric DEFAULT 0, direct_packaging_cost numeric DEFAULT 0, vendor_id uuid
  );
  CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid REFERENCES public.products(id),
    brand_id uuid NOT NULL, cost_price numeric DEFAULT 0
  );
  CREATE TABLE public.product_costs (
    product_id uuid PRIMARY KEY REFERENCES public.products(id), brand_id uuid NOT NULL,
    cost_price numeric NOT NULL DEFAULT 0, direct_packaging_cost numeric NOT NULL DEFAULT 0,
    vendor_id uuid, updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE public.variant_costs (
    variant_id uuid PRIMARY KEY REFERENCES public.product_variants(id), brand_id uuid NOT NULL,
    cost_price numeric NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
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

const SYNC = [
  "sync_product_costs_from_product",
  "sync_product_from_product_costs",
  "sync_variant_costs_from_variant",
  "sync_variant_from_variant_costs",
];
const TRIGGERS = `
  CREATE TRIGGER trg_sync_product_costs_from_product
    AFTER INSERT OR UPDATE OF cost_price, direct_packaging_cost, vendor_id, brand_id ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.sync_product_costs_from_product();
  CREATE TRIGGER trg_sync_product_from_product_costs
    AFTER INSERT OR UPDATE ON public.product_costs
    FOR EACH ROW EXECUTE FUNCTION public.sync_product_from_product_costs();
  CREATE TRIGGER trg_sync_variant_costs_from_variant
    AFTER INSERT OR UPDATE OF cost_price, brand_id ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.sync_variant_costs_from_variant();
  CREATE TRIGGER trg_sync_variant_from_variant_costs
    AFTER INSERT OR UPDATE ON public.variant_costs
    FOR EACH ROW EXECUTE FUNCTION public.sync_variant_from_variant_costs();
`;

const one = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<T>(sql, params)).rows[0];
const newProduct = async (cost = 0) =>
  (
    await one<{ id: string }>(
      "INSERT INTO public.products (brand_id, cost_price) VALUES ($1, $2) RETURNING id",
      [BRAND, cost],
    )
  ).id;
const newSize = async (product: string, cost = 0) =>
  (
    await one<{ id: string }>(
      "INSERT INTO public.product_variants (product_id, brand_id, cost_price) VALUES ($1, $2, $3) RETURNING id",
      [product, BRAND, cost],
    )
  ).id;
const costs = async (product: string) => {
  const row = await one<{ cost_price: string; cost_parts: unknown; product_cost: string }>(
    `SELECT pc.cost_price, pc.cost_parts, p.cost_price AS product_cost
       FROM public.product_costs pc JOIN public.products p ON p.id = pc.product_id
      WHERE pc.product_id = $1`,
    [product],
  );
  return {
    cost: Number(row.cost_price),
    parts: row.cost_parts,
    productColumn: Number(row.product_cost),
  };
};
const setParts = (product: string, parts: unknown) =>
  db.query("UPDATE public.product_costs SET cost_parts = $2::jsonb WHERE product_id = $1", [
    product,
    JSON.stringify(parts),
  ]);
const lineCost = async (values: { product?: string; variant?: string; unit_cost?: number }) =>
  (
    await one<{ unit_cost: string | null }>(
      "INSERT INTO public.order_items (product_id, variant_id, unit_cost) VALUES ($1, $2, $3) RETURNING unit_cost",
      [values.product ?? null, values.variant ?? null, values.unit_cost ?? null],
    )
  ).unit_cost;

const PARTS = [
  { label: "Crepe fabric", amount: 8.5 },
  { label: "Tailoring", amount: 12 },
  { label: "Buttons", amount: 0.75 },
];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  for (const name of SYNC) await db.exec(functionOf(costTables, name));
  await db.exec(TRIGGERS);
  await db.exec(migration);
});

describe("a cost in parts", () => {
  it("is the parts' sum, kept the same on the product", async () => {
    const abaya = await newProduct();
    await setParts(abaya, PARTS);
    expect(await costs(abaya)).toEqual({ cost: 21.25, parts: PARTS, productColumn: 21.25 });
  });

  it("keeps its parts when the product is saved with the same cost, drops them for another", async () => {
    const abaya = await newProduct();
    await setParts(abaya, PARTS);
    await db.query("UPDATE public.products SET cost_price = 21.25 WHERE id = $1", [abaya]);
    expect((await costs(abaya)).parts).toEqual(PARTS);
    // The cost set as one number elsewhere (a supplier order, the cost field): it is the truth.
    await db.query("UPDATE public.products SET cost_price = 25 WHERE id = $1", [abaya]);
    expect(await costs(abaya)).toEqual({ cost: 25, parts: null, productColumn: 25 });
  });

  it("an empty list is one number again, and a part that is not a part is refused", async () => {
    const abaya = await newProduct(10);
    await setParts(abaya, []);
    expect(await costs(abaya)).toEqual({ cost: 10, parts: null, productColumn: 10 });
    for (const bad of [
      [{ label: "", amount: 1 }],
      [{ label: "Fabric", amount: -1 }],
      [{ label: "Fabric", amount: "5" }],
      [{ label: "x".repeat(61), amount: 1 }],
      Array.from({ length: 13 }, (_, i) => ({ label: `P${i}`, amount: 1 })),
      { label: "Fabric", amount: 1 },
    ]) {
      await expect(setParts(abaya, bad)).rejects.toThrow("INVALID_COST_PARTS");
    }
  });
});

describe("an order line's cost", () => {
  it("is its size's own cost, else its product's", async () => {
    const product = await newProduct();
    await setParts(product, PARTS);
    const ownCost = await newSize(product, 30);
    const noCost = await newSize(product, 0);
    expect(Number(await lineCost({ product, variant: ownCost }))).toBe(30);
    expect(Number(await lineCost({ product, variant: noCost }))).toBe(21.25);
    // A hand-made line with no size takes its product's cost.
    expect(Number(await lineCost({ product }))).toBe(21.25);
  });

  it("keeps a cost it was given, and is zero when nothing has a cost, as before", async () => {
    const product = await newProduct();
    const size = await newSize(product, 0);
    expect(Number(await lineCost({ product, variant: size, unit_cost: 7 }))).toBe(7);
    expect(Number(await lineCost({ product, variant: size }))).toBe(0);
    expect(await lineCost({})).toBeNull();
  });
});

describe("a product's sizes and its cost", () => {
  /** A size's cost in both places it is kept: they must agree. */
  const sizeCost = async (size: string) => {
    const row = await one<{ own: string; column: string }>(
      `SELECT vc.cost_price AS own, v.cost_price AS column
         FROM public.product_variants v JOIN public.variant_costs vc ON vc.variant_id = v.id
        WHERE v.id = $1`,
      [size],
    );
    expect(Number(row.column)).toBe(Number(row.own));
    return Number(row.own);
  };

  it("move with the product when they followed it, and keep a cost of their own", async () => {
    const abaya = await newProduct(20);
    const following = await newSize(abaya, 20);
    const own = await newSize(abaya, 25);
    const none = await newSize(abaya, 0);
    await db.query("UPDATE public.products SET cost_price = 22 WHERE id = $1", [abaya]);
    expect([await sizeCost(following), await sizeCost(own), await sizeCost(none)]).toEqual([
      22, 25, 22,
    ]);
    // The same through the cost table (the parts, a supplier order).
    await setParts(abaya, [{ label: "Making", amount: 24 }]);
    expect([await sizeCost(following), await sizeCost(own), await sizeCost(none)]).toEqual([
      24, 25, 24,
    ]);
  });

  it("keep the cost a received order gave them when the product is saved again", async () => {
    const abaya = await newProduct(0);
    const received = await newSize(abaya, 0);
    await db.query("UPDATE public.variant_costs SET cost_price = 21 WHERE variant_id = $1", [
      received,
    ]);
    expect(await sizeCost(received)).toBe(21);
    // Saving the product (its description, its price) writes its cost again: nothing moves.
    await db.query("UPDATE public.products SET cost_price = 0 WHERE id = $1", [abaya]);
    expect(await sizeCost(received)).toBe(21);
  });
});
