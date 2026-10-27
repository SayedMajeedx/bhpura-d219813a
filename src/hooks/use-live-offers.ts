import { useQuery } from "@tanstack/react-query";
import { offersQueries } from "@/lib/data/offers";
import type { StoreOffer } from "@/lib/offers";
import { useStorefront } from "@/lib/storefront-context";
import { isCatalogMode, shouldShowPrices } from "@/lib/storefront-mode";

/**
 * The store's live automatic offers, for a storefront price (`offeredCardPrice`): one request a
 * page, shared by every card. None in a catalog store or one that hides its prices, where no
 * order is placed on the site.
 */
export function useLiveOffers(): StoreOffer[] {
  const { brand, settings } = useStorefront();
  const sells = !isCatalogMode(settings) && shouldShowPrices(settings);
  return useQuery(offersQueries.live(brand.slug, sells)).data ?? [];
}
