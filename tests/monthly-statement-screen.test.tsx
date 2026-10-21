import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The monthly statement on screen: one request for every month (and the same months a year
// earlier), the statement's lines with the months' total, and the Excel copy.

const stubs = vi.hoisted(() => ({
  periods: vi.fn(),
  download: vi.fn(),
  asked: [] as Array<Array<{ from: Date; to: Date }>>,
}));

const month = (net: number, cost: number, orders = 2) => [
  {
    currency: "BHD",
    gross_merch_sales: net,
    net_merch_sales: net,
    net_merchandise_after_returns: net,
    known_cogs_after_returns: cost,
    paid_order_value: net,
    net_revenue: net,
    paid_order_count: orders,
    manual_expenses: 10,
    expenses: 10,
    collected: net,
  },
];

const mocks: Record<string, unknown> = {
  "data/reporting": {
    reportingQueries: {
      periods: (_slug: string, ranges: Array<{ from: Date; to: Date }>) => {
        stubs.asked.push(ranges);
        return {
          queryKey: ["periods", ranges.length],
          queryFn: async () => stubs.periods(ranges),
        };
      },
    },
  },
  "brand-context": {
    useBrand: () => ({ id: "b1", slug: "pura", name_en: "Pura Line", name_ar: "بيورا لاين" }),
  },
  i18n: { useI18n: () => ({ lang: "en" }) },
  currency: { useStoreCurrency: () => "BHD" },
  workbook: {
    downloadWorkbook: stubs.download,
    workbookFileName: (slug: string, what: string, period: string) =>
      `${slug}-${what}-${period}.xlsx`,
  },
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
  ...(mocks.workbook as object),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { MonthlyStatementPage } =
  await import("../src/features/finance-reports/components/MonthlyStatementPage");

const wrap = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MonthlyStatementPage slug="pura" />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  stubs.asked = [];
  // Every month sold 100 at a cost of 40; a year earlier, 80 at 40.
  stubs.periods.mockImplementation(async (ranges: unknown[]) =>
    ranges.map((_, i) => (i < 12 ? month(100, 40) : month(80, 40))),
  );
  stubs.download.mockResolvedValue(undefined);
});

describe("the monthly statement", () => {
  it("asks for every month and the same months a year earlier in one request", async () => {
    wrap();
    await screen.findByRole("rowheader", { name: "Net sales" });
    const asked = stubs.asked.at(-1)!;
    expect(asked).toHaveLength(24);
    expect(asked[12].from.getFullYear()).toBe(asked[0].from.getFullYear() - 1);
    expect(asked[12].from.getMonth()).toBe(asked[0].from.getMonth());
  });

  it("lays the months out as a statement, with the total and the change on a year earlier", async () => {
    wrap();
    const row = (await screen.findByRole("rowheader", { name: "Gross profit" })).closest("tr")!;
    const cells = within(row)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    // Twelve months of 60, their total, a year earlier, and the change.
    expect(cells.slice(0, 12)).toEqual(Array(12).fill("60.000"));
    expect(cells.slice(12)).toEqual(["720.000", "480.000", "+50.0%"]);
    const cost = screen.getByRole("rowheader", { name: "Cost of goods" }).closest("tr")!;
    expect(within(cost).getAllByRole("cell")[12]).toHaveTextContent("(480.000)");
    expect(screen.getByRole("columnheader", { name: "Total" })).toBeInTheDocument();
  });

  it("drops the year-earlier columns when not wanted, and asks for the months alone", async () => {
    wrap();
    await screen.findByRole("rowheader", { name: "Net sales" });
    fireEvent.click(screen.getByRole("switch", { name: "Same months last year" }));
    await waitFor(() => expect(stubs.asked.at(-1)).toHaveLength(12));
    expect(screen.queryByRole("columnheader", { name: "Change" })).toBeNull();
  });

  it("downloads the same statement to Excel, named for the store and its months", async () => {
    wrap();
    await screen.findByRole("rowheader", { name: "Net sales" });
    fireEvent.click(screen.getByRole("button", { name: /Download Excel/ }));
    await waitFor(() => expect(stubs.download).toHaveBeenCalledTimes(1));
    const [sheets, fileName] = stubs.download.mock.calls[0];
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe("Monthly statement");
    expect(fileName).toMatch(/^pura-statement-\d{4}-\d{2}-to-\d{4}-\d{2}\.xlsx$/);
  });
});
