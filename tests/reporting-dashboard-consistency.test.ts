import { describe, expect, it } from "vitest";
import {
  defaultReportRange,
  reportStockState,
  salesBreakdownRows,
  wholeDays,
} from "../src/lib/reports-view";

// What the report functions count (sold orders, returns, packaging, the period's last day) runs
// in a real Postgres in tests/reports-sold-orders-migration.test.ts; the dashboard's own revenue
// rule is revenueOrders in tests/dashboard-metrics.test.ts, and the report caches' brand keys are
// in tests/dashboard-and-storefront-orders-data.test.ts.

describe("dashboard and reporting consistency", () => {
  it("defaults every Reports page to exactly 30 calendar days, today included", () => {
    const now = new Date(2026, 8, 27, 15, 30);
    const { from, to } = defaultReportRange(now);
    expect(from).toEqual(new Date(2026, 7, 29, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 8, 27, 23, 59, 59, 999));
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    expect(days).toBe(30);
  });

  it("renders the sales breakdown keys returned by the RPC, per currency", () => {
    const report = {
      payment: [
        { payment_method: "cod", currency: "BHD", pov: 10 },
        { payment_method: "card", currency: "SAR", pov: 5 },
      ],
      fulfillment: [{ fulfillment_method: "pickup", currency: "BHD", pov: 10 }],
      // Older keys are not read.
      payment_methods: [{ payment_method: "legacy", currency: "BHD" }],
    };
    expect(salesBreakdownRows(report, "payment", "BHD")).toEqual([report.payment[0]]);
    expect(salesBreakdownRows(report, "fulfillment", "BHD")).toEqual(report.fulfillment);
    expect(salesBreakdownRows(null, "payment", "BHD")).toEqual([]);
  });
});

describe("a period picked on the calendar", () => {
  // The calendar hands back midnights: 1-15 October reported 1-14, and one day reported nothing.
  it("runs from the first day's start to the last day's end", () => {
    const picked = wholeDays({ from: new Date(2026, 9, 1), to: new Date(2026, 9, 15) });
    expect(picked).toEqual({
      from: new Date(2026, 9, 1, 0, 0, 0, 0),
      to: new Date(2026, 9, 15, 23, 59, 59, 999),
    });
  });

  it("is one whole day after one click, and nothing before a click", () => {
    expect(wholeDays({ from: new Date(2026, 9, 7, 14, 0) })).toEqual({
      from: new Date(2026, 9, 7, 0, 0, 0, 0),
      to: new Date(2026, 9, 7, 23, 59, 59, 999),
    });
    expect(wholeDays(undefined)).toBeUndefined();
    expect(wholeDays({ from: undefined })).toBeUndefined();
  });
});

describe("a size's stock on the products report", () => {
  it("counts pieces at partners as ready, against the store's own low-stock level", () => {
    const row = {
      stock_main: 1,
      stock_incubator: 2,
      is_made_to_order: false,
      item_kind: "product",
    };
    expect(reportStockState(row, 5)).toMatchObject({ status: "low", readyUnits: 3 });
    expect(reportStockState(row, 2)).toMatchObject({ status: "available", readyUnits: 3 });
    expect(reportStockState({ ...row, stock_main: 0, stock_incubator: 0 }, 5).status).toBe("out");
  });

  it("never calls a made-to-order piece or a service out of stock", () => {
    const madeToOrder = { stock_main: 0, stock_incubator: 0, is_made_to_order: true };
    expect(reportStockState(madeToOrder, 5).status).toBe("made_to_order");
    expect(reportStockState({ ...madeToOrder, made_to_order_available: 0 }, 5).status).toBe("out");
    expect(reportStockState({ stock_main: 0, item_kind: "service" }, 5).status).toBe("service");
  });

  it("reads a partner sale's stock as the store's when it carries no split", () => {
    expect(reportStockState({ current_stock: 4 }, 5)).toMatchObject({
      status: "low",
      readyUnits: 4,
    });
  });
});
