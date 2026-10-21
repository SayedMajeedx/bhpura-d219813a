import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261021140000_reports_count_what_is_sold.sql?raw";
import { countsAsSold, NOT_SOLD_ORDER_STATUSES } from "../src/lib/data/orders/sold-orders";

// The report functions as migration 20261021140000 defines them, run in a real Postgres (PGlite)
// over one month of a store's orders: every order that counts as sold is revenue (paid or not
// yet), returns are deducted once, the period's last day is in, and fees are on what was charged.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const STORE = "00000000-0000-4000-8000-000000000001";
const OWNER = "00000000-0000-4000-8000-0000000000a1";
const TZ = "Asia/Bahrain";
// October 2026 on a Bahrain clock, as the screens send it (the last day's last moment).
const FROM = "2026-09-30T21:00:00.000Z";
const TO = "2026-10-31T20:59:59.999Z";

const SCHEMA = `
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY, brand_id uuid, role text, status text);
  CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT current_setting('test.finance', true) = 'yes' $$;
  CREATE FUNCTION public.can_access_brand(b uuid) RETURNS boolean LANGUAGE sql STABLE
    AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND brand_id = b) $$;

  CREATE TABLE public.brands (id uuid PRIMARY KEY, slug text, is_active boolean DEFAULT true);
  CREATE TABLE public.business_settings (
    brand_id uuid PRIMARY KEY, currency text, card_processing_fee numeric, benefit_processing_fee numeric
  );
  CREATE TABLE public.customers (id uuid PRIMARY KEY, brand_id uuid, name text);
  CREATE TABLE public.orders (
    id text PRIMARY KEY, brand_id uuid, created_at timestamptz, order_date date, invoice_number int,
    status text, fulfillment_status text, payment_status text, payment_method text,
    fulfillment_method text, currency text DEFAULT 'BHD', customer_id uuid,
    subtotal numeric DEFAULT 0, discount numeric DEFAULT 0, shipping numeric DEFAULT 0,
    tax_amount numeric DEFAULT 0, total numeric DEFAULT 0, advance_paid numeric DEFAULT 0
  );
  CREATE TABLE public.products (
    id uuid PRIMARY KEY, brand_id uuid, name text, direct_packaging_cost numeric,
    is_made_to_order boolean DEFAULT false, item_kind text DEFAULT 'product',
    made_to_order_available int, made_to_order_paused_at timestamptz
  );
  CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY, brand_id uuid, product_id uuid, sku text, size text, color text,
    fabric text, stock int, stock_main int, stock_incubator int
  );
  CREATE TABLE public.product_bom_items (
    product_id uuid, brand_id uuid, packaging_material_id uuid, quantity_per_unit numeric
  );
  CREATE TABLE public.packaging_materials (id uuid PRIMARY KEY, brand_id uuid, unit_cost numeric);
  CREATE TABLE public.order_items (
    id text PRIMARY KEY, order_id text, brand_id uuid, product_id uuid, variant_id uuid,
    description text, quantity int, line_total numeric, unit_cost numeric,
    packaging_cost_snapshot numeric
  );
  CREATE TABLE public.expenses (
    brand_id uuid, amount numeric, currency text DEFAULT 'BHD', expense_type text,
    expense_date date, category text
  );
  CREATE TABLE public.return_requests (
    id text PRIMARY KEY, brand_id uuid, order_id text, refund_status text,
    refund_processed_at timestamptz, net_refund_amount numeric, total_item_refund numeric,
    pro_rated_discount_deduction numeric DEFAULT 0
  );
  CREATE TABLE public.return_items (
    return_id text, brand_id uuid, order_item_id text, restocked_quantity int, restocked boolean
  );

  -- As it is live (pg_get_functiondef, 2026-10-21): finance staff of the store only.
  CREATE FUNCTION public.reporting_brand_id(p_brand_slug text DEFAULT NULL::text)
   RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
  AS $function$
  DECLARE v_profile public.profiles%ROWTYPE; v_brand_id uuid;
  BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile.id IS NULL OR lower(COALESCE(v_profile.status, 'active')) NOT IN ('active', 'approved') THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
    IF NOT public.has_permission('view_financials') THEN
      RAISE EXCEPTION 'Denied: view_financials permission required';
    END IF;
    IF NULLIF(btrim(p_brand_slug), '') IS NOT NULL THEN
      SELECT id INTO v_brand_id FROM public.brands
       WHERE lower(slug) = lower(btrim(p_brand_slug)) AND is_active = true LIMIT 1;
    END IF;
    IF v_brand_id IS NULL AND v_profile.brand_id IS NOT NULL THEN v_brand_id := v_profile.brand_id; END IF;
    IF v_brand_id IS NOT NULL AND v_profile.role <> 'super_admin' AND NOT public.can_access_brand(v_brand_id) THEN
      RAISE EXCEPTION 'BRAND_NOT_FOUND_OR_FORBIDDEN';
    END IF;
    IF v_brand_id IS NULL THEN RAISE EXCEPTION 'BRAND_NOT_FOUND_OR_FORBIDDEN'; END IF;
    RETURN v_brand_id;
  END;
  $function$;
`;

