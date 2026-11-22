import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { storefrontQueries } from "@/lib/data/storefront";
import { offersQueries } from "@/lib/data/offers";
import { emptyCollections } from "@/lib/smart-collections";
import type { SmartKind } from "@/lib/smart-categories";

/**
 * The automatic collections the store's menus leave out now, read from the storefront's own page
 * data and live offers by the storefront's own rule (`emptyCollections`), so the admin says what a
 * shopper sees. Null until both are read; asked only while the list holds such a collection.
 */
export function useEmptyCollections(
  slug: string | null | undefined,
  enabled: boolean,
): ReadonlySet<SmartKind> | null {
  const store = slug ?? "";
  const page = useQuery(storefrontQueries.pageData(store, enabled));
  const offers = useQuery(offersQueries.live(store, enabled));
  return useMemo(() => {
    if (!page.data || !offers.data) return null;
    return emptyCollections({
      products: page.data.products ?? null,
      bestSellerCount: page.data.bestSellerRows ? page.data.bestSellerRows.length : null,
      offers: offers.data,
    });
  }, [page.data, offers.data]);
}
