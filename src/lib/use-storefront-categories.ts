import { useQuery } from "@tanstack/react-query";
import { storefrontQueries } from "@/lib/data/storefront";
import { useStorefront } from "@/lib/storefront-context";

/**
 * The store's categories for the menus and search. They start from what the store's layout already
 * loaded, so every page has them in the HTML it sends and in its first paint: before, only the home
 * page did, and on every other page the menu's categories appeared a moment after the page, from a
 * request of their own.
 */
export function useStorefrontCategories(options: { enabled?: boolean } = {}) {
  const { brand, initialCategories } = useStorefront();
  return useQuery({
    ...storefrontQueries.categories(brand),
    initialData: initialCategories,
    ...options,
  });
}
