import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StockCountFinding, StockCountLine } from "../src/lib/data/stock-counts";

// A full stock count's screens and rules (migration 20261231100000): a scan adds a piece of the
// size it names, a typed number sets it, and the review lists what the database found, the
// differences first, then applies it. The database's side is tests/stock-count-migration.test.ts.

const state = vi.hoisted(() => ({
  lines: [] as unknown[],
  findings: [] as unknown[],
  record: vi.fn(async (_c: string, variant: string, _mode: string, value?: number) => ({
    variant_id: variant,
    counted: value ?? null,
    expected: 3,
  })),
  apply: vi.fn(async () => ({ changed: 1, pieces: -2 })),
  download: vi.fn(),
}));
const stockData = () => ({
  stockCountKeys: {
    lines: (b: string, c: string) => ["stock-counts", b, "lines", c],
  },
  stockCountQueries: {
    lines: (b: string, c: string) => ({
      queryKey: ["stock-counts", b, "lines", c],
      queryFn: async () => state.lines,
    }),
    review: (b: string, c: string, enabled = true) => ({
      queryKey: ["stock-counts", b, "review", c],
      queryFn: async () => state.findings,
      enabled,
    }),
  },
  recordStockCount: state.record,
  applyStockCount: state.apply,
  cancelStockCount: vi.fn(),
  invalidateStockCounts: vi.fn(async () => undefined),
});
vi.mock("../src/lib/data/stock-counts", () => stockData());
vi.mock("@/lib/data/stock-counts", () => stockData());
const catalog = () => ({
  catalogQueries: {
    variants: () => ({ queryKey: ["v"], queryFn: async () => [{ id: "v1", cost_price: 10 }] }),
    products: () => ({ queryKey: ["p"], queryFn: async () => [] }),
  },
  invalidateCatalog: vi.fn(async () => undefined),
});
vi.mock("../src/lib/data/catalog", () => catalog());
vi.mock("@/lib/data/catalog", () => catalog());
const brand = () => ({
  useBrand: () => ({ id: "b1", slug: "pura", name_en: "Pura Line", name_ar: "بيورا" }),
});
vi.mock("../src/lib/brand-context", () => brand());
vi.mock("@/lib/brand-context", () => brand());
const profile = () => ({ useProfileOptional: () => ({ canViewFinancials: true }) });
vi.mock("../src/lib/profile-context", () => profile());
vi.mock("@/lib/profile-context", () => profile());
const currency = () => ({ useStoreCurrency: () => "BHD" });
vi.mock("../src/hooks/use-store-currency", () => currency());
vi.mock("@/hooks/use-store-currency", () => currency());
const confirm = () => ({ confirmDialog: vi.fn(async () => true) });
vi.mock("../src/components/ui/confirm-dialog", () => confirm());
vi.mock("@/components/ui/confirm-dialog", () => confirm());
const workbook = async (io: () => Promise<object>) => ({
  ...(await io()),
  downloadWorkbook: state.download,
});
vi.mock("../src/features/finance-reports/lib/workbook", (io) => workbook(io));
vi.mock("@/features/finance-reports/lib/workbook", (io) => workbook(io));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const rules = await import("../src/features/stock-counts/lib/stock-count");
const { countSheet } = await import("../src/features/stock-counts/lib/stock-count-sheet");
const { CountingPanel } = await import("../src/features/stock-counts/components/CountingPanel");

const line = (variant: string, over: Partial<StockCountLine> = {}): StockCountLine => ({
  variant_id: variant,
  product_id: "p1",
  expected: 3,
  counted: null,
  counted_at: null,
  applied_delta: null,
  product_variants: {
    size: "54",
    color: "Black",
    sku: `40${variant.slice(-2)}`,
    barcode: `628${variant.slice(-2)}`,
  },
  products: { name: "Abaya", name_ar: "عباية", name_en: "Abaya" },
  ...over,
});
const finding = (variant: string, over: Partial<StockCountFinding> = {}): StockCountFinding => ({
  variant_id: variant,
  expected: 3,
  counted: 3,
  moved_during: 0,
  difference: 0,
  stock_now: 3,
  ...over,
});

