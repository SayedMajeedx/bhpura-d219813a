import { hasAvailableStock, type ProductRow } from "@/lib/data/storefront";

export type CatalogSort = "new" | "old" | "price-low" | "price-high" | "best";

/** The lowest selling price among a product's variants. */
const lowestPrice = (product: ProductRow) =>
  Math.min(
    ...product.product_variants
      .map((variant) => Number(variant.selling_price))
      .filter((value) => value >= 0),
    Number.MAX_SAFE_INTEGER,
  );

/** How many best sellers a listing ranks by when sorted by best sellers. */
export const BEST_SELLER_SORT_LIMIT = 100;

/**
 * A category listing's order: products that can be bought come first, then
 * the shopper's sort (best sellers by the store's sales rank `bestRank`, product id to its
 * place, the rest after them newest first; cheapest; dearest; oldest; or newest by default).
 */
export function sortCatalogProducts(
  products: ProductRow[],
  sort: CatalogSort,
  bestRank?: ReadonlyMap<string, number>,
): ProductRow[] {
  const newest = (a: ProductRow, b: ProductRow) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  return [...products].sort((a, b) => {
    const availability = Number(hasAvailableStock(b)) - Number(hasAvailableStock(a));
    if (availability !== 0) return availability;
    if (sort === "best") {
      const ra = bestRank?.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const rb = bestRank?.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ra !== rb ? ra - rb : newest(a, b);
    }
    return sort === "old"
      ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      : sort === "price-low"
        ? lowestPrice(a) - lowestPrice(b)
        : sort === "price-high"
          ? lowestPrice(b) - lowestPrice(a)
          : newest(a, b);
  });
}
