import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StoreColours } from "@/features/content-studio/lib/studio-styles";
import { cardDesignQueries } from "@/lib/data/gift-cards/designs";
import { storeAddress } from "@/lib/platform-host";
import { verticalLineage } from "@/lib/verticals/registry";
import type { StoreVertical } from "@/lib/store-profile";
import {
  readStoreDesigns,
  verticalKind,
  type StoreDesigns,
  type VerticalKind,
} from "../lib/design";
import { loadCardFonts, logoUsable, photoUsable } from "../lib/canvas";

/**
 * Everything a store's cards are drawn with, read once for a page: its colours, names, logo (when
 * it can be set in one ink), its card photos (those large enough to print), its choices, its kind
 * of business, and whether the card's faces have loaded (a card is measured in them).
 */
export type CardKit = {
  colours: StoreColours;
  storeName: { ar: string | null; en: string | null };
  logo: string | null;
  photos: string[];
  store: StoreDesigns;
  kind: VerticalKind;
  storeLink: string;
  currency: string;
  /** The faces are loaded: until then a card is drawn with the fallback faces. */
  ready: boolean;
};

export type CardKitInput = {
  brandId: string;
  slug: string;
  logo: string | null | undefined;
  nameAr: string | null | undefined;
  nameEn: string | null | undefined;
  colours: StoreColours;
  vertical: string | null | undefined;
  currency: string | null | undefined;
};

export function useCardKit(input: CardKitInput): CardKit {
  const designsQ = useQuery(cardDesignQueries.store(input.brandId));
  const [fontsReady, setFontsReady] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    void loadCardFonts().finally(() => live && setFontsReady(true));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    const href = input.logo ?? null;
    void logoUsable(href).then((usable) => live && setLogo(usable ? href : null));
    return () => {
      live = false;
    };
  }, [input.logo]);

  const storePhotos = designsQ.data?.photos;
  useEffect(() => {
    let live = true;
    const list = storePhotos ?? [];
    void Promise.all(list.map(async (href) => ((await photoUsable(href)) ? href : null))).then(
      (usable) => live && setPhotos(usable.filter((href): href is string => href !== null)),
    );
    return () => {
      live = false;
    };
  }, [storePhotos]);

  const { colours, slug, nameAr, nameEn, vertical, currency } = input;
  return useMemo(
    () => ({
      colours,
      storeName: { ar: nameAr ?? null, en: nameEn ?? null },
      logo,
      photos,
      store: readStoreDesigns(designsQ.data),
      kind: verticalKind(vertical ? verticalLineage(vertical as StoreVertical) : []),
      storeLink: storeAddress(slug).replace(/^https?:\/\//, ""),
      currency: (currency || "BHD").toUpperCase(),
      ready: fontsReady,
    }),
    [colours, nameAr, nameEn, logo, photos, designsQ.data, vertical, slug, currency, fontsReady],
  );
}
