import React from "react";
import { PGlite } from "@electric-sql/pglite";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import soldMigration from "../supabase/migrations/20261021140000_reports_count_what_is_sold.sql?raw";
import migration from "../supabase/migrations/20261021170000_reporting_receivables.sql?raw";
import {
  ageBucket,
  balancesSheet,
  bucketTotals,
  customerBalances,
  daysBetween,
  readReceivables,
} from "../src/features/finance-reports/lib/receivables";

// What customers owe today, and for how long: in a real Postgres (migration 20261021170000),
// the rules that age a balance from the day its piece was handed over, and the screen.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const stubs = vi.hoisted(() => ({ receivables: {} as unknown }));
const mocks: Record<string, unknown> = {
  "data/reporting": {
    reportingQueries: {
      receivables: () => ({ queryKey: ["receivables"], queryFn: async () => stubs.receivables }),
    },
  },
  "brand-context": {
    useBrand: () => ({ id: "b1", slug: "pura", name_en: "Pura Line", name_ar: null }),
  },
  i18n: { useI18n: () => ({ lang: "en" }) },
  currency: { useStoreCurrency: () => "BHD" },
};
// The store's order number format (use-order-number.ts): none here, so "#1042" as before.
vi.mock("../src/hooks/use-order-number", async () => {
  const { orderNumberLabel } = await import("../src/lib/order-number");
  return {
    useOrderNumber: () => (n: number | string | null | undefined, id?: string | null) =>
      orderNumberLabel(n, null, id),
    useOrderNumberFormat: () => null,
  };
});
vi.mock("@/hooks/use-order-number", async () => {
  const { orderNumberLabel } = await import("../src/lib/order-number");
  return {
    useOrderNumber: () => (n: number | string | null | undefined, id?: string | null) =>
      orderNumberLabel(n, null, id),
    useOrderNumberFormat: () => null,
  };
});

vi.mock("../src/lib/data/reporting", () => mocks["data/reporting"]);
vi.mock("@/lib/data/reporting", () => mocks["data/reporting"]);
vi.mock("../src/lib/brand-context", () => mocks["brand-context"]);
vi.mock("@/lib/brand-context", () => mocks["brand-context"]);
vi.mock("../src/lib/i18n", () => mocks.i18n);
vi.mock("@/lib/i18n", () => mocks.i18n);
vi.mock("../src/hooks/use-store-currency", () => mocks.currency);
vi.mock("@/hooks/use-store-currency", () => mocks.currency);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const BRAND = "00000000-0000-4000-8000-0000000000b1";
const functionOf = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const tag = /\$(\w*)\$/.exec(sql.slice(start))![0];
  const open = sql.indexOf(tag, start);
  const end = sql.indexOf(tag, open + tag.length);
  return `${sql.slice(start, end + tag.length)};`;
};

const { CustomerBalancesPage } =
  await import("../src/features/finance-reports/components/CustomerBalancesPage");

