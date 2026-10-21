import { describe, expect, it } from "vitest";
import { composeOverviewRows, overviewProfit } from "../src/lib/reporting-compose";
import {
  accountingFigure,
  changeFigure,
  columnsIn,
  currenciesIn,
  lineFigure,
  monthLabel,
  monthsEnding,
  presetMonths,
  statementLines,
  yearEarlier,
} from "../src/features/finance-reports/lib/statement";
import { statementSheet } from "../src/features/finance-reports/lib/statement-sheet";
import {
  libraryCell,
  moneyFormat,
  safeText,
  sheetName,
  workbookFileName,
} from "../src/features/finance-reports/lib/workbook";

// The monthly statement: the overview's figures month by month, put together by the overview's
// own rule, laid out as a profit and loss statement, and written to Excel as real numbers.

/** One month's answers from the five report functions, for one store selling in BHD. */
const pieces = (scale = 1) => ({
  overview: [
    {
      currency: "BHD",
      paid_order_value: 230 * scale,
      gross_merch_sales: 220 * scale,
      discounts: 20 * scale,
      net_merch_sales: 200 * scale,
      shipping_collected: 10 * scale,
      vat_collected: 0,
      collected: 150 * scale,
      owed_by_customers: 80 * scale,
      paid_order_count: 4 * scale,
      known_cogs: 70 * scale,
      missing_cost_item_count: 1,
      expenses: 30 * scale,
    },
  ],
  returns: [
    {
      currency: "BHD",
      revenue_deduction: 25 * scale,
      merchandise_deduction: 20 * scale,
      returned_cogs_reversal: 8 * scale,
    },
  ],
  cogs: [{ currency: "BHD", known_cogs: 72 * scale, product_cogs: 65 * scale }],
  fees: [{ currency: "BHD", processing_fees: 5 * scale }],
  incubatorSummary: [
    {
      currency: "BHD",
      gross_amount: 50 * scale,
      cogs: 20 * scale,
      commission_amount: 10 * scale,
      sale_count: 1,
      collected: 30 * scale,
    },
  ],
});

describe("a period's figures, put together once", () => {
  it("adds partner shops' sales, deducts returns, and counts every cost the overview counts", () => {
    const [row] = composeOverviewRows(pieces());
    expect(row).toMatchObject({
      currency: "BHD",
      gross_merch_sales: 270,
      net_merch_sales: 250,
      net_merchandise_after_returns: 230,
      paid_order_value: 280,
      net_revenue: 255,
      paid_order_count: 5,
      collected: 180,
      known_cogs: 92,
      known_cogs_after_returns: 84,
      manual_expenses: 30,
      processing_fees: 5,
      incubator_commissions: 10,
      expenses: 45,
    });
    expect(overviewProfit(row)).toMatchObject({
      netSales: 230,
      costOfGoods: 84,
      grossProfit: 146,
      operatingCosts: 45,
      operatingProfit: 101,
    });
  });

  it("keeps a currency that only partner shops or returns sold in", () => {
    const rows = composeOverviewRows({
      overview: [],
      returns: [{ currency: "SAR", merchandise_deduction: 5 }],
      cogs: null,
      fees: undefined,
      incubatorSummary: [{ currency: "USD", gross_amount: 9 }],
    });
    expect(rows.map((r) => [r.currency, r.net_merchandise_after_returns])).toEqual([
      ["USD", 9],
      ["SAR", -5],
    ]);
  });
});

