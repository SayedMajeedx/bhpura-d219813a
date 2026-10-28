import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261028160000_promo_codes_scope_and_limits.sql?raw";

// A promo code's own rules, held by the database (migration 20261028160000), run in a real
// Postgres: its dates, its total redemptions, the products and categories it is for, the lines on
// sale and the lines whose margin it would take below the code's floor. The live function checked
// none of the first, second and last: a code past its end date still worked at checkout.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const ABAYA = "00000000-0000-4000-8000-00000000a001";
const DRESS = "00000000-0000-4000-8000-00000000d001";
const SCARF = "00000000-0000-4000-8000-00000000f001";
const v = (product: string) => product.replace(/(.{8})$/, (tail) => `9${tail.slice(1)}`);

let db: PGlite;

/** The code's validation for a cart of [product, line total] lines. */
async function validate(code: string, lines: Array<[string, number]> | null, subtotal?: number) {
  const items = lines
    ? lines.map(([product, total]) => ({ variant_id: v(product), line_total: total }))
    : null;
  const total = subtotal ?? (lines ?? []).reduce((sum, [, amount]) => sum + amount, 0);
  const { rows } = await db.query<{ r: Record<string, unknown> }>(
    `SELECT public.validate_promo_code_before_returning_customer_guard_20260825(
       'store', $1, $2::numeric, $3::jsonb, NULL) AS r`,
    [code, total, items ? JSON.stringify(items) : null],
  );
  return rows[0].r;
}