const PRODUCT = "00000000-0000-4000-8000-0000000000b1";
const VARIANT = "00000000-0000-4000-8000-0000000000d1";
const MADE = "00000000-0000-4000-8000-0000000000b2";
const MADE_VARIANT = "00000000-0000-4000-8000-0000000000d2";

const DATA = `
  INSERT INTO public.brands VALUES ('${STORE}', 'pura', true);
  INSERT INTO public.business_settings VALUES ('${STORE}', 'BHD', 2, 1);
  INSERT INTO public.profiles VALUES ('${OWNER}', '${STORE}', 'brand_admin', 'active');
  INSERT INTO public.products (id, brand_id, name) VALUES ('${PRODUCT}', '${STORE}', 'Abaya');
  INSERT INTO public.products (id, brand_id, name, is_made_to_order) VALUES ('${MADE}', '${STORE}', 'Bisht', true);
  INSERT INTO public.product_variants VALUES
    ('${VARIANT}', '${STORE}', '${PRODUCT}', 'AB-52', '52', NULL, NULL, 1, 1, 2),
    ('${MADE_VARIANT}', '${STORE}', '${MADE}', 'BI-56', '56', NULL, NULL, 0, 0, 0);

  INSERT INTO public.orders (id, brand_id, created_at, status, fulfillment_status, payment_status,
      payment_method, total, subtotal, advance_paid) VALUES
    -- Sold and paid by card.
    ('A', '${STORE}', '2026-10-03T10:00Z', 'completed', 'COMPLETED', 'paid', 'card', 30, 30, 30),
    -- Paid by its advance, still being made.
    ('B', '${STORE}', '2026-10-05T10:00Z', 'in_production', 'in_production', 'partially_paid', 'benefit', 50, 50, 20),
    -- Delivered, its cash still to collect.
    ('C', '${STORE}', '2026-10-09T10:00Z', 'completed', 'COMPLETED', 'pending', 'cod', 22, 22, 0),
    -- Not sold: cancelled, awaiting its transfer, returned in full.
    ('D', '${STORE}', '2026-10-10T10:00Z', 'cancelled', 'cancelled', 'paid', 'cod', 40, 40, 40),
    ('E', '${STORE}', '2026-10-11T10:00Z', 'pending_verification', 'pending', 'pending', 'benefit', 15, 15, 0),
    ('F', '${STORE}', '2026-10-12T10:00Z', 'returned', 'returned', 'paid', 'cod', 25, 25, 25),
    -- Sold, then one piece of it returned.
    ('G', '${STORE}', '2026-10-14T10:00Z', 'completed', 'COMPLETED', 'paid', 'cod', 60, 60, 60),
    -- 1 November in Bahrain (22:00 UTC on 31 October): outside the month.
    ('H', '${STORE}', '2026-10-31T22:00Z', 'completed', 'COMPLETED', 'paid', 'cod', 99, 99, 99),
    -- The month's last evening in Bahrain: inside it.
    ('I', '${STORE}', '2026-10-31T20:30Z', 'completed', 'COMPLETED', 'paid', 'cod', 8, 8, 8);

  INSERT INTO public.order_items VALUES
    ('A1', 'A', '${STORE}', '${PRODUCT}', '${VARIANT}', NULL, 1, 30, 17, 0.571),
    ('B1', 'B', '${STORE}', '${MADE}', '${MADE_VARIANT}', NULL, 1, 50, 20, 0.5),
    ('C1', 'C', '${STORE}', '${PRODUCT}', '${VARIANT}', NULL, 1, 22, 10, 0.5),
    ('D1', 'D', '${STORE}', '${PRODUCT}', '${VARIANT}', NULL, 1, 40, 17, 0.5),
    ('F1', 'F', '${STORE}', '${PRODUCT}', '${VARIANT}', NULL, 1, 25, 12, 0.5),
    ('G1', 'G', '${STORE}', '${PRODUCT}', '${VARIANT}', NULL, 1, 50, 18, 0.5),
    ('G2', 'G', '${STORE}', '${PRODUCT}', '${VARIANT}', NULL, 1, 10, 4, 0.5),
    ('I1', 'I', '${STORE}', '${PRODUCT}', '${VARIANT}', NULL, 1, 8, 5, 0.5);

  INSERT INTO public.return_requests VALUES
    ('RF', '${STORE}', 'F', 'processed', '2026-10-20T10:00Z', 25, 25, 0),
    ('RG', '${STORE}', 'G', 'processed', '2026-10-21T10:00Z', 10, 10, 0);
  INSERT INTO public.return_items VALUES
    ('RF', '${STORE}', 'F1', 1, true),
    ('RG', '${STORE}', 'G2', 1, true);

  INSERT INTO public.expenses VALUES
    ('${STORE}', 5, 'BHD', 'opex', '2026-10-31', 'Rent'),
    ('${STORE}', 7, 'BHD', 'opex', '2026-11-01', 'Rent'),
    ('${STORE}', 50, 'BHD', 'cogs', '2026-10-16', 'Fabric');
`;

