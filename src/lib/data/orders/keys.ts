import type { OrderScope } from "./types";

/**
 * TanStack Query keys for admin orders.
 *
 * - Every key starts with `["orders", brandId]`, so
 *   `invalidateQueries({ queryKey: ordersKeys.all(brandId) })` refreshes the
 *   queue and any open order of that brand.
 * - Lists and details sit on separate branches: code that rewrites list
 *   entries in place (`setQueriesData`) must target `ordersKeys.lists`, which
 *   only holds arrays.
 */
export const ordersKeys = {
  all: (brandId: string) => ["orders", brandId] as const,

  lists: (brandId: string) => [...ordersKeys.all(brandId), "list"] as const,
  list: (brandId: string, scope: OrderScope) => [...ordersKeys.lists(brandId), scope] as const,

  /** Finance views (dashboard and reports): every order, newest first. */
  finance: (brandId: string) => [...ordersKeys.all(brandId), "finance"] as const,
  recent: (brandId: string, limit: number) =>
    [...ordersKeys.all(brandId), "recent", limit] as const,
  reconciliation: (brandId: string, limit: number) =>
    [...ordersKeys.all(brandId), "reconciliation", limit] as const,
  /** Orders that count for COGS in a date range (`YYYY-MM-DD`, empty for open). */
  cogs: (brandId: string, from: string, to: string) =>
    [...ordersKeys.all(brandId), "cogs", from, to] as const,

  /** Readers outside the queue and editor (see `readers.ts`). */
  customerMetrics: (brandId: string) => [...ordersKeys.all(brandId), "customer-metrics"] as const,
  customerOrders: (brandId: string, customerId: string) =>
    [...ordersKeys.all(brandId), "customer", customerId] as const,
  promoUsage: (brandId: string) => [...ordersKeys.all(brandId), "promo-usage"] as const,
  variantSales: (brandId: string, days: number) =>
    [...ordersKeys.all(brandId), "variant-sales", days] as const,
  exportRows: (brandId: string) => [...ordersKeys.all(brandId), "export"] as const,
  story: (brandId: string, orderId: string) =>
    [...ordersKeys.all(brandId), "story", orderId] as const,
  invoiceNumber: (brandId: string, orderId: string) =>
    [...ordersKeys.all(brandId), "invoice-number", orderId] as const,

  details: (brandId: string) => [...ordersKeys.all(brandId), "detail"] as const,
  /** Without `scope`, matches the order in every scope (use it to invalidate). */
  detail: (brandId: string, orderId: string, scope?: OrderScope) =>
    scope
      ? ([...ordersKeys.details(brandId), orderId, scope] as const)
      : ([...ordersKeys.details(brandId), orderId] as const),
};
