import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261025100000_category_counts_and_support_optin.sql?raw";
import { NOT_SOLD_ORDER_STATUSES } from "../src/lib/data/orders/sold-orders";
import { productOnSale } from "../src/lib/product-price";

// Migration 20261025100000 run in a real Postgres (PGlite): the categories page counts its
// automatic collections as the storefront does, and a new store starts without support access.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const STORE = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-0000000000a1";

const notSold = NOT_SOLD_ORDER_STATUSES.map((s) => `'${s}'`).join(", ");

const SCHEMA = `
  CREATE SCHEMA auth;
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT auth.uid() IS NOT NULL $$;
  CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT auth.uid() = '${ADMIN}'::uuid AND b = '${STORE}'::uuid $$;
  CREATE FUNCTION public.order_counts_as_sold(p_status text) RETURNS boolean LANGUAGE sql IMMUTABLE
    AS $$ SELECT COALESCE(lower(p_status), '') NOT IN (${notSold}) $$;

  CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, support_access_enabled boolean NOT NULL DEFAULT true);
  CREATE TABLE public.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, name_ar text, name_en text,
    slug text, sort_order int, is_active boolean DEFAULT true, parent_id uuid, image_url text,
    menu_icon_url text
  );
  CREATE TABLE public.products (
    id uuid PRIMARY KEY, brand_id uuid, category text, is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(), base_price numeric, show_sale_badge boolean DEFAULT true,
    item_kind text DEFAULT 'product', is_made_to_order boolean DEFAULT false,
    made_to_order_available int, made_to_order_paused_at timestamptz
  );
  CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid, selling_price numeric,
    original_price numeric, stock_main int DEFAULT 0, stock_incubator int DEFAULT 0
  );
  CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid, status text, payment_status text);
  CREATE TABLE public.order_items (order_id uuid, product_id uuid);
`;

type Product = {
  id: string;
  kind?: "product" | "service";
  madeToOrder?: boolean;
  paused?: boolean;
  variants: Array<{ price: number; was?: number; stock?: number }>;
};

// One sold-out discounted size; a discount on a size with pieces; a made-to-order piece on sale
// with no pieces; the same paused; a full-price one; and one whose every size is sold out.
const PRODUCTS: Product[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    variants: [
      { price: 20, was: 30, stock: 0 },
      { price: 25, stock: 2 },
    ],
  },
  { id: "10000000-0000-4000-8000-000000000002", variants: [{ price: 20, was: 30, stock: 1 }] },
  {
    id: "10000000-0000-4000-8000-000000000003",
    madeToOrder: true,
    variants: [{ price: 40, was: 50 }],
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    madeToOrder: true,
    paused: true,
    variants: [
      { price: 40, was: 50 },
      { price: 45, stock: 1 },
    ],
  },
  { id: "10000000-0000-4000-8000-000000000005", variants: [{ price: 30, stock: 4 }] },
  { id: "10000000-0000-4000-8000-000000000006", variants: [{ price: 10, was: 12, stock: 0 }] },
];

let db: PGlite;

const count = async (slug: string) => {
  await db.exec(`SET test.uid = '${ADMIN}'`);
  const { rows } = await db.query<{ product_count: number }>(
    `SELECT product_count FROM public.get_brand_categories_with_counts($1) WHERE slug = $2`,
    [STORE, slug],
  );
  return rows[0]?.product_count;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(`INSERT INTO public.brands (id, slug) VALUES ('${STORE}', 'pura')`);
  for (const slug of ["sale", "most-selling", "abayas"]) {
    await db.query(
      `INSERT INTO public.categories (brand_id, slug, sort_order) VALUES ($1, $2, 1)`,
      [STORE, slug],
    );
  }
  for (const p of PRODUCTS) {
    await db.query(
      `INSERT INTO public.products (id, brand_id, category, item_kind, is_made_to_order, made_to_order_paused_at)
       VALUES ($1, $2, 'abayas', $3, $4, $5)`,
      [
        p.id,
        STORE,
        p.kind ?? "product",
        Boolean(p.madeToOrder),
        p.paused ? new Date().toISOString() : null,
      ],
    );
    for (const v of p.variants) {
      await db.query(
        `INSERT INTO public.product_variants (product_id, selling_price, original_price, stock_main) VALUES ($1, $2, $3, $4)`,
        [p.id, v.price, v.was ?? null, v.stock ?? 0],
      );
    }
  }
  // Best sellers: a paid order, an order delivered with cash still to collect, a cancelled one.
  const orders: Array<[string, string, string]> = [
    ["completed", "paid", PRODUCTS[0].id],
    ["completed", "unpaid", PRODUCTS[1].id],
    ["cancelled", "paid", PRODUCTS[4].id],
  ];
  for (const [status, payment, product] of orders) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.orders (brand_id, status, payment_status) VALUES ($1, $2, $3) RETURNING id`,
      [STORE, status, payment],
    );
    await db.query(`INSERT INTO public.order_items (order_id, product_id) VALUES ($1, $2)`, [
      rows[0].id,
      product,
    ]);
  }
  await db.exec(migration);
});

describe("the categories page's automatic collections", () => {
  it("counts on sale what the storefront puts on sale, whatever the badge switch", async () => {
    const storefront = PRODUCTS.filter((p) =>
      productOnSale({
        item_kind: p.kind ?? "product",
        is_made_to_order: Boolean(p.madeToOrder),
        made_to_order_paused_at: p.paused ? "2026-10-24" : null,
        product_variants: p.variants.map((v) => ({
          selling_price: v.price,
          original_price: v.was ?? null,
          stock_main: v.stock ?? 0,
          stock_incubator: 0,
        })),
      }),
    ).length;
    expect(storefront).toBe(3);
    expect(await count("sale")).toBe(storefront);
  });

  it("counts best sellers by orders that count as sold, paid or not yet", async () => {
    expect(await count("most-selling")).toBe(2);
  });

  it("still refuses a caller who is not the store's admin", async () => {
    await db.exec(`SET test.uid = '00000000-0000-4000-8000-0000000000ff'`);
    await expect(
      db.query(`SELECT * FROM public.get_brand_categories_with_counts($1)`, [STORE]),
    ).rejects.toThrow(/Access denied/);
  });
});

describe("support access", () => {
  it("is off for a new store until its owner agrees, and kept for the stores that exist", async () => {
    await db.exec(
      `INSERT INTO public.brands (id, slug) VALUES ('00000000-0000-4000-8000-000000000002', 'new-store')`,
    );
    const { rows } = await db.query<{ slug: string; support_access_enabled: boolean }>(
      `SELECT slug, support_access_enabled FROM public.brands ORDER BY slug`,
    );
    expect(rows).toEqual([
      { slug: "new-store", support_access_enabled: false },
      { slug: "pura", support_access_enabled: true },
    ]);
  });
});
