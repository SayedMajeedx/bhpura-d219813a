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
import { inspectLogo, loadCardFonts, photoUsable } from "../lib/canvas";
import type { CardFontFiles, LogoInfo } from "../lib/content";
import type { CardContact } from "../lib/contact";

/**
 * Everything a store's cards are drawn with, read once for a page: its colours, names, logo (when
 * it can be set in one ink), its card photos (those large enough to print), its choices, its kind
 * of business, and whether the card's faces have loaded (a card is measured in them).
 */
export type CardKit = {
  colours: StoreColours;
  storeName: { ar: string | null; en: string | null };
  /** The store's logo measured to its mark, when it can be set in one ink. */
  logo: LogoInfo | null;
  /** How large the store's mark is drawn (1 as designed). */
  logoScale: number;
  /** The store's own card fonts by language, as uploaded (null: the cards' own faces). */
  fonts: CardFontFiles;
  photos: string[];
  store: StoreDesigns;
  kind: VerticalKind;
  storeLink: string;
  currency: string;
  /** The store's number and Instagram (a gift message card's front prints them). */
  contact?: CardContact;
  /** The store's own heading fonts, which a gift message card is set in. */
  storeFonts?: CardFontFiles;
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
  contact?: CardContact;
  storeFonts?: CardFontFiles;
};

export function useCardKit(input: CardKitInput): CardKit {
  const designsQ = useQuery(cardDesignQueries.store(input.brandId));
  const [loadedFonts, setLoadedFonts] = useState<string | null>(null);
  const [logo, setLogo] = useState<LogoInfo | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const fontAr = designsQ.data?.fonts?.ar?.url ?? null;
  const fontEn = designsQ.data?.fonts?.en?.url ?? null;
  const storeAr = input.storeFonts?.ar ?? null;
  const storeEn = input.storeFonts?.en ?? null;
  const fontKey = `${fontAr ?? ""}|${fontEn ?? ""}|${storeAr ?? ""}|${storeEn ?? ""}`;

  // The card is measured in its faces: drawn again once they (and the store's own) have loaded.
  useEffect(() => {
    let live = true;
    void Promise.all([
      loadCardFonts({ ar: fontAr, en: fontEn }),
      storeAr || storeEn ? loadCardFonts({ ar: storeAr, en: storeEn }) : null,
    ]).finally(() => live && setLoadedFonts(fontKey));
    return () => {
      live = false;
    };
  }, [fontAr, fontEn, storeAr, storeEn, fontKey]);

  useEffect(() => {
    let live = true;
    void inspectLogo(input.logo ?? null).then((info) => live && setLogo(info));
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

  const { colours, slug, nameAr, nameEn, vertical, currency, contact } = input;
  return useMemo(
    () => ({
      colours,
      storeName: { ar: nameAr ?? null, en: nameEn ?? null },
      logo,
      logoScale: designsQ.data?.logo_scale ?? 1,
      fonts: { ar: fontAr, en: fontEn },
      photos,
      store: readStoreDesigns(designsQ.data),
      kind: verticalKind(vertical ? verticalLineage(vertical as StoreVertical) : []),
      storeLink: storeAddress(slug).replace(/^https?:\/\//, ""),
      currency: (currency || "BHD").toUpperCase(),
      contact,
      storeFonts: storeAr || storeEn ? { ar: storeAr, en: storeEn } : undefined,
      ready: loadedFonts === fontKey,
    }),
    [
      colours,
      nameAr,
      nameEn,
      logo,
      photos,
      designsQ.data,
      vertical,
      slug,
      currency,
      contact,
      storeAr,
      storeEn,
      fontAr,
      fontEn,
      loadedFonts,
      fontKey,
    ],
  );
}