/** One code with the columns the test sets (the rest are the table's defaults). */
async function code(name: string, columns: Record<string, string | number | boolean | null> = {}) {
  const values = { discount_type: "percentage", discount_value: 10, ...columns };
  const keys = Object.keys(values);
  const sql = `INSERT INTO public.promo_codes (brand_id, code, ${keys.join(", ")})
    VALUES ('${BRAND}', '${name}', ${keys.map((_, i) => `$${i + 1}`).join(", ")})`;
  await db.query(sql, Object.values(values));
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION public.current_brand_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, is_active boolean);
    INSERT INTO public.brands VALUES ('${BRAND}', 'store', true), ('${OTHER}', 'other', true);
    CREATE TABLE public.products (id uuid PRIMARY KEY, brand_id uuid, category text);
    INSERT INTO public.products VALUES ('${ABAYA}', '${BRAND}', 'abayas'),
      ('${DRESS}', '${BRAND}', 'dresses'), ('${SCARF}', '${BRAND}', NULL);
    CREATE TABLE public.product_variants (id uuid PRIMARY KEY, brand_id uuid, product_id uuid,
      selling_price numeric(14,3), original_price numeric(14,3));
    INSERT INTO public.product_variants VALUES
      ('${v(ABAYA)}', '${BRAND}', '${ABAYA}', 100, NULL),
      ('${v(DRESS)}', '${BRAND}', '${DRESS}', 100, NULL),
      ('${v(SCARF)}', '${BRAND}', '${SCARF}', 100, 140);
    CREATE TABLE public.product_costs (product_id uuid PRIMARY KEY, cost_price numeric);
    CREATE TABLE public.variant_costs (variant_id uuid PRIMARY KEY, cost_price numeric);
    CREATE TABLE public.customers (id uuid PRIMARY KEY, brand_id uuid, auth_user_id uuid);
    CREATE TABLE public.promo_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid NOT NULL, code text NOT NULL,
      discount_type text NOT NULL DEFAULT 'percentage', discount_value numeric NOT NULL DEFAULT 10,
      minimum_order_amount numeric, maximum_discount_amount numeric,
      first_time_customers_only boolean NOT NULL DEFAULT false,
      returning_customers_only boolean NOT NULL DEFAULT false,
      exclude_sale_items boolean NOT NULL DEFAULT false,
      usage_limit_per_customer integer, is_active boolean NOT NULL DEFAULT true,
      exclude_low_margin boolean NOT NULL DEFAULT false,
      margin_threshold numeric(5,2) NOT NULL DEFAULT 20,
      start_date timestamptz, end_date timestamptz, max_redemptions integer);
    CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brand_id uuid,
      customer_id uuid, status text, payment_status text, promo_code_id uuid);
  `);
  await db.exec(migration);
});

describe("a code with no rules of its own", () => {
  it("takes its share off every line, as before", async () => {
    await code("PLAIN10");
    expect(
      await validate("PLAIN10", [
        [ABAYA, 60],
        [DRESS, 40],
      ]),
    ).toMatchObject({
      valid: true,
      discount_amount: 10,
      discountable_subtotal: 100,
    });
  });

  it("keeps the earlier rules: a minimum, a cap and a fixed amount", async () => {
    await code("MIN", { minimum_order_amount: 150 });
    expect(await validate("MIN", [[ABAYA, 100]])).toMatchObject({
      valid: false,
      reason: "MINIMUM_NOT_MET",
    });
    await code("CAPPED", { discount_value: 50, maximum_discount_amount: 12 });
    expect(await validate("CAPPED", [[ABAYA, 100]])).toMatchObject({ discount_amount: 12 });
    await code("FIXED", { discount_type: "fixed", discount_value: 500 });
    expect(await validate("FIXED", [[ABAYA, 100]])).toMatchObject({ discount_amount: 100 });
    await code("OFF", { is_active: false });
    expect(await validate("OFF", [[ABAYA, 100]])).toMatchObject({ reason: "CODE_INACTIVE" });
    expect(await validate("NOPE", [[ABAYA, 100]])).toMatchObject({ reason: "CODE_NOT_FOUND" });
  });
});

describe("a code's days", () => {
  it("is refused before it starts and after it ends, and works between", async () => {
    await code("LATER", { start_date: "2099-01-01T00:00:00Z" });
    await code("OVER", { end_date: "2020-01-01T00:00:00Z" });
    await code("NOW", { start_date: "2020-01-01T00:00:00Z", end_date: "2099-01-01T00:00:00Z" });
    expect(await validate("LATER", [[ABAYA, 100]])).toMatchObject({
      valid: false,
      reason: "CODE_NOT_STARTED",
    });
    expect(await validate("OVER", [[ABAYA, 100]])).toMatchObject({
      valid: false,
      reason: "CODE_EXPIRED",
    });
    expect(await validate("NOW", [[ABAYA, 100]])).toMatchObject({ valid: true });
  });
});

describe("a code's total redemptions", () => {
  it("counts the orders that carry it, not the cancelled ones or the drafts", async () => {
    await code("TWICE", { max_redemptions: 2 });
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM public.promo_codes WHERE code = 'TWICE'`,
    );
    const id = rows[0].id;
    const place = (status: string) =>
      db.query(`INSERT INTO public.orders (brand_id, status, promo_code_id) VALUES ($1, $2, $3)`, [
        BRAND,
        status,
        id,
      ]);
    await place("cancelled");
    await place("draft");
    expect(await validate("TWICE", [[ABAYA, 100]])).toMatchObject({ valid: true });
    await place("confirmed");
    expect(await validate("TWICE", [[ABAYA, 100]])).toMatchObject({ valid: true });
    await place("pending");
    expect(await validate("TWICE", [[ABAYA, 100]])).toMatchObject({
      valid: false,
      reason: "CODE_MAX_REDEMPTIONS_REACHED",
      max_redemptions: 2,
    });
  });
});

describe("the products and categories a code is for", () => {
  const cart: Array<[string, number]> = [
    [ABAYA, 60],
    [DRESS, 40],
  ];

  it("takes its share off the chosen products only", async () => {
    await code("ABAYAS", { discount_value: 50 });
    await db.query(
      `UPDATE public.promo_codes SET product_ids = ARRAY['${ABAYA}']::uuid[] WHERE code = 'ABAYAS'`,
    );
    expect(await validate("ABAYAS", cart)).toMatchObject({
      valid: true,
      discount_amount: 30,
      discountable_subtotal: 60,
    });
  });

  it("takes it off a chosen category, and off a product or a category when both are chosen", async () => {
    await code("DRESSES");
    await db.query(
      `UPDATE public.promo_codes SET category_slugs = ARRAY['dresses'] WHERE code = 'DRESSES'`,
    );
    expect(await validate("DRESSES", cart)).toMatchObject({ discount_amount: 4 });
    await code("BOTH");
    await db.query(
      `UPDATE public.promo_codes SET product_ids = ARRAY['${ABAYA}']::uuid[],
         category_slugs = ARRAY['dresses'] WHERE code = 'BOTH'`,
    );
    expect(await validate("BOTH", cart)).toMatchObject({ discount_amount: 10 });
  });

  it("is refused when nothing in the cart is what it is for, or when there is no cart to judge", async () => {
    await code("SCARVES");
    await db.query(
      `UPDATE public.promo_codes SET product_ids = ARRAY['${SCARF}']::uuid[] WHERE code = 'SCARVES'`,
    );
    expect(await validate("SCARVES", cart)).toMatchObject({
      valid: false,
      reason: "NO_ELIGIBLE_ITEMS",
    });
    expect(await validate("SCARVES", null, 100)).toMatchObject({
      valid: false,
      reason: "NO_ELIGIBLE_ITEMS",
    });
  });

  it("still counts the minimum on the whole cart, and stays inside the chosen lines for a fixed amount", async () => {
    await code("FIXEDABAYA", {
      discount_type: "fixed",
      discount_value: 80,
      minimum_order_amount: 90,
    });
    await db.query(
      `UPDATE public.promo_codes SET product_ids = ARRAY['${ABAYA}']::uuid[] WHERE code = 'FIXEDABAYA'`,
    );
    expect(await validate("FIXEDABAYA", cart)).toMatchObject({ discount_amount: 60 });
    expect(await validate("FIXEDABAYA", [[ABAYA, 60]])).toMatchObject({
      reason: "MINIMUM_NOT_MET",
    });
  });
});

