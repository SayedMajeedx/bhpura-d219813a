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

  details: (brandId: string) => [...ordersKeys.all(brandId), "detail"] as const,
  /** Without `scope`, matches the order in every scope (use it to invalidate). */
  detail: (brandId: string, orderId: string, scope?: OrderScope) =>
    scope
      ? ([...ordersKeys.details(brandId), orderId, scope] as const)
      : ([...ordersKeys.details(brandId), orderId] as const),
};
