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

/**
 * A category listing's order: products that can be bought come first, then
 * the shopper's sort (oldest, cheapest, dearest, or newest by default).
 */
export function sortCatalogProducts(products: ProductRow[], sort: CatalogSort): ProductRow[] {
  return [...products].sort((a, b) => {
    const availability = Number(hasAvailableStock(b)) - Number(hasAvailableStock(a));
    if (availability !== 0) return availability;
    return sort === "old"
      ? new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      : sort === "price-low"
        ? lowestPrice(a) - lowestPrice(b)
        : sort === "price-high"
          ? lowestPrice(b) - lowestPrice(a)
          : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
