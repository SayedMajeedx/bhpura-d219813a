import { describe, expect, it } from "vitest";
import { buildCustomerCrmStats } from "../src/lib/commerce-metrics";

const order = (overrides: Record<string, unknown> = {}) => ({
  customer_id: "customer-1",
  total: 20,
  created_at: "2026-08-30T12:00:00.000Z",
  status: "confirmed",
  fulfillment_status: "processing",
  payment_status: "paid",
  ...overrides,
});

describe("customer CRM stats", () => {
  it("counts active orders while limiting spend to fully paid sales", () => {
    const stats = buildCustomerCrmStats([
      order(),
      order({ total: 50, payment_status: "partially_paid" }),
    ]).get("customer-1");

    expect(stats?.totalOrders).toBe(2);
    expect(stats?.lifetimeSpend).toBe(20);
    expect(stats?.badge).toBe("Regular");
  });

  it("excludes cancelled and refunded orders from customer activity", () => {
    const stats = buildCustomerCrmStats([
      order({ status: "cancelled" }),
      order({ fulfillment_status: "refunded" }),
    ]);

    expect(stats.has("customer-1")).toBe(false);
  });
});