describe("the months", () => {
  const now = new Date(2026, 9, 21, 15, 0);

  it("run from a month's first moment to its last, on the reader's clock, oldest first", () => {
    const months = monthsEnding(2026, 2, 3, now);
    expect(months.map((m) => m.key)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(months[2].from).toEqual(new Date(2026, 1, 1));
    expect(months[2].to).toEqual(new Date(new Date(2026, 2, 1).getTime() - 1));
    expect(months.some((m) => m.toDate)).toBe(false);
  });

  it("offer the last 12 or 6 months, this year and last year; the current month is to date", () => {
    expect(presetMonths("last12", now).map((m) => m.key)).toHaveLength(12);
    expect(presetMonths("last12", now).at(-1)).toMatchObject({ key: "2026-10", toDate: true });
    expect(presetMonths("last6", now)[0].key).toBe("2026-05");
    expect(presetMonths("thisYear", now).map((m) => m.key)[0]).toBe("2026-01");
    expect(presetMonths("thisYear", now)).toHaveLength(10);
    expect(presetMonths("lastYear", now).map((m) => m.key)).toEqual(
      Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`),
    );
    expect(yearEarlier(presetMonths("last6", now), now).map((m) => m.key)[0]).toBe("2025-05");
  });

  it("are named in the reader's language with Western digits", () => {
    const [month] = monthsEnding(2026, 10, 1, now);
    expect(monthLabel(month, "en")).toBe("Oct 2026");
    expect(monthLabel(month, "ar")).toMatch(/2026/);
  });
});

describe("the statement's lines", () => {
  const sept = composeOverviewRows(pieces(1));
  const oct = composeOverviewRows(pieces(2));
  const lines = statementLines(columnsIn([sept, oct], "BHD"), columnsIn([sept, sept], "BHD"));
  const line = (key: string) => lines.find((l) => l.key === key)!;

  it("read from gross sales down to operating profit, deductions negative", () => {
    expect(lines.map((l) => l.key)).toEqual([
      "gross_sales",
      "discounts",
      "returns",
      "net_sales",
      "cost_of_goods",
      "gross_profit",
      "gross_margin",
      "running_costs",
      "payment_fees",
      "partner_commissions",
      "operating_costs",
      "operating_profit",
      "operating_margin",
      "orders",
      "average_order",
      "collected",
      "owed_by_customers",
      "delivery_charged",
      "missing_costs",
    ]);
    expect(line("gross_sales").values).toEqual([270, 540]);
    expect(line("discounts").values).toEqual([-20, -40]);
    expect(line("returns").values).toEqual([-20, -40]);
    expect(line("net_sales").values).toEqual([230, 460]);
    expect(line("cost_of_goods").values).toEqual([-84, -168]);
    expect(line("operating_profit").values).toEqual([101, 202]);
    // The lines add up: gross less deductions is net sales, and so on down.
    const sum = (key: string) => line(key).total;
    expect(sum("gross_sales") + sum("discounts") + sum("returns")).toBeCloseTo(sum("net_sales"));
    expect(sum("net_sales") + sum("cost_of_goods")).toBeCloseTo(sum("gross_profit"));
    expect(sum("gross_profit") + sum("operating_costs")).toBeCloseTo(sum("operating_profit"));
  });

  it("make a ratio and an average from the totals, never by adding the months' own", () => {
    expect(line("gross_margin").total).toBeCloseTo((438 / 690) * 100);
    // 255 + 510 charged after returns over 5 + 9 orders (the partner sale is one a month).
    expect(line("average_order").total).toBeCloseTo((255 + 510) / 14);
  });

  it("compare with the same months a year earlier: a percentage, or points for a ratio", () => {
    expect(line("net_sales").prior).toBe(460);
    expect(line("net_sales").change).toBeCloseTo(50);
    expect(line("gross_margin").change).toBeCloseTo(0);
    expect(statementLines(columnsIn([sept], "BHD"), null)[0].change).toBeNull();
  });

  it("leave out what the store never uses, and keep a month with no sale as zero", () => {
    const quiet = statementLines(columnsIn([[], sept], "BHD"), null);
    expect(quiet.find((l) => l.key === "vat_charged")).toBeUndefined();
    expect(quiet.find((l) => l.key === "net_sales")!.values).toEqual([0, 230]);
  });

  it("offer every currency sold in, the store's own first", () => {
    expect(currenciesIn([sept, [{ ...sept[0], currency: "SAR" }]], "BHD")).toEqual(["BHD", "SAR"]);
  });
});

describe("a statement's figures", () => {
  it("are written as an accountant does: decimals of the currency, negatives in parentheses", () => {
    expect(accountingFigure(1234.5, 3)).toBe("1,234.500");
    expect(accountingFigure(-84, 3)).toBe("(84.000)");
    expect(accountingFigure(0.0001, 3)).toBe("–");
    expect(lineFigure("count", 12, 3)).toBe("12");
    expect(lineFigure("ratio", 63.478, 3)).toBe("63.5%");
    expect(changeFigure("item", 12.345)).toBe("+12.3%");
    expect(changeFigure("ratio", -3, "ar")).toBe("−3.0 نقطة");
    expect(changeFigure("item", null)).toBe("–");
  });
});

describe("the statement in Excel", () => {
  const sept = composeOverviewRows(pieces(1));
  const months = monthsEnding(2026, 9, 1, new Date(2026, 9, 21));
  const lines = statementLines(columnsIn([sept], "BHD"), columnsIn([sept], "BHD"));
  const sheet = statementSheet({
    lines,
    months,
    currency: "BHD",
    digits: 3,
    lang: "en",
    storeName: "Pura Line",
    timeZone: "Asia/Bahrain",
    compare: true,
  });

  it("says whose it is, for which months, in what currency and on what basis", () => {
    expect(sheet.rows[0][0]).toMatchObject({ value: "Pura Line · Monthly statement" });
    expect(sheet.rows[1][0]).toMatchObject({ value: "Sep 2026 – Sep 2026 · BHD · Asia/Bahrain" });
    expect(String((sheet.rows[2][0] as { value: string }).value)).toMatch(/^Accrual basis/);
    expect(sheet.rows[4].map((c) => (c ? c.value : null))).toEqual([
      "BHD",
      "Sep 2026",
      "Total",
      "Same months last year",
      "Change",
    ]);
  });

  it("holds numbers in the currency's format, a ratio as a percentage", () => {
    const row = (label: string) => sheet.rows.find((r) => r[0] && r[0].value === label)!;
    expect(row("Cost of goods")[1]).toMatchObject({ value: -84, format: moneyFormat(3) });
    expect(row("Gross margin")[1]).toMatchObject({ format: '0.0%;(0.0%);"–"' });
    expect((row("Gross margin")[1] as { value: number }).value).toBeCloseTo(146 / 230);
    expect(row("Operating profit")[2]).toMatchObject({ value: 101, bold: true, total: true });
  });

  it("is written by the writer as real numbers and quoted text", () => {
    expect(libraryCell({ value: -84, format: moneyFormat(3) })).toMatchObject({
      value: -84,
      type: Number,
      format: '#,##0.000;(#,##0.000);"–"',
    });
    expect(libraryCell({ value: "=SUM(A1)" })).toMatchObject({ value: "'=SUM(A1)", type: String });
    expect(libraryCell({ value: "1001", text: true })).toMatchObject({ format: "@" });
    expect(libraryCell(null)).toBeNull();
    expect(safeText("+973")).toBe("'+973");
    expect(sheetName("Sales: Oct/2026 [all] and much more text here")).toHaveLength(31);
    expect(workbookFileName("Pura", "statement", "2025-11 to 2026-10")).toBe(
      "pura-statement-2025-11-to-2026-10.xlsx",
    );
  });
});
