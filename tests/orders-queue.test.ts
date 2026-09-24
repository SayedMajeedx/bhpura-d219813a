import { describe, expect, it } from "vitest";
import {
  filterQueueOrders,
  isToPrepare,
  orderTabCounts,
  sortQueueOrders,
  type OrderQueueFilters,
} from "../src/features/orders/lib/order-queue";
import { getOrderWorkflow } from "../src/lib/order-workflow";

const order = (overrides: Record<string, unknown> = {}) => ({
  id: "o1",
  invoice_number: 101,
  status: "confirmed",
  payment_status: "paid",
  payment_method: "card",
  fulfillment_status: "ON_HOLD",
  fulfillment_method: "delivery",
  total: 30,
  advance_paid: 30,
  created_at: "2026-09-20T10:00:00Z",
  customer_name_snapshot: "Fatima",
  ...overrides,
});

const filters = (overrides: Partial<OrderQueueFilters> = {}): OrderQueueFilters => ({
  search: "",
  paymentFilter: "all",
  fulfillmentStatusFilter: "all",
  fulfillmentMethodFilter: "all",
  gatewayFilter: "all",
  tabFilter: "all",
  includeHistorical: false,
  hasMadeToOrder: false,
  ...overrides,
});

describe("orderTabCounts", () => {
  it("skips archived historical orders unless they are shown", () => {
    const orders = [order(), order({ id: "o2", status: "archived_historical" })];
    expect(orderTabCounts(orders, { includeHistorical: false, hasMadeToOrder: false }).all).toBe(1);
    expect(orderTabCounts(orders, { includeHistorical: true, hasMadeToOrder: false }).all).toBe(2);
  });

  it("counts the to-prepare tab with the same rule as its filter", () => {
    const orders = [
      order(),
      order({ id: "o2", fulfillment_status: "COMPLETED", status: "completed" }),
    ];
    const counts = orderTabCounts(orders, { includeHistorical: false, hasMadeToOrder: false });
    const listed = filterQueueOrders(orders, filters({ tabFilter: "to_prepare" }));
    expect(counts.to_prepare).toBe(listed.length);
  });
});

describe("isToPrepare", () => {
  it("excludes finished orders", () => {
    const done = getOrderWorkflow(order({ fulfillment_status: "COMPLETED", status: "completed" }));
    expect(isToPrepare(done, false)).toBe(false);
  });
});

describe("filterQueueOrders", () => {
  const orders = [
    order(),
    order({
      id: "o2",
      invoice_number: 202,
      customer_name_snapshot: "Sara",
      fulfillment_method: "pickup",
    }),
    order({ id: "o3", status: "archived_historical" }),
  ];

  it("searches invoice numbers and customer names", () => {
    expect(filterQueueOrders(orders, filters({ search: "202" })).map((o) => o.id)).toEqual(["o2"]);
    expect(filterQueueOrders(orders, filters({ search: "fatima" })).map((o) => o.id)).toEqual([
      "o1",
    ]);
  });

  it("filters by fulfillment method and hides archived orders by default", () => {
    expect(
      filterQueueOrders(orders, filters({ fulfillmentMethodFilter: "pickup" })).map((o) => o.id),
    ).toEqual(["o2"]);
    expect(filterQueueOrders(orders, filters()).map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(filterQueueOrders(orders, filters({ includeHistorical: true }))).toHaveLength(3);
  });
});

describe("sortQueueOrders", () => {
  const orders = [
    order({ id: "a", invoice_number: 3, total: 10, customer_name_snapshot: "zed" }),
    order({ id: "b", invoice_number: 1, total: 30, customer_name_snapshot: "Amal" }),
    order({ id: "c", invoice_number: 2, total: 20, customer_name_snapshot: "maha" }),
  ];

  it("sorts numbers numerically and names case-insensitively", () => {
    expect(sortQueueOrders(orders, "invoice_number", "asc").map((o) => o.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(sortQueueOrders(orders, "total", "desc").map((o) => o.id)).toEqual(["b", "c", "a"]);
    expect(sortQueueOrders(orders, "customer", "asc").map((o) => o.id)).toEqual(["b", "c", "a"]);
  });

  it("does not change the input", () => {
    sortQueueOrders(orders, "total", "asc");
    expect(orders.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });
});
