import type { QueryClient } from "@tanstack/react-query";
import { fetchLiveOffers, offersQueries } from "@/lib/data/offers";
import type { StoreOffer } from "@/lib/offers";
import {
  currencyDisplayQueries,
  fetchCurrencyDisplay,
  type CurrencyDisplay,
} from "@/lib/data/currency-display";
import {
  fetchGiftCardOffer,
  giftCardOnlineQueries,
  type GiftCardOffer,
} from "@/lib/data/gift-cards/online";

/**
 * What every page of a store asks for once it has shown, read with the page instead (the speed
 * review of 2026-11-22): the store's live offers, the currencies it shows prices in and its gift
 * card offer. They are the same for every shopper, so they go in the page the edge keeps, and the
 * browser finds them in its cache instead of asking Mumbai (0.24-0.54 s each after the page had
 * loaded, the offers' struck prices arriving last). A read that fails is left out: the browser
 * asks for it as before.
 */
export type PageSeeds = {
  readAt: number;
  offers?: StoreOffer[];
  currency?: CurrencyDisplay | null;
  giftCard?: GiftCardOffer | null;
};

const settle = <T>(read: Promise<T>) => read.catch(() => undefined);

/** Read on the server with the page; a browser's own navigation reads them through its cache. */
export async function readPageSeeds(slug: string): Promise<PageSeeds | null> {
  if (typeof window !== "undefined") return null;
  const [offers, currency, giftCard] = await Promise.all([
    settle(fetchLiveOffers(slug)),
    settle(fetchCurrencyDisplay(slug)),
    settle(fetchGiftCardOffer(slug)),
  ]);
  return { readAt: Date.now(), offers, currency, giftCard };
}

/**
 * Puts the seeds in the browser's cache, dated when they were read, so a page the edge kept for a
 * while is read again by the queries' own freshness. Never over something already read.
 */
export function plantPageSeeds(qc: QueryClient, slug: string, seeds: PageSeeds | null | undefined) {
  if (!seeds) return;
  const plant = (key: readonly unknown[], value: unknown) => {
    if (value === undefined || qc.getQueryData(key) !== undefined) return;
    qc.setQueryData(key, value, { updatedAt: seeds.readAt });
  };
  plant(offersQueries.live(slug).queryKey, seeds.offers);
  plant(currencyDisplayQueries.store(slug).queryKey, seeds.currency);
  plant(giftCardOnlineQueries.offer(slug).queryKey, seeds.giftCard);
}