let db: PGlite;

async function report<T = Record<string, unknown>>(sql: string): Promise<T> {
  const { rows } = await db.query<{ r: T }>(`SELECT ${sql} AS r`);
  return rows[0].r;
}

const range = `'${FROM}'::timestamptz, '${TO}'::timestamptz`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(DATA);
  await db.exec(migration);
  await db.exec(`SET test.uid = '${OWNER}'; SET test.finance = 'yes';`);
});

describe("which orders count as sold", () => {
  it("is the same rule in the database as in the app, for every status", async () => {
    const statuses = [
      ...NOT_SOLD_ORDER_STATUSES,
      "completed",
      "COMPLETED",
      " Delivered ",
      "in_production",
      "partially_paid",
      "packing",
      "SENT_TO_TAILOR",
      "Cancelled",
      "",
      null,
    ];
    for (const status of statuses) {
      const { rows } = await db.query<{ sold: boolean }>(
        "SELECT public.order_counts_as_sold($1) AS sold",
        [status],
      );
      expect([status, rows[0].sold]).toEqual([status, countsAsSold(status)]);
    }
  });

  it("takes archived historical orders only when the report asks for them", async () => {
    const counted = async (include: boolean) =>
      (
        await db.query<{ c: boolean }>("SELECT public.reporting_counts_order($1, $2) AS c", [
          "archived_historical",
          include,
        ])
      ).rows[0].c;
    expect(await counted(false)).toBe(false);
    expect(await counted(true)).toBe(true);
  });
});

