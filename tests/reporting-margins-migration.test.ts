import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import soldMigration from "../supabase/migrations/20261021140000_reports_count_what_is_sold.sql?raw";
import migration from "../supabase/migrations/20261021160000_reporting_margins.sql?raw";
import {
  marginRows,
  productMargins,
  categoryMargins,
  marginTotals,
} from "../src/features/finance-reports/lib/margins";

// Margin by product (migration 20261021160000) in a real Postgres: an order's subtotal and
// discount shared over its lines, a processed return and a refund with no return record taken
// from the products they returned, packaging once an order has left, a restocked piece giving
// its cost back, partner shops' sales, a line with no product and one with no cost; a cancelled
// order and another month left out. The products add up to the statement's net sales and cost
// of goods for the same period.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
let db: PGlite;

const functionOf = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const tag = /\$(\w*)\$/.exec(sql.slice(start))![0];
  const open = sql.indexOf(tag, start);
  const end = sql.indexOf(tag, open + tag.length);
  return `${sql.slice(start, end + tag.length)};`;
};

const SCHEMA = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE TABLE brands (id uuid PRIMARY KEY);
  INSERT INTO brands VALUES ('${BRAND}');
  CREATE FUNCTION public.reporting_brand_id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT '${BRAND}'::uuid $$;
  CREATE TABLE categories (id serial, brand_id uuid, slug text, name_en text, name_ar text);
  CREATE TABLE products (id text PRIMARY KEY, brand_id uuid, name text, name_ar text, category text);
  CREATE TABLE product_variants (id text PRIMARY KEY, product_id text);
  CREATE TABLE orders (
    id text PRIMARY KEY, brand_id uuid, currency text DEFAULT 'BHD', status text,
    payment_status text DEFAULT 'paid', fulfillment_status text, subtotal numeric, discount numeric,
    total numeric, created_at timestamptz DEFAULT '2026-10-10T10:00:00+03:00'
  );
  CREATE TABLE order_items (
    id text PRIMARY KEY, order_id text, brand_id uuid, product_id text, quantity int,
    unit_cost numeric, line_total numeric, packaging_cost_snapshot numeric
  );
  CREATE TABLE return_requests (
    id text PRIMARY KEY, brand_id uuid, order_id text, total_item_refund numeric,
    pro_rated_discount_deduction numeric, refund_status text, refund_processed_at timestamptz
  );
  CREATE TABLE return_items (
    id text PRIMARY KEY, brand_id uuid, return_id text, order_item_id text, product_id text,
    total_price numeric, restocked boolean, restocked_quantity int
  );
  CREATE TABLE incubators (id text PRIMARY KEY, currency text);
  CREATE TABLE incubator_sales (
    id text PRIMARY KEY, brand_id uuid, incubator_id text, variant_id text, quantity int,
    gross_amount numeric, product_cost_snapshot numeric, packaging_cost_snapshot numeric,
    status text, sold_at timestamptz
  );
`;

const DATA = `
  INSERT INTO categories (brand_id, slug, name_en, name_ar) VALUES
    ('${BRAND}', 'abayas', 'Abayas', 'عبايات');
  INSERT INTO products VALUES
    ('A', '${BRAND}', 'Abaya Danah', 'عباية دانة', 'abayas'),
    ('B', '${BRAND}', 'Scarf', NULL, 'scarves'),
    ('C', '${BRAND}', 'Belt', NULL, NULL);
  INSERT INTO product_variants VALUES ('A-52', 'A');
  -- Sold and handed over: a 10% discount over two lines of 60 and 40.
  INSERT INTO orders (id, brand_id, status, fulfillment_status, subtotal, discount, total)
    VALUES ('o1', '${BRAND}', 'completed', 'DELIVERED', 100, 10, 95);
  INSERT INTO order_items VALUES
    ('o1-a', 'o1', '${BRAND}', 'A', 1, 25, 60, 2),
    ('o1-b', 'o1', '${BRAND}', 'B', 2, 5, 40, 1);
  -- Sold, not left yet: a piece with no cost, and a line with no product.
  INSERT INTO orders (id, brand_id, status, fulfillment_status, subtotal, discount, total)
    VALUES ('o2', '${BRAND}', 'confirmed', 'NEEDS_PACKING', 40, 0, 40);
  INSERT INTO order_items VALUES
    ('o2-c', 'o2', '${BRAND}', 'C', 1, NULL, 30, 0),
    ('o2-x', 'o2', '${BRAND}', NULL, 1, 4, 10, 0);
  -- Cancelled, and another month: left out.
  INSERT INTO orders (id, brand_id, status, fulfillment_status, subtotal, discount, total)
    VALUES ('o3', '${BRAND}', 'cancelled', 'NEEDS_PACKING', 50, 0, 50);
  INSERT INTO order_items VALUES ('o3-a', 'o3', '${BRAND}', 'A', 1, 25, 50, 0);
  INSERT INTO orders (id, brand_id, status, fulfillment_status, subtotal, discount, total, created_at)
    VALUES ('o5', '${BRAND}', 'completed', 'DELIVERED', 70, 0, 70, '2026-09-10T10:00:00+03:00');
  INSERT INTO order_items VALUES ('o5-a', 'o5', '${BRAND}', 'A', 1, 25, 70, 0);
  -- Its payment refunded with no return record: the order's total, from its lines.
  INSERT INTO orders (id, brand_id, status, payment_status, fulfillment_status, subtotal, discount, total)
    VALUES ('o4', '${BRAND}', 'confirmed', 'refunded', 'NEEDS_PACKING', 20, 0, 20);
  INSERT INTO order_items VALUES ('o4-a', 'o4', '${BRAND}', 'A', 1, 8, 20, 0);
  -- The two scarves came back and went back on the shelf.
  INSERT INTO return_requests VALUES
    ('r1', '${BRAND}', 'o1', 40, 4, 'processed', '2026-10-15T10:00:00+03:00');
  INSERT INTO return_items VALUES ('r1-b', '${BRAND}', 'r1', 'o1-b', 'B', 40, true, 2);
  -- A partner shop sold one abaya.
  INSERT INTO incubators VALUES ('shop', 'BHD');
  INSERT INTO incubator_sales VALUES
    ('s1', '${BRAND}', 'shop', 'A-52', 1, 70, 30, 1, 'confirmed', '2026-10-12T10:00:00+03:00');