describe("in the database", () => {
  let db: PGlite;
  let result: ReturnType<typeof readReceivables>;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
      CREATE FUNCTION public.reporting_brand_id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT '${BRAND}'::uuid $$;
      CREATE TABLE customers (id text PRIMARY KEY, name text, phone text);
      CREATE TABLE orders (
        id text PRIMARY KEY, brand_id uuid, invoice_number int, public_invoice_token text,
        created_at timestamptz, currency text DEFAULT 'BHD', status text, payment_status text,
        fulfillment_status text, payment_method text, total numeric, advance_paid numeric,
        delivered_at timestamptz, completed_at timestamptz, updated_at timestamptz,
        customer_id text, customer_name_snapshot text, customer_phone_snapshot text
      );
      CREATE TABLE incubators (id text PRIMARY KEY, name text, currency text);
      CREATE FUNCTION public.incubator_summaries(b uuid, d date, tz text)
        RETURNS TABLE(incubator_id text, due numeric, overdue numeric, next_settlement date)
        LANGUAGE sql AS $$ VALUES ('shop', 40.0, 15.0, '2026-11-01'::date), ('quiet', 0.0, 0.0, NULL) $$;
      INSERT INTO incubators VALUES ('shop', 'Gallery Mall', 'BHD'), ('quiet', 'Paid up', 'BHD');
      INSERT INTO customers VALUES ('c1', 'Fatima', '97333334444');
      INSERT INTO orders VALUES
        -- An advance paid; still being made: owes 23.900, not yet due.
        ('o1', '${BRAND}', 1001, 't1', '2026-10-01', 'BHD', 'confirmed', 'partially_paid', 'NEEDS_PACKING', 'benefit_pay', 33.9, 10, NULL, NULL, NULL, 'c1', 'F', NULL),
        -- Delivered with its cash still to collect.
        ('o2', '${BRAND}', 1002, 't2', '2026-08-01', 'BHD', 'completed', 'unpaid', 'DELIVERED', 'cod', 50, 0, '2026-08-20', NULL, NULL, NULL, 'Noor', '97355556666'),
        -- Paid in full, refunded, cancelled: owe nothing.
        ('o3', '${BRAND}', 1003, 't3', '2026-10-01', 'BHD', 'completed', 'paid', 'DELIVERED', 'card', 20, 20, '2026-10-02', NULL, NULL, 'c1', NULL, NULL),
        ('o4', '${BRAND}', 1004, 't4', '2026-10-01', 'BHD', 'confirmed', 'refunded', 'NEEDS_PACKING', 'card', 20, 0, NULL, NULL, NULL, 'c1', NULL, NULL),
        ('o5', '${BRAND}', 1005, 't5', '2026-10-01', 'BHD', 'cancelled', 'unpaid', 'NEEDS_PACKING', 'cod', 20, 0, NULL, NULL, NULL, 'c1', NULL, NULL),
        -- Picked up with no hand-over time: the stage's time stands in.
        ('o6', '${BRAND}', 1006, 't6', '2026-06-01', 'BHD', 'completed', 'partially_paid', 'PICKED_UP', 'cash', 30, 5, NULL, NULL, '2026-06-10', 'c1', NULL, NULL);
    `);
    await db.exec(functionOf(soldMigration, "order_counts_as_sold"));
    await db.exec(migration);
    const { rows } = await db.query<{ r: unknown }>(
      "SELECT public.rpc_reporting_receivables('2026-10-21', 'Asia/Bahrain', 'pura') AS r",
    );
    result = readReceivables(rows[0].r);
  });

  it("lists every sold order with money still to collect, and when its piece was handed over", () => {
    expect(
      result.orders.map((o) => [o.invoice_number, o.balance, Boolean(o.handed_over_at)]),
    ).toEqual([
      [1006, 25, true],
      [1002, 50, true],
      [1001, 23.9, false],
    ]);
    expect(result.orders.find((o) => o.invoice_number === 1002)).toMatchObject({
      customer_name: "Noor",
      customer_phone: "97355556666",
    });
    expect(result.orders.find((o) => o.invoice_number === 1001)!.customer_name).toBe("Fatima");
  });

  it("and each partner shop that owes, with what is overdue and its next settlement", () => {
    expect(result.partners).toEqual([
      {
        id: "shop",
        name: "Gallery Mall",
        currency: "BHD",
        due: 40,
        overdue: 15,
        next_settlement: "2026-11-01",
      },
    ]);
  });
});

describe("ageing a balance", () => {
  it("counts whole calendar days from the hand-over; before it, a balance is not due", () => {
    expect(daysBetween("2026-08-20", "2026-10-21")).toBe(62);
    expect(daysBetween("2026-10-22", "2026-10-21")).toBe(0);
    expect([null, 0, 30, 31, 60, 61, 90, 91].map(ageBucket)).toEqual([
      "not_due",
      "d0_30",
      "d0_30",
      "d31_60",
      "d31_60",
      "d61_90",
      "d61_90",
      "d90_plus",
    ]);
  });

  const orders = readReceivables({
    customers: [
      {
        id: "o1",
        invoice_number: 1001,
        created_at: "2026-10-01T09:00:00Z",
        currency: "BHD",
        total: 33.9,
        collected: 10,
        balance: 23.9,
        customer_id: "c1",
        customer_name: "Fatima",
      },
      {
        id: "o6",
        invoice_number: 1006,
        created_at: "2026-06-01T09:00:00Z",
        handed_over_at: "2026-06-10T09:00:00Z",
        currency: "BHD",
        total: 30,
        collected: 5,
        balance: 25,
        customer_id: "c1",
        customer_name: "Fatima",
      },
      {
        id: "o2",
        invoice_number: 1002,
        created_at: "2026-08-01T09:00:00Z",
        handed_over_at: "2026-09-25T09:00:00Z",
        currency: "BHD",
        total: 50,
        collected: 0,
        balance: 50,
        customer_name: "Noor",
        customer_phone: "97355556666",
      },
      {
        id: "o9",
        invoice_number: 9,
        created_at: "2026-10-01T09:00:00Z",
        currency: "SAR",
        total: 9,
        collected: 0,
        balance: 9,
      },
    ],
    partners: [],
  }).orders;

  it("groups a customer's orders, the most overdue customer first", () => {
    const customers = customerBalances(orders, "BHD", "2026-10-21", "Unnamed");
    expect(customers.map((c) => [c.name, c.worst, c.buckets.total, c.oldestDays])).toEqual([
      ["Fatima", "d90_plus", 48.9, 133],
      ["Noor", "d0_30", 50, 26],
    ]);
    expect(customers[0].orders.map((o) => o.invoice_number)).toEqual([1006, 1001]);
    expect(bucketTotals(customers)).toMatchObject({
      not_due: 23.9,
      d0_30: 50,
      d90_plus: 25,
      total: 98.9,
      customers: 2,
      orders: 3,
    });
  });

  it("writes the ageing and every order to Excel, with no phone number", () => {
    const sheet = balancesSheet({
      customers: customerBalances(orders, "BHD", "2026-10-21", "Unnamed"),
      partners: [
        {
          id: "shop",
          name: "Gallery Mall",
          currency: "BHD",
          due: 40,
          overdue: 15,
          next_settlement: "2026-11-01",
        },
      ],
      currency: "BHD",
      digits: 3,
      lang: "en",
      title: "Customer balances",
      subtitle: "Pura Line",
    });
    const values = sheet.rows.flat().map((c) => (c ? c.value : null));
    expect(values).toContain("Over 90 days");
    expect(values).toContain("Gallery Mall");
    expect(values).not.toContain("97355556666");
    const noor = sheet.rows.find((r) => r[0] && r[0].value === "Noor")!;
    expect(noor.map((c) => (c ? c.value : null))).toEqual([
      "Noor",
      "1002",
      "2026-08-01",
      "2026-09-25",
      26,
      "0–30 days",
      50,
      0,
      50,
      null,
    ]);
  });
});

describe("the balances screen", () => {
  const wrap = () =>
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CustomerBalancesPage slug="pura" />
      </QueryClientProvider>,
    );

  beforeEach(() => {
    const handedOver = new Date(Date.now() - 45 * 86_400_000).toISOString();
    stubs.receivables = {
      customers: [
        {
          id: "o2",
          invoice_number: 1002,
          public_invoice_token: "t2",
          created_at: handedOver,
          handed_over_at: handedOver,
          currency: "BHD",
          total: 50,
          collected: 0,
          balance: 50,
          customer_name: "Noor",
          customer_phone: "97355556666",
        },
      ],
      partners: [
        {
          id: "shop",
          name: "Gallery Mall",
          currency: "BHD",
          due: 40,
          overdue: 15,
          next_settlement: null,
        },
      ],
    };
  });

  it("shows the ageing, says what is past 30 days, and the partner shops' balances", async () => {
    wrap();
    const ageing = await screen.findByLabelText("Ageing");
    expect(within(ageing).getByText("31–60 days").nextSibling).toHaveTextContent("50.000");
    expect(screen.getByText(/has been owed for more than 30 days/)).toHaveTextContent("50.000");
    expect(screen.getByText("Gallery Mall")).toBeInTheDocument();
    expect(screen.getByText(/15.000 overdue/)).toBeInTheDocument();
  });

  it("opens a customer's orders with a WhatsApp reminder a person sends", async () => {
    wrap();
    fireEvent.click(await screen.findByRole("button", { name: /Noor/ }));
    const remind = screen.getByRole("link", { name: /Remind/ });
    const href = decodeURIComponent(remind.getAttribute("href") ?? "");
    expect(href).toMatch(/^https:\/\/wa\.me\/97355556666\?text=/);
    expect(href).toContain("the balance on order #1002 is");
    expect(href).toContain("/invoice/t2");
  });
});