describe("the overview of a month", () => {
  it("counts every sold order as revenue, with what was collected and what is still owed", async () => {
    const [row] = await report<Record<string, number>[]>(
      `public.rpc_reporting_overview(${range}, '${TZ}', false, 'pura')`,
    );
    // A 30 + B 50 + C 22 + G 60 + I 8; not D (cancelled), E (awaiting transfer), F (returned), H (November).
    expect(Number(row.paid_order_value)).toBe(170);
    expect(Number(row.paid_order_count)).toBe(5);
    expect(Number(row.collected)).toBe(30 + 20 + 0 + 60 + 8);
    expect(Number(row.owed_by_customers)).toBe(30 + 22);
    expect(Number(row.partial_amount)).toBe(20);
    // Operating expenses: the month's last day in, the next day out, cost-of-goods expenses aside.
    expect(Number(row.expenses)).toBe(5);
  });

  it("works cost of goods out on the sold orders, packaging only for orders that left", async () => {
    const [row] = await report<Record<string, number>[]>(
      `public.rpc_reporting_order_cogs(${range}, false, 'pura')`,
    );
    expect(Number(row.product_cogs)).toBe(17 + 20 + 10 + 18 + 4 + 5);
    // B is still being made: no packaging yet.
    expect(Number(row.packaging_cogs)).toBeCloseTo(0.571 + 0.5 + 0.5 + 0.5 + 0.5, 3);
  });

  it("deducts a return once: from an order that is still sold, not from one returned in full", async () => {
    const [row] = await report<Record<string, number>[]>(
      `public.rpc_reporting_processed_returns(${range}, '${TZ}', 'pura')`,
    );
    // The names the app reads (src/lib/reporting.functions.ts): revenue_deduction, merchandise_deduction.
    expect(Number(row.revenue_deduction)).toBe(10);
    expect(Number(row.merchandise_deduction)).toBe(10);
    expect(Number(row.refunded_total)).toBe(35);
    expect(Number(row.returned_cogs_reversal)).toBe(4);
  });

  it("works card and BenefitPay fees out on what was charged", async () => {
    const [row] = await report<Record<string, number>[]>(
      `public.rpc_reporting_processing_fees(${range}, false, 'pura')`,
    );
    // A: 2% of 30; B: 1% of its 20 advance.
    expect(Number(row.processing_fees)).toBeCloseTo(0.6 + 0.2, 6);
  });

  it("lists expenses by category through the month's last day", async () => {
    const rows = await report<{ category: string; amount: number }[]>(
      `public.rpc_reporting_expenses(${range}, '${TZ}', 'pura')`,
    );
    const byCategory = Object.fromEntries(rows.map((r) => [r.category, Number(r.amount)]));
    expect(byCategory).toEqual({ Rent: 5, Fabric: 50 });
  });
});

describe("the sales, products and customers reports", () => {
  it("chart the same sold orders as the overview", async () => {
    const sales = await report<{ timeseries: { pov: number; collected: number }[] }>(
      `public.rpc_reporting_sales(${range}, 'month', '${TZ}', false, 'pura')`,
    );
    const total = sales.timeseries.reduce((sum, r) => sum + Number(r.pov), 0);
    expect(total).toBe(170);
    expect(sales.timeseries.reduce((sum, r) => sum + Number(r.collected), 0)).toBe(118);
  });

  it("give each size sold its ready pieces at the store and at partners, and how it is sold", async () => {
    const rows = await report<Record<string, unknown>[]>(
      `public.rpc_reporting_products_inventory(${range}, '${TZ}', false, 50, 0, 'units_sold_desc', 'pura')`,
    );
    const abaya = rows.find((r) => r.variant_id === VARIANT);
    const bisht = rows.find((r) => r.variant_id === MADE_VARIANT);
    expect(abaya).toMatchObject({
      product_id: PRODUCT,
      units_sold: 5,
      stock_main: 1,
      stock_incubator: 2,
      current_stock: 3,
      is_made_to_order: false,
    });
    expect(bisht).toMatchObject({ units_sold: 1, current_stock: 0, is_made_to_order: true });
  });

  it("are for finance staff only", async () => {
    await db.exec("SET test.finance = 'no'");
    await expect(
      report(`public.rpc_reporting_overview(${range}, '${TZ}', false, 'pura')`),
    ).rejects.toThrow(/view_financials/);
    await db.exec("SET test.finance = 'yes'");
  });
});
