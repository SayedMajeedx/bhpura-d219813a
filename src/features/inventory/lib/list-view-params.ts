/**
 * The address parameters the inventory list owns. `filter` is the older name a dashboard link uses.
 *
 * A module of its own, importing nothing: the route's `validateSearch` reads it, and a route's
 * search check is in the first script every page loads. Imported from `list-view.ts`, it brought
 * the list's rules (stock, attention, product facts, 6 KB) to every shopper (PageSpeed,
 * 2026-11-14).
 */
export const INVENTORY_VIEW_PARAMS = [
  "q",
  "scope",
  "filter",
  "category",
  "issue",
  "sort",
  "page",
  "view",
] as const;
