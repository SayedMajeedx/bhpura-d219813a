import type { Product, Variant } from "@/features/inventory/types";

/**
 * What the store's stock adds up to: pieces in the store, pieces at partners, and what they are
 * worth at their selling price and at cost. A service has no pieces and is left out; a
 * made-to-order product counts for the ready sizes it holds, which are real pieces on a shelf.
 */
export type StockTotals = {
  /** Products that hold at least one piece. */
  productsInStock: number;
  storePieces: number;
  partnerPieces: number;
  /** Every piece at the price a shopper pays for it. */
  retailValue: number;
  /** Every piece at what it cost. */
  costValue: number;
  /** Pieces in stock whose cost was never entered: the cost value is short by them. */
  piecesWithoutCost: number;
};

const count = (value: unknown) => Math.max(0, Number(value) || 0);

export function stockTotals(
  products: Array<Pick<Product, "id" | "item_kind" | "cost_price">>,
  variantsByProduct: Record<string, Variant[]>,
): StockTotals {
  const totals: StockTotals = {
    productsInStock: 0,
    storePieces: 0,
    partnerPieces: 0,
    retailValue: 0,
    costValue: 0,
    piecesWithoutCost: 0,
  };
  for (const product of products) {
    if (product.item_kind === "service") continue;
    let productPieces = 0;
    for (const variant of variantsByProduct[product.id] ?? []) {
      const store = count(variant.stock_main);
      const partner = count(variant.stock_incubator);
      const pieces = store + partner;
      if (pieces === 0) continue;
      // A variant with no cost of its own costs what its product costs.
      const cost = count(variant.cost_price) || count(product.cost_price);
      productPieces += pieces;
      totals.storePieces += store;
      totals.partnerPieces += partner;
      totals.retailValue += pieces * count(variant.selling_price);
      totals.costValue += pieces * cost;
      if (cost === 0) totals.piecesWithoutCost += pieces;
    }
    if (productPieces > 0) totals.productsInStock += 1;
  }
  return totals;
}
