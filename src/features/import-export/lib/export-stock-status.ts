import { productAvailability, type AvailabilityProduct } from "@/lib/product-availability";

/** The stock status written in a product export's "stock status" column. */
export type ExportStockStatus =
  "In Stock" | "Low Stock" | "Out of Stock" | "Made to Order" | "Service";

/**
 * A variant's stock status for the export, by the shared availability rule: a made-to-order
 * piece is "Made to Order" (never "Out of Stock"), a service is "Service".
 */
export function exportStockStatus(
  product: AvailabilityProduct,
  variantStock: number,
): ExportStockStatus {
  switch (productAvailability(product, variantStock).status) {
    case "service":
      return "Service";
    case "made_to_order":
      return "Made to Order";
    case "out":
      return "Out of Stock";
    case "low":
      return "Low Stock";
    default:
      return "In Stock";
  }
}

/**
 * Whether a row passes the export's stock filter. "In stock" keeps everything a shopper can buy
 * (made to order and services included); "low" and "out" are only products sold from stock.
 * Any other filter (all, active only, drafts only) is not about stock.
 */
export function matchesExportStockFilter(filter: string, status: ExportStockStatus): boolean {
  if (filter === "in_stock") return status !== "Out of Stock";
  if (filter === "low_stock") return status === "Low Stock";
  if (filter === "out_of_stock") return status === "Out of Stock";
  return true;
}
