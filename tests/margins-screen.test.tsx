import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  marginRows,
  marginsSheet,
  productMargins,
  reconcile,
  sortMargins,
} from "../src/features/finance-reports/lib/margins";

// Margins on screen: products by what they made, the total, the check against the statement,
// and the Excel copy (by product and by category).

const stubs = vi.hoisted(() => ({ download: vi.fn(), statement: [] as unknown[] }));

const ROWS = [
  {
    currency: "BHD",
    product_id: "A",
    product_name: "Abaya Danah",
    category: "abayas",
    category_name: "Abayas",
    units: 3,
    partner_units: 1,
    gross_sales: 150,
    discounts: 6,
    returns: 20,
    cost_of_goods: 66,
    missing_cost_units: 0,
  },
  {
    currency: "BHD",
    product_id: "C",
    product_name: "Belt",
    category: null,
    category_name: null,
    units: 1,
    partner_units: 0,
    gross_sales: 30,
    discounts: 0,
    returns: 0,
    cost_of_goods: 0,
    missing_cost_units: 1,
  },
];

const mocks: Record<string, unknown> = {
  "data/reporting": {
    reportingQueries: {
      margins: () => ({ queryKey: ["margins"], queryFn: async () => ROWS }),
      overview: () => ({ queryKey: ["overview"], queryFn: async () => stubs.statement }),
    },
  },
  "brand-context": {
    useBrand: () => ({ id: "b1", slug: "pura", name_en: "Pura Line", name_ar: null }),
  },
  i18n: { useI18n: () => ({ lang: "en" }) },
  currency: { useStoreCurrency: () => "BHD" },
};
vi.mock("../src/lib/data/reporting", () => mocks["data/reporting"]);
vi.mock("@/lib/data/reporting", () => mocks["data/reporting"]);
vi.mock("../src/lib/brand-context", () => mocks["brand-context"]);
vi.mock("@/lib/brand-context", () => mocks["brand-context"]);
vi.mock("../src/lib/i18n", () => mocks.i18n);
vi.mock("@/lib/i18n", () => mocks.i18n);
vi.mock("../src/hooks/use-store-currency", () => mocks.currency);
vi.mock("@/hooks/use-store-currency", () => mocks.currency);
vi.mock("../src/features/finance-reports/lib/workbook", async (original) => ({
  ...(await original<object>()),
  downloadWorkbook: stubs.download,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { MarginsPage } = await import("../src/features/finance-reports/components/MarginsPage");

const wrap = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MarginsPage slug="pura" />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  stubs.download.mockResolvedValue(undefined);
  // The statement for the same period: net sales 154 (124 + 30), cost of goods 66.
  stubs.statement = [
    { currency: "BHD", net_merchandise_after_returns: 154, known_cogs_after_returns: 66 },
  ];
});

describe("the margin rules", () => {
  const lines = productMargins(marginRows(ROWS), "BHD", "en");

  it("sort by what was made, by margin, by sales or by pieces", () => {
    expect(sortMargins(lines, "profit").map((l) => l.name)).toEqual(["Abaya Danah", "Belt"]);
    expect(sortMargins(lines, "margin").map((l) => l.name)).toEqual(["Belt", "Abaya Danah"]);
    expect(sortMargins(lines, "units").map((l) => l.name)).toEqual(["Abaya Danah", "Belt"]);
  });

  it("check the products against the statement, to the fils", () => {
    const totals = { netSales: 154, cost: 66 };
    expect(reconcile(totals, stubs.statement[0] as object, 3)).toMatchObject({ ok: true });
    expect(reconcile({ netSales: 150, cost: 66 }, stubs.statement[0] as object, 3)).toMatchObject({
      ok: false,
      netSalesDiff: -4,
    });
  });

  it("write every figure to Excel, deductions negative, with the total", () => {
    const sheet = marginsSheet({
      lines,
      by: "product",
      currency: "BHD",
      digits: 3,
      lang: "en",
      title: "By product",
      subtitle: "Margins",
    });
    const abaya = sheet.rows.find((r) => r[0] && r[0].value === "Abaya Danah")!;
    expect(abaya.map((c) => (c ? c.value : null))).toEqual([
      "Abaya Danah",
      "Abayas",
      3,
      1,
      150,
      -6,
      -20,
      124,
      -66,
      58,
      58 / 124,
      58 / 88,
    ]);
    expect(sheet.rows.at(-1)![0]).toMatchObject({ value: "Total", total: true });
  });
});

describe("the margins screen", () => {
  it("lists products by what they made, flags a piece with no cost, and adds up to the statement", async () => {
    wrap();
    const abaya = (await screen.findByRole("rowheader", { name: /Abaya Danah/ })).closest("tr")!;
    expect(
      within(abaya)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["3", "124.000", "(66.000)", "58.000", "46.8%", "65.9%"]);
    expect(screen.getByRole("rowheader", { name: /Belt/ })).toHaveTextContent("!");
    expect(
      await screen.findByText(/Adds up to the monthly statement for this period/),
    ).toBeInTheDocument();
  });

  it("says by how much it differs when it does not add up", async () => {
    stubs.statement = [
      { currency: "BHD", net_merchandise_after_returns: 160, known_cogs_after_returns: 66 },
    ];
    wrap();
    expect(await screen.findByText(/Differs from the monthly statement/)).toHaveTextContent(
      "net sales by (6.000)",
    );
  });

  it("downloads both views to one workbook", async () => {
    wrap();
    await screen.findByRole("rowheader", { name: /Abaya Danah/ });
    fireEvent.click(screen.getByRole("button", { name: /Download Excel/ }));
    await waitFor(() => expect(stubs.download).toHaveBeenCalledTimes(1));
    const [sheets, fileName] = stubs.download.mock.calls[0];
    expect(sheets.map((s: { name: string }) => s.name)).toEqual(["By product", "By category"]);
    expect(fileName).toMatch(/^pura-margins-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
