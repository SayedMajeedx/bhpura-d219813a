import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { storefrontQueries } from "@/lib/data/storefront";
import { useStorefront } from "@/lib/storefront-context";
import { useLiveOffers } from "@/hooks/use-live-offers";
import { useStoreCollectionsSource } from "@/lib/store-collections";
import { emptyCollections, shownCategories } from "@/lib/smart-collections";

/**
 * The store's categories for the menus and search. They start from what the store's layout already
 * loaded, so every page has them in the HTML it sends and in its first paint: before, only the home
 * page did, and on every other page the menu's categories appeared a moment after the page, from a
 * request of their own.
 *
 * A menu (`menu: true`: the header, the phone's menu, the footer, search) leaves out an automatic
 * collection whose page would list nothing, a sale with nothing on sale or new arrivals with
 * nothing new, and it comes back by itself (`emptyCollections`). A page that looks a category up
 * (the category page, the breadcrumb) reads them all.
 */
export function useStorefrontCategories(options: { enabled?: boolean; menu?: boolean } = {}) {
  const { menu = false, ...queryOptions } = options;
  const { brand, initialCategories } = useStorefront();
  const source = useStoreCollectionsSource();
  const offers = useLiveOffers();
  // `useLiveOffers` answers a new empty list on each render while there are none.
  const liveOffers = offers.length > 0 ? offers : null;
  const query = useQuery({
    ...storefrontQueries.categories(brand),
    initialData: initialCategories,
    ...queryOptions,
  });
  const { data } = query;
  const shown = useMemo(() => {
    if (!menu || !data) return data;
    const empty = emptyCollections({
      products: source?.products,
      bestSellerCount: source?.bestSellerCount,
      offers: liveOffers,
    });
    return shownCategories(data, empty);
  }, [menu, data, source, liveOffers]);
  return menu ? { ...query, data: shown } : query;
}