`;

let rows: ReturnType<typeof marginRows>;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(functionOf(soldMigration, "order_counts_as_sold"));
  await db.exec(functionOf(soldMigration, "reporting_counts_order"));
  await db.exec(migration);
  await db.exec(DATA);
  const { rows: result } = await db.query<{ r: unknown }>(
    "SELECT public.rpc_reporting_margins('2026-10-01T00:00:00+03:00', '2026-10-31T23:59:59.999+03:00', false, 'pura') AS r",
  );
  rows = marginRows(result[0].r);
});

describe("margin by product", () => {
  const product = (name: string) => productMargins(rows, "BHD", "en").find((l) => l.name === name)!;

  it("shares an order's subtotal and discount over its lines, and counts every sale of a product", () => {
    // Order 1's line, the refunded order's line, and the partner shop's sale.
    expect(product("Abaya Danah")).toMatchObject({
      category: "Abayas",
      units: 3,
      partnerUnits: 1,
      grossSales: 150,
      discounts: 6,
      returns: 20,
      netSales: 124,
      cost: 66,
    });
  });

  it("takes a return from what it returned, and a restocked piece gives its cost back", () => {
    expect(product("Scarf")).toMatchObject({
      category: "scarves",
      grossSales: 40,
      discounts: 4,
      returns: 36,
      netSales: 0,
      cost: 2,
    });
  });

  it("keeps a piece with no cost and a line with no product, so nothing is lost", () => {
    expect(product("Belt")).toMatchObject({ netSales: 30, cost: 0, missingCost: true });
    expect(product("Not linked to a product")).toMatchObject({ netSales: 10, cost: 4 });
  });

  it("adds up to the statement's net sales and cost of goods for the period", async () => {
    const totals = marginTotals(productMargins(rows, "BHD", "en"));
    // The statement: sold orders' subtotal less discount (90 + 40 + 20), the partner sale (70),
    // less returns (36 + 20); cost of goods 51 + 31, less the restocked scarves' 10.
    expect(totals.netSales).toBeCloseTo(164, 6);
    expect(totals.cost).toBeCloseTo(72, 6);
    const { rows: direct } = await db.query<{ net: string }>(
      `SELECT sum(subtotal - discount) AS net FROM orders
        WHERE status NOT IN ('cancelled') AND created_at >= '2026-10-01T00:00:00+03:00'`,
    );
    expect(Number(direct[0].net) + 70 - 56).toBeCloseTo(totals.netSales, 6);
  });
});

describe("margin by category", () => {
  it("groups products by their category, a product with none by its own word", () => {
    const lines = categoryMargins(rows, "BHD", "en");
    expect(lines.map((l) => [l.name, l.products])).toEqual(
      expect.arrayContaining([
        ["Abayas", 1],
        ["scarves", 1],
        ["No category", 1],
        ["Not linked to a product", 1],
      ]),
    );
    const total = marginTotals(lines);
    expect(total.netSales).toBeCloseTo(164, 6);
  });
});
