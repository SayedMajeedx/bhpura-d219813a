/**
 * A store's funnel: how many visits reached each step (a visit, a product looked at, a piece added
 * to the bag, checkout begun) and how many orders were placed. The storefront records the furthest
 * step of each visit (`record_storefront_step`, migration 20261031100000); the dashboard reads the
 * counts of a period (`storefront_funnel`). Nothing that names a shopper is kept.
 */

export type FunnelEvent = "page_view" | "view_item" | "add_to_cart" | "begin_checkout";

/** The step each storefront event reaches. */
export const FUNNEL_STEP: Record<FunnelEvent, 1 | 2 | 3 | 4> = {
  page_view: 1,
  view_item: 2,
  add_to_cart: 3,
  begin_checkout: 4,
};

export type FunnelCounts = {
  visits: number;
  product_views: number;
  carts: number;
  checkouts: number;
  orders: number;
};

/** A step is sent only when it goes further than the visit has gone: one request per step. */
export function stepToSend(event: string, reached: number): number | null {
  const step = FUNNEL_STEP[event as FunnelEvent];
  return step && step > reached ? step : null;
}

/** A share as a percentage with one decimal, or null with nothing to divide by. */
export function share(part: number, whole: number): number | null {
  if (!(whole > 0)) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export type FunnelStage = {
  key: "visits" | "product_views" | "carts" | "checkouts" | "orders";
  count: number;
  /** Of the visits. */
  ofVisits: number | null;
};

/** The funnel's stages in order, each with its share of the visits. */
export function funnelStages(counts: FunnelCounts): FunnelStage[] {
  const keys = ["visits", "product_views", "carts", "checkouts", "orders"] as const;
  return keys.map((key) => ({
    key,
    count: counts[key],
    ofVisits: key === "visits" ? null : share(counts[key], counts.visits),
  }));
}

/** The conversion rate: orders placed out of visits. */
export function conversionRate(counts: FunnelCounts): number | null {
  return share(counts.orders, counts.visits);
}
