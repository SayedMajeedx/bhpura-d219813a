import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260825203000_incubator_sales_reporting_packaging.sql",
  "utf8",
);

// The Reports overview reads through the browser client's RPCs.
const rpcs = vi.hoisted(() => ({ results: {} as Record<string, unknown> }));
const client = {
  supabase: { rpc: async (name: string) => ({ data: rpcs.results[name] ?? [], error: null }) },
};
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);
const { salesCountsSince } = await import("../src/features/dashboard/lib/dashboard-figures");
const { fetchReportingOverview } = await import("../src/lib/reporting.functions");

describe("incubator sales reporting and packaging contracts", () => {
  it("defaults every incubator to provider packaging", () => {
    expect(migration).toContain("packaging_policy text NOT NULL DEFAULT 'incubator'");
    // The new-incubator form defaults to it too (tests/incubator-page-management.test.tsx).
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

  it("counts the partner shops' sales of the dashboard's 30 days apart from the store's orders", () => {
    const now = new Date(2026, 8, 25, 12);
    const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
    const start = new Date(now.getTime() - 29 * 86_400_000);
    expect(
      salesCountsSince(
        [{ status: "delivered", created_at: daysAgo(1) }],
        [
          { sold_at: daysAgo(3), quantity: 2 },
          { sold_at: daysAgo(90), quantity: 9 },
        ],
        start,
        now,
      ),
    ).toEqual({ storeOrders: 1, partnerSales: 2, transactions: 3 });
  });

  it("adds incubator sales, commissions and receivables to the Reports overview", async () => {
    rpcs.results = {
      rpc_reporting_overview: [
        {
          currency: "BHD",
          paid_order_value: 100,
          net_merch_sales: 90,
          paid_order_count: 2,
          expenses: 5,
        },
      ],
      rpc_reporting_incubator_sales: {
        summary: [
          {
            currency: "BHD",
            gross_amount: 40,
            commission_amount: 4,
            receivables: 30,
            collected: 10,
            sale_count: 1,
            cogs: 12,
          },
        ],
      },
    };
    const [row] = await fetchReportingOverview(
      { from: new Date("2026-09-01"), to: new Date("2026-09-30") },
      "Asia/Bahrain",
    );
    expect(row).toMatchObject({
      paid_order_value: 140,
      paid_order_count: 3,
      incubator_sales: 40,
      incubator_commissions: 4,
      incubator_receivables: 30,
      incubator_collected: 10,
      expenses: 9,
    });
  });
});
