/**
 * The collections the storefront fills by itself (every product, the newest, the best sellers,
 * what is on sale), whatever their row in `categories` says. One reading for the storefront's
 * pages and the admin's pickers.
 */
export type SmartKind = "all" | "new" | "best" | "offers";

export function smartKindOf(slug: string | null | undefined): SmartKind | null {
  const s = (slug ?? "").trim().toLowerCase();
  // Every active product: the new-look footer's "All Products" link opened "Category unavailable".
  if (["all", "all-products", "shop"].includes(s)) return "all";
  if (["new-arrivals", "new"].includes(s)) return "new";
  if (["most-selling", "best-sellers", "best-selling"].includes(s)) return "best";
  if (["offers", "sale", "discounts"].includes(s)) return "offers";
  return null;
}

/**
 * The categories a product can be filed under: never an automatic one. The product editor once
 * offered "New arrivals", "Best sellers" and "Sale", and a product filed there left its real
 * category on the storefront. A product already filed under one keeps it in the list (`keep`),
 * so the picker still shows where it is.
 */
export function assignableCategories<T extends { slug?: string | null; name_en?: string | null }>(
  categories: readonly T[],
  keep?: string | null,
): T[] {
  const kept = (keep ?? "").trim().toLowerCase();
  return categories.filter((c) => {
    if (!smartKindOf(c.slug)) return true;
    return Boolean(kept) && [c.slug, c.name_en].some((v) => (v ?? "").toLowerCase() === kept);
  });
}
