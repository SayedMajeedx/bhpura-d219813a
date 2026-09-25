import { useQuery } from "@tanstack/react-query";
import { categoriesQueries } from "@/lib/data/categories";

/** Active categories for the inventory filters and bulk category change. */
export function useInventoryCategories(brandId: string) {
  return useQuery(categoriesQueries.active(brandId));
}
