import { describe, expect, it } from "vitest";
import {
  buildCustomerCrmStats,
  resolveCustomerSegmentBadge,
} from "../src/lib/commerce-metrics";

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
  it("tracks lifetime spend across active orders while distinguishing collected payments", () => {
    const stats = buildCustomerCrmStats([
      order(),
      order({ total: 50, payment_status: "partially_paid" }),
    ]).get("customer-1");

    expect(stats?.totalOrders).toBe(2);
    expect(stats?.lifetimeSpend).toBe(70);
    expect(stats?.totalPaid).toBe(20);
    expect(stats?.pendingAmount).toBe(50);
    expect(stats?.badge).toBe("Regular");
  });

  it("excludes cancelled and refunded orders from customer activity", () => {
    const stats = buildCustomerCrmStats([
      order({ status: "cancelled" }),
      order({ fulfillment_status: "refunded" }),
    ]);

    expect(stats.has("customer-1")).toBe(false);
  });

  it("classifies customer with exactly 1 order as New Buyer, NEVER Repeat Buyer", () => {
    const stats = buildCustomerCrmStats([
      order({ total: 8, payment_status: "paid" }),
    ]).get("customer-1");

    expect(stats?.totalOrders).toBe(1);
    expect(stats?.lifetimeSpend).toBe(8);
    expect(stats?.badge).toBe("New Buyer");
    expect(stats?.badge).not.toBe("Regular");
  });

  it("classifies customer with multiple orders as Repeat (Regular) or VIP", () => {
    const statsTwoOrders = buildCustomerCrmStats([
      order({ total: 10, payment_status: "paid" }),
      order({ total: 15, payment_status: "paid" }),
    ]).get("customer-1");

    expect(statsTwoOrders?.totalOrders).toBe(2);
    expect(statsTwoOrders?.badge).toBe("Regular");

    const statsVip = buildCustomerCrmStats([
      order({ total: 50, payment_status: "paid" }),
      order({ total: 40, payment_status: "paid" }),
      order({ total: 30, payment_status: "paid" }),
    ]).get("customer-1");

    expect(statsVip?.totalOrders).toBe(3);
    expect(statsVip?.badge).toBe("VIP");
  });
});

describe("resolveCustomerSegmentBadge", () => {
  it("resolves single order customer as 'new' with Arabic label 'عميل جديد'", () => {
    const badge = resolveCustomerSegmentBadge({
      totalOrders: 1,
      lifetimeSpend: 8,
      lastOrderDate: "2026-09-01T12:00:00.000Z",
      currency: "BHD",
    });

    expect(badge.segment).toBe("new");
    expect(badge.label.ar).toBe("عميل جديد");
    expect(badge.label.en).toBe("New Customer");
  });

  it("resolves multiple orders customer as 'repeat' with Arabic label 'عميل متكرر'", () => {
    const badge = resolveCustomerSegmentBadge({
      totalOrders: 2,
      lifetimeSpend: 35,
      lastOrderDate: new Date().toISOString(),
      currency: "BHD",
    });

    expect(badge.segment).toBe("repeat");
    expect(badge.label.ar).toBe("عميل متكرر");
    expect(badge.label.en).toBe("Repeat Buyer");
  });

  it("resolves VIP customer when spend or orders meet threshold", () => {
    const badge = resolveCustomerSegmentBadge({
      totalOrders: 3,
      lifetimeSpend: 120,
      currency: "BHD",
    });

    expect(badge.segment).toBe("vip");
    expect(badge.label.ar).toBe("عميل مميز (VIP)");
  });

  it("resolves Churn Risk when customer with multiple orders is inactive for >60 days", () => {
    const seventyDaysAgo = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString();
    const badge = resolveCustomerSegmentBadge({
      totalOrders: 2,
      lifetimeSpend: 40,
      lastOrderDate: seventyDaysAgo,
      currency: "BHD",
    });

    expect(badge.segment).toBe("churn");
    expect(badge.label.ar).toContain("عميل راكد");
  });

  it("resolves lead when customer has 0 orders", () => {
    const badge = resolveCustomerSegmentBadge({
      totalOrders: 0,
      lifetimeSpend: 0,
    });

    expect(badge.segment).toBe("lead");
    expect(badge.label.ar).toBe("بدون طلبات");
  });
});
