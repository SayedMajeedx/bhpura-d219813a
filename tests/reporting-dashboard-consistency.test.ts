import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260825193000_reporting_dashboard_consistency.sql");
const dashboard = read("src/routes/_authenticated/admin.b.$slug.dashboard.tsx");
const overview = read("src/routes/_authenticated/admin.b.$slug.reports.index.tsx");
const sales = read("src/routes/_authenticated/admin.b.$slug.reports.sales.tsx");
const products = read("src/routes/_authenticated/admin.b.$slug.reports.products.tsx");
const customers = read("src/routes/_authenticated/admin.b.$slug.reports.customers.tsx");

describe("dashboard and reporting consistency", () => {
  it("recognizes revenue from paid, non-cancelled orders everywhere", () => {
    expect(migration.match(/payment_status, ''\)\) = 'paid'/g)?.length).toBeGreaterThanOrEqual(4);
    expect(dashboard).toContain('String(o.payment_status || "").toLowerCase() === "paid"');
    expect(dashboard).toContain('"archived_historical"');
  });

  it("includes BOM packaging in overview and product COGS", () => {
    expect(migration.match(/product_packaging AS/g)).toHaveLength(2);
    expect(migration).toContain("pbi.quantity_per_unit * pm.unit_cost");
    expect(migration).toContain("COALESCE(pp.unit_packaging_cost, 0)");
  });

  it("uses exactly 30 calendar days and isolates every report cache by brand", () => {
    for (const source of [overview, sales, products, customers]) {
      expect(source).toContain("subDays(startOfDay(new Date()), 29)");
      expect(source).toMatch(/queryKey:\s*\[\s*"reports-[^"]+",\s*slug,/);
    }
  });

  it("renders the sales breakdown keys returned by the RPC", () => {
    expect(sales).toContain("?.payment}");
    expect(sales).toContain("?.fulfillment}");
    expect(sales).not.toContain("payment_methods");
    expect(sales).not.toContain("fulfillment_methods");
  });

  it("includes the selected end date when aggregating dated expenses", () => {
    expect(migration).toContain("expense_date <= (p_end_date AT TIME ZONE p_tz)::date");
  });
});
