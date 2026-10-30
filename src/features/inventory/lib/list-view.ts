import { isAttentionKey, type AttentionKey } from "@/features/inventory/lib/attention";
import {
  INVENTORY_SORTS,
  inventoryScopeFromFilter,
  type InventoryScope,
  type InventorySort,
} from "@/features/inventory/lib/product-list";

/**
 * How the list is drawn: rows, or the products' photos as cards (a boutique knows a piece by its
 * picture before its name).
 */
export type InventoryLayout = "list" | "photos";

/**
 * What the inventory list is showing: the tab, the search, the filters, the sort, the page and
 * whether it is drawn as rows or photos.
 * It lives in the address, so a reload, the back button or a link sent to a colleague opens the
 * same list ("the low-stock dresses, page 2") instead of the first page of everything.
 */
export type InventoryView = {
  search: string;
  scope: InventoryScope;
  category: string;
  issue: "all" | AttentionKey;
  sort: InventorySort;
  page: number;
  layout: InventoryLayout;
};

export const DEFAULT_INVENTORY_VIEW: InventoryView = {
  search: "",
  scope: "all",
  category: "all",
  issue: "all",
  sort: "newest",
  page: 1,
  layout: "list",
};

/** The address parameters the list owns. `filter` is the older name a dashboard link uses. */
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

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** The view an address asks for; anything it does not say, or says wrongly, is the default. */
export function inventoryViewFromSearch(search: Record<string, unknown>): InventoryView {
  const sort = text(search.sort);
  const issue = text(search.issue);
  const page = Number(search.page);
  return {
    search: text(search.q).slice(0, 120),
    scope:
      inventoryScopeFromFilter(text(search.scope)) ??
      inventoryScopeFromFilter(text(search.filter)) ??
      "all",
    category: text(search.category) || "all",
    issue: isAttentionKey(issue) ? issue : "all",
    sort: (INVENTORY_SORTS as readonly string[]).includes(sort)
      ? (sort as InventorySort)
      : "newest",
    page: Number.isInteger(page) && page > 1 ? page : 1,
    layout: text(search.view) === "photos" ? "photos" : "list",
  };
}

/**
 * The query string for a view, written over the current one: the list's own parameters are
 * replaced (a default is left out, so a plain list has a plain address) and everything else in
 * the address is kept.
 */
export function inventoryViewToSearch(currentSearch: string, view: InventoryView): string {
  const params = new URLSearchParams(currentSearch);
  for (const key of INVENTORY_VIEW_PARAMS) params.delete(key);
  if (view.search.trim()) params.set("q", view.search.trim());
  if (view.scope !== "all") params.set("scope", view.scope);
  if (view.category !== "all") params.set("category", view.category);
  if (view.issue !== "all") params.set("issue", view.issue);
  if (view.sort !== "newest") params.set("sort", view.sort);
  if (view.page > 1) params.set("page", String(view.page));
  if (view.layout !== "list") params.set("view", view.layout);
  return params.toString();
}

/** How many filters narrow the list (the tab, the sort and the layout are not filters). */
export function activeFilterCount(view: InventoryView): number {
  return (
    (view.category !== "all" ? 1 : 0) +
    (view.issue !== "all" ? 1 : 0) +
    (view.search.trim() ? 1 : 0)
  );
}
