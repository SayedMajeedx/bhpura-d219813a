import React from "react";
import { PGlite } from "@electric-sql/pglite";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import soldMigration from "../supabase/migrations/20261021140000_reports_count_what_is_sold.sql?raw";
import migration from "../supabase/migrations/20261021180000_reporting_month_pack.sql?raw";
import { composeOverviewRows } from "../src/lib/reporting-compose";
import { monthPackSheets, readMonthPack } from "../src/features/finance-reports/lib/month-pack";
import { monthsEnding, yearEarlier } from "../src/features/finance-reports/lib/statement";

// The accountant's month pack: the month's detail in a real Postgres (migration
// 20261021180000), the workbook's ten sheets, and the dialog that builds and downloads it.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const stubs = vi.hoisted(() => ({ download: vi.fn(), asked: [] as string[] }));
const ask = (name: string, value: unknown) => {
  stubs.asked.push(name);
  return { queryKey: [name, Math.random()], queryFn: async () => value };
};
const mocks: Record<string, unknown> = {
  "data/reporting": {
    reportingQueries: {
      periods: () => ask("periods", [[], [], []]),
      margins: () => ask("margins", []),
      receivables: () => ask("receivables", { customers: [], partners: [] }),
      monthPack: () => ask("monthPack", {}),
    },
  },
  "brand-context": {
    useBrand: () => ({ id: "b1", slug: "pura", name_en: "Pura Line", name_ar: null }),
  },
};
vi.mock("../src/lib/data/reporting", () => mocks["data/reporting"]);
vi.mock("@/lib/data/reporting", () => mocks["data/reporting"]);
vi.mock("../src/lib/brand-context", () => mocks["brand-context"]);
vi.mock("@/lib/brand-context", () => mocks["brand-context"]);
vi.mock("../src/features/finance-reports/lib/workbook", async (original) => ({
  ...(await original<object>()),
  downloadWorkbook: stubs.download,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { MonthPackDialog } =
  await import("../src/features/finance-reports/components/MonthPackDialog");

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const functionOf = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const tag = /\$(\w*)\$/.exec(sql.slice(start))![0];
  const open = sql.indexOf(tag, start);
  const end = sql.indexOf(tag, open + tag.length);
  return `${sql.slice(start, end + tag.length)};`;
};

describe("the month's detail, in the database", () => {
  let detail: ReturnType<typeof readMonthPack>;

  beforeAll(async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
      CREATE FUNCTION public.reporting_brand_id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT '${BRAND}'::uuid $$;
      CREATE TABLE customers (id text PRIMARY KEY, name text);
      CREATE TABLE orders (id text PRIMARY KEY, brand_id uuid, invoice_number int, created_at timestamptz,
        channel text, status text, payment_status text, payment_method text, fulfillment_method text,
        currency text DEFAULT 'BHD', subtotal numeric, discount numeric, shipping numeric, tax_amount numeric,
        total numeric, advance_paid numeric, customer_id text, customer_name_snapshot text);
      CREATE TABLE incubators (id text PRIMARY KEY, name text, currency text);
      CREATE TABLE products (id text PRIMARY KEY, brand_id uuid, name text, item_kind text);
      CREATE TABLE product_variants (id text PRIMARY KEY, product_id text, sku text, stock_main int, stock_incubator int);
      CREATE TABLE variant_costs (variant_id text, cost_price numeric);
      CREATE TABLE product_costs (product_id text, cost_price numeric);
      CREATE TABLE incubator_sales (id text, brand_id uuid, incubator_id text, variant_id text, quantity int,
        unit_price numeric, gross_amount numeric, commission_amount numeric, net_due numeric, paid_amount numeric,
        product_cost_snapshot numeric, packaging_cost_snapshot numeric, status text, sold_at timestamptz);
      CREATE TABLE incubator_payments (id text, brand_id uuid, incubator_id text, amount numeric,
        payment_date date, payment_method text, reference text, voided_at timestamptz);
      CREATE TABLE return_requests (id text, brand_id uuid, order_id text, return_number text,
        total_item_refund numeric, pro_rated_discount_deduction numeric, tax_refund numeric, return_fee numeric,
        net_refund_amount numeric, refund_method text, refund_status text, refund_processed_at timestamptz);
      CREATE TABLE vendors (id text PRIMARY KEY, name text);
      CREATE TABLE expenses (id serial, brand_id uuid, expense_date date, category text, description text,
        vendor_id text, store_name text, currency text DEFAULT 'BHD', amount numeric, tax_amount numeric,
        expense_type text, created_at timestamptz DEFAULT now());
      CREATE TABLE purchase_orders (id text PRIMARY KEY, brand_id uuid, po_number text, vendor_id text,
        status text, total_amount numeric, paid_amount numeric);
      CREATE TABLE purchase_order_payments (id text, brand_id uuid, po_id text, amount numeric, paid_on date,
        note text, voided_at timestamptz, created_at timestamptz DEFAULT now());

      INSERT INTO customers VALUES ('c1', 'Fatima');
      INSERT INTO orders VALUES
        ('o1', '${BRAND}', 1001, '2026-10-05T10:00:00+03:00', 'storefront', 'completed', 'paid', 'card', 'delivery', 'BHD', 100, 10, 2, 0, 92, 92, 'c1', NULL),
        ('o2', '${BRAND}', 1002, '2026-10-06T10:00:00+03:00', 'admin', 'confirmed', 'partially_paid', 'benefit_pay', 'pickup', 'BHD', 40, 0, 0, 0, 40, 10, NULL, 'Noor'),
        ('o3', '${BRAND}', 1003, '2026-10-07T10:00:00+03:00', 'storefront', 'cancelled', 'unpaid', 'cod', 'delivery', 'BHD', 30, 0, 0, 0, 30, 0, NULL, 'X'),
        ('o4', '${BRAND}', 1004, '2026-09-30T23:30:00+03:00', 'storefront', 'completed', 'paid', 'card', 'delivery', 'BHD', 50, 0, 0, 0, 50, 50, NULL, 'Y');
      INSERT INTO incubators VALUES ('shop', 'Gallery Mall', 'BHD');
      INSERT INTO products VALUES ('A', '${BRAND}', 'Abaya', 'physical'), ('S', '${BRAND}', 'Styling', 'service');
      INSERT INTO product_variants VALUES ('A-52', 'A', 'AB-52', 3, 1), ('A-54', 'A', 'AB-54', 2, 0), ('S-1', 'S', 'SV', 9, 0);
      INSERT INTO variant_costs VALUES ('A-54', 30);
      INSERT INTO product_costs VALUES ('A', 25);
      INSERT INTO incubator_sales VALUES
        ('s1', '${BRAND}', 'shop', 'A-52', 1, 70, 70, 14, 56, 56, 25, 1, 'confirmed', '2026-10-12T10:00:00+03:00'),
        ('s2', '${BRAND}', 'shop', 'A-52', 1, 70, 70, 14, 56, 0, 25, 1, 'reversed', '2026-10-13T10:00:00+03:00');
      INSERT INTO incubator_payments VALUES
        ('p1', '${BRAND}', 'shop', 56, '2026-10-20', 'transfer', 'TR-1', NULL),
        ('p2', '${BRAND}', 'shop', 99, '2026-10-21', 'cash', NULL, '2026-10-22');
      INSERT INTO return_requests VALUES
        ('r1', '${BRAND}', 'o1', 'RET-1', 40, 4, 0, 0, 36, 'card', 'processed', '2026-10-15T10:00:00+03:00');
      INSERT INTO vendors VALUES ('t', 'Umm Ali tailoring');
      INSERT INTO expenses (brand_id, expense_date, category, description, vendor_id, amount, tax_amount, expense_type) VALUES
        ('${BRAND}', '2026-10-01', 'Rent', 'October rent', NULL, 300, 0, 'opex'),
        ('${BRAND}', '2026-10-31', 'Ads', 'Instagram', NULL, 50, 5, 'opex'),
        ('${BRAND}', '2026-11-01', 'Ads', 'Next month', NULL, 99, 0, 'opex'),
        ('${BRAND}', '2026-10-10', 'Fabric', 'Crepe', 't', 80, 8, 'cogs');
      INSERT INTO purchase_orders VALUES
        ('po1', '${BRAND}', 'PO-0001', 't', 'received', 200, 150),
        ('po2', '${BRAND}', 'PO-0002', 't', 'cancelled', 90, 0);
      INSERT INTO purchase_order_payments (id, brand_id, po_id, amount, paid_on, note, voided_at) VALUES
        ('pp1', '${BRAND}', 'po1', 150, '2026-10-18', 'First half', NULL),
        ('pp2', '${BRAND}', 'po1', 20, '2026-10-19', 'Typo', '2026-10-19');
    `);
    await db.exec(functionOf(soldMigration, "order_counts_as_sold"));
    await db.exec(functionOf(soldMigration, "reporting_counts_order"));
    await db.exec(migration);
    const { rows } = await db.query<{ r: unknown }>(
      "SELECT public.rpc_reporting_month_pack('2026-10-01T00:00:00+03:00', '2026-10-31T23:59:59.999+03:00', 'Asia/Bahrain', 'pura') AS r",
    );
    detail = readMonthPack(rows[0].r);
  });

  it("lists the month's sold orders, with what each still owes", () => {
    expect(detail.sales.map((s) => [s.invoice_number, s.customer_name, Number(s.owed)])).toEqual([
      [1001, "Fatima", 0],
      [1002, "Noor", 30],
    ]);
  });

  it("lists partner shops' confirmed sales and payments that stand", () => {
    expect(detail.partner_sales.map((s) => [s.partner, s.sku, Number(s.cost)])).toEqual([
      ["Gallery Mall", "AB-52", 26],
    ]);
    expect(detail.partner_payments.map((p) => Number(p.amount))).toEqual([56]);
  });

  it("lists returns processed, expenses of the month's days, payments to suppliers that stand", () => {
    expect(detail.returns.map((r) => [r.return_number, r.deducted])).toEqual([["RET-1", true]]);
    expect(detail.expenses.map((e) => [e.description, e.running_cost])).toEqual([
      ["October rent", true],
      ["Crepe", false],
      ["Instagram", true],
    ]);
    expect(detail.expenses.find((e) => e.description === "Crepe")!.supplier).toBe(
      "Umm Ali tailoring",
    );
    expect(detail.supplier_payments.map((p) => [p.po_number, Number(p.amount)])).toEqual([
      ["PO-0001", 150],
    ]);
    expect(detail.supplier_owed).toEqual([{ supplier: "Umm Ali tailoring", owed: 50 }]);
  });

  it("values stock at its size's own cost, else its product's; a service is not stock", () => {
    // AB-52: 4 pieces at the product's 25; AB-54: 2 at its own 30.
    expect(detail.stock).toEqual([
      { product: "Abaya", units: 6, value: 160, units_without_cost: null },
    ]);
  });
});

describe("the workbook", () => {
  const [month] = monthsEnding(2026, 10, 1, new Date(2026, 10, 5));
  const [previous] = monthsEnding(2026, 9, 1, new Date(2026, 10, 5));
  const [lastYear] = yearEarlier([month], new Date(2026, 10, 5));
  const row = (net: number) =>
    composeOverviewRows({
      overview: [
        {
          currency: "BHD",
          gross_merch_sales: net,
          net_merch_sales: net,
          paid_order_value: net,
          paid_order_count: 2,
          known_cogs: net / 2,
          expenses: 10,
        },
      ],
      returns: [],
      cogs: [],
      fees: [],
      incubatorSummary: [],
    });
  const sheets = monthPackSheets({
    month,
    previous,
    lastYear,
    periods: [row(200), row(100), row(160)],
    margins: [],
    receivables: { orders: [], partners: [] },
    detail: readMonthPack({
      sales: [
        {
          invoice_number: 1001,
          created_at: "2026-10-05T07:00:00Z",
          currency: "BHD",
          subtotal: 100,
          discount: 10,
          total: 92,
          collected: 92,
          owed: 0,
        },
        {
          invoice_number: 1002,
          created_at: "2026-10-06T07:00:00Z",
          currency: "BHD",
          subtotal: 40,
          total: 40,
          collected: 10,
          owed: 30,
        },
      ],
      expenses: [
        {
          expense_date: "2026-10-01",
          category: "Rent",
          amount: 300,
          tax: 0,
          currency: "BHD",
          running_cost: true,
        },
        {
          expense_date: "2026-10-31",
          category: "Ads",
          amount: 50,
          tax: 5,
          currency: "BHD",
          running_cost: true,
        },
      ],
      stock: [{ product: "Abaya", units: 6, value: 160, units_without_cost: 0 }],
    }),
    currency: "BHD",
    digits: 3,
    lang: "en",
    storeName: "Pura Line",
    timeZone: "Asia/Bahrain",
    today: "2026-11-05",
  });
  const sheet = (name: string) => sheets.find((s) => s.name === name)!;
  const values = (name: string) => sheet(name).rows.map((r) => r.map((c) => (c ? c.value : null)));

  it("has ten sheets, each opening with whose it is, the month and its currency", () => {
    expect(sheets.map((s) => s.name)).toEqual([
      "Read me",
      "Statement",
      "Sales",
      "Partner shops",
      "Returns",
      "Cost of goods by product",
      "Expenses",
      "Suppliers",
      "Customer balances",
      "Stock at cost",
    ]);
    expect(values("Sales")[0][0]).toBe("Pura Line · Sales · Oct 2026");
    expect(values("Read me").flat()).toContain(
      "As they stood on the day this was prepared (2026-11-05), not at the month's end.",
    );
  });

  it("sets the month beside the month before and the same month a year earlier", () => {
    const header = values("Statement")[3];
    expect(header).toEqual([
      "BHD",
      "Oct 2026",
      "Sep 2026",
      "Oct 2025",
      "vs month before",
      "vs last year",
    ]);
    const net = sheet("Statement").rows.find((r) => r[0] && r[0].value === "Net sales")!;
    expect(net.map((c) => (c ? c.value : null))).toEqual(["Net sales", 200, 100, 160, 1, 0.25]);
  });

  it("totals the sales and the expenses, with the VAT paid", () => {
    const sales = values("Sales");
    expect(sales.at(-1)).toEqual([
      "Total",
      2,
      null,
      null,
      null,
      null,
      140,
      -10,
      0,
      0,
      132,
      102,
      30,
    ]);
    const expenses = values("Expenses");
    expect(expenses).toContainEqual(["Total", 350, 5]);
    expect(expenses[4]).toEqual(["Rent", 300, 0]);
  });
});

describe("the month pack button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubs.asked = [];
    stubs.download.mockResolvedValue(undefined);
  });

  it("asks for the four parts at once and downloads one workbook for the chosen month", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MonthPackDialog slug="pura" currency="BHD" lang="en" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Month pack for the accountant/ }));
    const dialog = await screen.findByRole("dialog");
    // The last whole month is chosen first.
    const select = within(dialog).getByLabelText("Month") as HTMLSelectElement;
    expect(select.selectedIndex).toBe(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Download" }));
    await waitFor(() => expect(stubs.download).toHaveBeenCalledTimes(1));
    expect(stubs.asked.sort()).toEqual(["margins", "monthPack", "periods", "receivables"]);
    const [sheets, fileName] = stubs.download.mock.calls[0];
    expect(sheets).toHaveLength(10);
    expect(fileName).toMatch(/^pura-month-pack-\d{4}-\d{2}\.xlsx$/);
  });
});
