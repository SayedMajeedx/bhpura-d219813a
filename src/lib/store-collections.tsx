import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ProductRow } from "@/lib/data/storefront";

/**
 * What the store's layout loaded that says whether an automatic collection has anything in it:
 * every active product and how many best sellers the store has (`emptyCollections`). The menus
 * read it through `useStorefrontCategories`; outside a store's layout it is null and nothing is
 * hidden.
 */
export type StoreCollectionsSource = {
  products: readonly ProductRow[] | null;
  bestSellerCount: number | null;
};

const StoreCollectionsContext = createContext<StoreCollectionsSource | null>(null);

export function StoreCollectionsProvider({
  products,
  bestSellerCount,
  children,
}: StoreCollectionsSource & { children: ReactNode }) {
  const value = useMemo(() => ({ products, bestSellerCount }), [products, bestSellerCount]);
  return (
    <StoreCollectionsContext.Provider value={value}>{children}</StoreCollectionsContext.Provider>
  );
}

export function useStoreCollectionsSource(): StoreCollectionsSource | null {
  return useContext(StoreCollectionsContext);
}
