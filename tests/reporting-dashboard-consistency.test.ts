import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { defaultReportRange, salesBreakdownRows } from "../src/lib/reports-view";

// The dashboard's side (paid, non-archived revenue; the Reports accounting
// row) is dashboardFinancials / paidRevenueOrders in tests/dashboard-metrics.test.ts,
// and the report caches' brand keys are in tests/dashboard-and-storefront-orders-data.test.ts.
const read = (path: string) => readFileSync(path, "utf8");

const migration = read("supabase/migrations/20260825193000_reporting_dashboard_consistency.sql");
const bomSnapshots = read(
  "supabase/migrations/20260904220000_historical_order_bom_cogs_snapshots.sql",
);

describe("dashboard and reporting consistency", () => {
  it("recognizes revenue from paid, non-cancelled orders in the reporting RPCs", () => {
    expect(migration.match(/payment_status, ''\)\) = 'paid'/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("includes BOM packaging in overview and product COGS", () => {
    expect(migration.match(/product_packaging AS/g)).toHaveLength(2);
    expect(migration).toContain("pbi.quantity_per_unit * pm.unit_cost");
    expect(migration).toContain("COALESCE(pp.unit_packaging_cost, 0)");
  });

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

  it("includes the selected end date when aggregating dated expenses", () => {
    expect(migration).toContain("expense_date <= (p_end_date AT TIME ZONE p_tz)::date");
  });

  it("repairs historical product links and reports frozen packaging COGS", () => {
    expect(bomSnapshots).toContain("SET product_id = pv.product_id");
    expect(bomSnapshots).toContain("packaging_cost_snapshot");
    expect(bomSnapshots).toContain("rpc_reporting_order_cogs");
    expect(bomSnapshots).toContain("zero_packaging_item_count");
  });
});