describe("the count's rules", () => {
  it("names a count, a size, and finds a size by its barcode or code", () => {
    expect(rules.stockCountLabel(3)).toBe("SC-0003");
    const lines = [line("v1"), line("v2")];
    expect(rules.lineName(lines[0], "ar")).toBe("عباية · 54 · Black");
    expect(rules.findByCode(lines, " 628v2 ".toUpperCase())?.variant_id).toBe("v2");
    expect(rules.findByCode(lines, "40v1")?.variant_id).toBe("v1");
    expect(rules.findByCode(lines, "nope")).toBeNull();
  });

  it("lists the sizes still to count first, and says how far the count is", () => {
    const lines = [line("v1", { counted: 2 }), line("v2")];
    expect(rules.linesToShow(lines, "en", "", false).map((l) => l.variant_id)).toEqual([
      "v2",
      "v1",
    ]);
    expect(rules.linesToShow(lines, "en", "", true).map((l) => l.variant_id)).toEqual(["v2"]);
    expect(rules.countProgress(lines)).toEqual({ counted: 1, total: 2 });
  });

  it("reviews the differences first, then the sizes not counted, with their value at cost", () => {
    const lines = [line("v1", { counted: 3 }), line("v2"), line("v3", { counted: 1 })];
    const rows = rules.reviewRows(
      lines,
      [
        finding("v1"),
        finding("v2", { counted: null, difference: null }),
        finding("v3", { counted: 1, difference: -2 }),
      ],
      "en",
      () => 10,
    );
    expect(rows.map((r) => r.variantId)).toEqual(["v3", "v2", "v1"]);
    expect(rows[0]).toMatchObject({ difference: -2, value: -20 });
    expect(rules.reviewTotals(rows)).toMatchObject({
      changed: 1,
      short: 2,
      over: 0,
      uncounted: 1,
      lostValue: 20,
    });
  });

  it("says a refusal in the reader's words", () => {
    expect(rules.stockCountError({ message: "STOCK_COUNT_OPEN" }, "en")).toMatch(/A count is open/);
    expect(rules.stockCountError(new Error("boom"), "ar")).toBe("تعذّر الحفظ، حاول مرة أخرى.");
  });

  it("writes the count's report with a value column only for staff who see costs", () => {
    const rows = rules.reviewRows(
      [line("v1", { counted: 1 })],
      [finding("v1", { counted: 1, difference: -2 })],
      "en",
      () => 10,
    );
    const context = {
      lang: "en" as const,
      store: "Pura Line",
      number: 3,
      startedAt: "2026-11-28T08:00:00Z",
      finishedAt: null,
      scope: null,
      note: null,
      digits: 3,
    };
    const sheet = countSheet(rows, { ...context, showValue: true });
    expect(sheet.name).toBe("SC-0003");
    expect(sheet.rows[6].map((c) => c?.value)).toContain("Difference at cost");
    expect(sheet.rows.at(-1)?.[5]).toMatchObject({ value: -2, total: true });
    expect(
      countSheet(rows, { ...context, showValue: false }).rows[6].map((c) => c?.value),
    ).not.toContain("Difference at cost");
  });
});

describe("counting on the screen", () => {
  const count = {
    id: "c1",
    number: 3,
    category: null,
    note: null,
    status: "counting" as const,
    started_at: "2026-11-28T08:00:00Z",
    finished_at: null,
  };
  const show = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CountingPanel count={count} scope={null} lang="en" />
      </QueryClientProvider>,
    );

  beforeEach(() => {
    state.lines = [line("v1"), line("v2")];
    state.record.mockClear();
    state.apply.mockClear();
  });

  it("adds a piece for each scan, and sets a typed number", async () => {
    show();
    expect(await screen.findByText(/0 of 2 sizes counted/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Scan a barcode or type a code/), {
      target: { value: "628v1".toUpperCase() },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add a piece" }));
    await waitFor(() => expect(state.record).toHaveBeenCalledWith("c1", "v1", "add", 1));

    const typed = screen.getByLabelText("Counted of Abaya · 54 · Black", { selector: "input" });
    fireEvent.change(typed, { target: { value: "7" } });
    fireEvent.blur(typed);
    await waitFor(() =>
      expect(state.record).toHaveBeenCalledWith("c1", expect.any(String), "set", 7),
    );
  });

  it("reviews what the database found and applies it", async () => {
    state.findings = [
      finding("v1", { counted: 1, difference: -2 }),
      finding("v2", { counted: null, difference: null }),
    ];
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Review and apply" }));
    expect(await screen.findByText("Net difference at cost")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Download Excel" }));
    expect(state.download).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "SC-0003" })],
      "SC-0003.xlsx",
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply to the stock" }));
    await waitFor(() => expect(state.apply).toHaveBeenCalledWith("c1"));
  });
});
