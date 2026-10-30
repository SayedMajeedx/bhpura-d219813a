import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ordersQueries } from "@/lib/data/orders";
import type { SupplierOrder } from "../lib/order-state";
import {
  REORDER_WINDOW_DAYS,
  onOrderByVariant,
  reorderSuggestions,
  soldByVariant,
} from "../lib/reorder";
import { useSupplierCatalog } from "./use-supplier-catalog";

/** The sizes to order again (`reorderSuggestions`), from the store's sales and open orders. */
export function useReorderSuggestions(
  brandId: string,
  orders: readonly SupplierOrder[],
  lang: "ar" | "en",
  enabled: boolean,
) {
  const catalog = useSupplierCatalog(brandId, lang);
  const sales = useQuery({
    ...ordersQueries.variantSales(brandId, REORDER_WINDOW_DAYS),
    enabled: enabled && Boolean(brandId),
  });
  const salesData = sales.data;
  const lines = useMemo(() => {
    if (!enabled || !salesData) return [];
    return reorderSuggestions({
      products: catalog.products,
      variants: catalog.variants,
      sold: soldByVariant(salesData),
      onOrder: onOrderByVariant(orders),
    });
  }, [enabled, salesData, catalog.products, catalog.variants, orders]);
  return {
    lines,
    catalog,
    isLoading: enabled && (sales.isLoading || catalog.queries.some((q) => q.isLoading)),
  };
}
