import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildCustomerCrmStats } from "../src/lib/commerce-metrics";
import {
  customerGroup,
  groupCounts,
  sortCustomers,
  valueSummary,
} from "../src/features/customers/lib/customer-value";
import { CustomerValueStrip } from "../src/features/customers/components/CustomerValueStrip";

// What a customer is worth and where they stand: a one-time buyer is no longer "new" for good,
// the VIP rule follows the store's currency, and the list sorts and sums by value.

const NOW = Date.parse("2026-10-30T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const order = (customer: string, total: number, days: number) => ({
  customer_id: customer,
  total,
  created_at: daysAgo(days),
  status: "confirmed",
  fulfillment_status: "processing",
  payment_status: "paid",
});

describe("a customer's group", () => {
  it("is new while a single order is recent, then one-time", () => {
    const stats = buildCustomerCrmStats([order("a", 20, 10), order("b", 20, 90)], NOW, "BHD");
    expect(stats.get("a")?.badge).toBe("New Buyer");
    expect(stats.get("b")?.badge).toBe("One-time");
    expect(customerGroup(stats.get("b"))).toBe("one_time");
  });

  it("makes a frequent buyer a VIP at two fifths of the store's own VIP amount", () => {
    // BHD's VIP amount is 250: three orders over 100 make a VIP, as before.
    const bhd = buildCustomerCrmStats(
      [order("a", 40, 1), order("a", 40, 2), order("a", 40, 3)],
      NOW,
      "BHD",
    );
    expect(bhd.get("a")?.badge).toBe("VIP");
    // In riyals (2,500) three orders of 40 are not 1,000: a regular, never a VIP at "100".
    const sar = buildCustomerCrmStats(
      [order("a", 40, 1), order("a", 40, 2), order("a", 40, 3)],
      NOW,
      "SAR",
    );
    expect(sar.get("a")?.badge).toBe("Regular");
  });

  it("is counted once per customer, in each group", () => {
    const stats = buildCustomerCrmStats(
      [
        order("a", 300, 5),
        order("b", 20, 5),
        order("c", 20, 90),
        order("d", 30, 5),
        order("d", 30, 6),
      ],
      NOW,
      "BHD",
    );
    expect(groupCounts(["a", "b", "c", "d", "e"], stats)).toEqual({
      all: 5,
      vip: 1,
      repeat: 1,
      new: 1,
      one_time: 1,
      churn: 0,
    });
  });
});

describe("the list", () => {
  const stats = buildCustomerCrmStats(
    [order("a", 10, 30), order("b", 90, 5), order("c", 40, 1), order("c", 5, 2)],
    NOW,
    "BHD",
  );
  const customers = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "z" }];
  const ids = (list: Array<{ id: string }>) => list.map((c) => c.id);

  it("sorts by spend, orders or latest order, a customer with none last", () => {
    expect(ids(sortCustomers(customers, "recent", stats))).toEqual(["a", "b", "c", "z"]);
    expect(ids(sortCustomers(customers, "spend", stats))).toEqual(["b", "c", "a", "z"]);
    expect(ids(sortCustomers(customers, "orders", stats))).toEqual(["c", "a", "b", "z"]);
    expect(ids(sortCustomers(customers, "last_order", stats))).toEqual(["c", "b", "a", "z"]);
  });

  it("sums what a buyer is worth, who came back and the top tenth's share", () => {
    expect(valueSummary(stats)).toEqual({
      buyers: 3,
      averageValue: 145 / 3,
      repeatRate: 33.3,
      topTenthShare: 62.1,
    });
    expect(valueSummary(new Map()).buyers).toBe(0);
  });

  it("shows the figures above the list, and nothing before the first order", () => {
    render(<CustomerValueStrip summary={valueSummary(stats)} currency="BHD" isAr={false} />);
    expect(screen.getByText("Average customer value")).toBeInTheDocument();
    expect(screen.getByText("33.3%")).toBeInTheDocument();
    const empty = render(
      <CustomerValueStrip summary={valueSummary(new Map())} currency="BHD" isAr={false} />,
    );
    expect(empty.container.innerHTML).toBe("");
  });
});
