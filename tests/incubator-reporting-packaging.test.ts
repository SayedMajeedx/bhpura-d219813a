import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260825203000_incubator_sales_reporting_packaging.sql",
  "utf8",
);
const dashboard = readFileSync("src/routes/_authenticated/admin.b.$slug.dashboard.tsx", "utf8");
const reporting = readFileSync("src/lib/reporting.functions.ts", "utf8");
const incubators = readFileSync("src/routes/_authenticated/admin.b.$slug.incubators.tsx", "utf8");

describe("incubator sales reporting and packaging contracts", () => {
  it("defaults every incubator to provider packaging", () => {
    expect(migration).toContain("packaging_policy text NOT NULL DEFAULT 'incubator'");
    expect(incubators).toContain('value="incubator"');
  });

  it("snapshots product, packaging, policy, and material consumption per sale", () => {
    expect(migration).toContain("product_cost_snapshot");
    expect(migration).toContain("packaging_cost_snapshot");
    expect(migration).toContain("packaging_policy_snapshot");
    expect(migration).toContain("packaging_materials_snapshot");
  });

  it("deducts BOM only for our packaging and restores it on reversal", () => {
    expect(migration).toContain("v_inc.packaging_policy = 'our_bom'");
    expect(migration).toContain("stock_quantity = stock_quantity - r.required_quantity");
    expect(migration).toContain("stock_quantity = stock_quantity + r.quantity");
  });

  it("merges confirmed incubator sales into dashboard and reports", () => {
    expect(dashboard).toContain('queryKey: ["dashboard-incubator-sales", brandId]');
    expect(dashboard).toContain("incubatorRevenue");
    expect(reporting).toContain('rpc("rpc_reporting_incubator_sales"');
    expect(reporting).toContain("incubator_commissions");
    expect(reporting).toContain("incubator_receivables");
  });
});
