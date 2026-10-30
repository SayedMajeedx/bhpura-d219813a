import type { CustomerCrmStats } from "@/lib/commerce-metrics";

/**
 * What each customer is worth to the store and where they stand: the groups of the customers
 * list, its sorts, and the figures above it. A customer's group is read from their badge
 * (`buildCustomerCrmStats`) in one place, which the counts and the filter once each wrote out.
 */

export type CustomerGroup = "vip" | "repeat" | "new" | "one_time" | "churn";

type Stats = Pick<CustomerCrmStats, "badge" | "totalOrders" | "lifetimeSpend" | "lastOrderDate">;

export function customerGroup(stats: Stats | undefined | null): CustomerGroup | null {
  if (!stats) return null;
  switch (stats.badge) {
    case "VIP":
      return "vip";
    case "Churn Risk":
      return "churn";
    case "New Buyer":
      return "new";
    case "One-time":
      return "one_time";
    case "Regular":
      return "repeat";
    default:
      return stats.totalOrders > 1 ? "repeat" : null;
  }
}

/** How many customers are in each group, and in all. */
export function groupCounts(
  customerIds: readonly string[],
  stats: ReadonlyMap<string, Stats>,
): Record<"all" | CustomerGroup, number> {
  const counts = { all: customerIds.length, vip: 0, repeat: 0, new: 0, one_time: 0, churn: 0 };
  for (const id of customerIds) {
    const group = customerGroup(stats.get(id));
    if (group) counts[group] += 1;
  }
  return counts;
}

export type CustomerSort = "recent" | "spend" | "orders" | "last_order";
export const CUSTOMER_SORTS: readonly CustomerSort[] = ["recent", "spend", "orders", "last_order"];

/**
 * The list in the order asked: as it was read (the newest added first), by what each spent, by
 * how many orders, or by their latest order. Ties keep the list's own order.
 */
export function sortCustomers<T extends { id: string }>(
  customers: readonly T[],
  sort: CustomerSort,
  stats: ReadonlyMap<string, Stats>,
): T[] {
  if (sort === "recent") return [...customers];
  const key = (c: T): number => {
    const s = stats.get(c.id);
    if (!s) return -1;
    if (sort === "spend") return s.lifetimeSpend;
    if (sort === "orders") return s.totalOrders;
    return s.lastOrderDate ? Date.parse(s.lastOrderDate) : -1;
  };
  return customers
    .map((customer, index) => ({ customer, index, key: key(customer) }))
    .sort((a, b) => b.key - a.key || a.index - b.index)
    .map((entry) => entry.customer);
}

export type ValueSummary = {
  /** Customers with at least one order that counts. */
  buyers: number;
  /** What a buyer has spent, on average. */
  averageValue: number;
  /** Of the buyers, the share who ordered more than once (%, one decimal). */
  repeatRate: number | null;
  /** The share of all spend that the top tenth of buyers made (%, one decimal). */
  topTenthShare: number | null;
};

export function valueSummary(stats: ReadonlyMap<string, Stats>): ValueSummary {
  const buyers = [...stats.values()].filter((s) => s.totalOrders > 0);
  if (buyers.length === 0) {
    return { buyers: 0, averageValue: 0, repeatRate: null, topTenthShare: null };
  }
  const total = buyers.reduce((sum, s) => sum + s.lifetimeSpend, 0);
  const repeat = buyers.filter((s) => s.totalOrders > 1).length;
  const top = [...buyers]
    .sort((a, b) => b.lifetimeSpend - a.lifetimeSpend)
    .slice(0, Math.max(1, Math.ceil(buyers.length / 10)))
    .reduce((sum, s) => sum + s.lifetimeSpend, 0);
  const pct = (part: number, whole: number) =>
    whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
  return {
    buyers: buyers.length,
    averageValue: total / buyers.length,
    repeatRate: pct(repeat, buyers.length),
    topTenthShare: pct(top, total),
  };
}