describe("the lines on sale", () => {
  it("are left out when the code says so, with the chosen products or without", async () => {
    await code("NOSALE", { exclude_sale_items: true, discount_value: 50 });
    expect(
      await validate("NOSALE", [
        [ABAYA, 60],
        [SCARF, 40],
      ]),
    ).toMatchObject({
      discount_amount: 30,
      discountable_subtotal: 60,
    });
    expect(await validate("NOSALE", [[SCARF, 40]])).toMatchObject({ reason: "NO_ELIGIBLE_ITEMS" });
  });
});

describe("the margin floor", () => {
  it("leaves out the lines the discount would take below it, judged by the size's own cost first", async () => {
    await db.query(`INSERT INTO public.product_costs VALUES ('${ABAYA}', 40), ('${DRESS}', 90)`);
    // A 30% code on a 100 line leaves 70: the abaya (cost 40) keeps 42%, the dress (cost 90) is
    // below zero.
    await code("SAFE", { discount_value: 30, exclude_low_margin: true, margin_threshold: 20 });
    expect(
      await validate("SAFE", [
        [ABAYA, 60],
        [DRESS, 40],
      ]),
    ).toMatchObject({
      valid: true,
      discount_amount: 18,
      discountable_subtotal: 60,
    });
    // The dress's own size cost wins over its product's, and brings it back above the floor.
    await db.query(`INSERT INTO public.variant_costs VALUES ('${v(DRESS)}', 30)`);
    expect(
      await validate("SAFE", [
        [ABAYA, 60],
        [DRESS, 40],
      ]),
    ).toMatchObject({
      discount_amount: 30,
      discountable_subtotal: 100,
    });
  });

  it("keeps a line with no known cost, and refuses a cart where every line is below the floor", async () => {
    await code("NOCOST", { discount_value: 30, exclude_low_margin: true });
    expect(await validate("NOCOST", [[SCARF, 100]])).toMatchObject({ valid: true });
    await db.query(`INSERT INTO public.product_costs VALUES ('${SCARF}', 99)`);
    expect(await validate("NOCOST", [[SCARF, 100]])).toMatchObject({ reason: "NO_ELIGIBLE_ITEMS" });
  });

  it("a code without the switch ignores cost altogether", async () => {
    await code("NOFLOOR", { discount_value: 30 });
    expect(await validate("NOFLOOR", [[SCARF, 100]])).toMatchObject({ discount_amount: 30 });
  });
});

describe("what the migration adds", () => {
  it("gives a code an empty scope until a store chooses, so it reaches every line", async () => {
    await db.query(`INSERT INTO public.promo_codes (brand_id, code) VALUES ('${BRAND}', 'FRESH')`);
    const { rows } = await db.query<{ p: string[]; c: string[] }>(
      `SELECT product_ids AS p, category_slugs AS c FROM public.promo_codes WHERE code = 'FRESH'`,
    );
    expect(rows[0]).toEqual({ p: [], c: [] });
  });
  it("bounds how long a scope may be", async () => {
    const many = Array.from({ length: 60 }, (_, i) => `'c${i}'`).join(",");
    await expect(
      db.exec(
        `UPDATE public.promo_codes SET category_slugs = ARRAY[${many}] WHERE code = 'PLAIN10'`,
      ),
    ).rejects.toThrow();
  });
});
