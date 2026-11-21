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
import type { LogoInfo } from "../lib/content";
import { fontSetOf, messageFontSet, type CardFontSet } from "../lib/card-faces";
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
  /** The gift cards' fonts by language, an upload or a platform face (null: the cards' own). */
  fonts: CardFontSet;
  /** A gift message card's fonts by language: its own choice, else the gift cards'. */
  messageFonts: CardFontSet;
  photos: string[];
  store: StoreDesigns;
  kind: VerticalKind;
  storeLink: string;
  currency: string;
  /** The store's number and Instagram (a gift message card's front prints them). */
  contact?: CardContact;
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
};

/**
 * Whether the card's faces and these chosen fonts have loaded: a card is measured in them, so it
 * is drawn again once they have.
 */
export function useCardFontsReady(...sets: CardFontSet[]): boolean {
  const key = JSON.stringify(sets);
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadCardFonts(...(JSON.parse(key) as CardFontSet[])).finally(() => live && setLoaded(key));
    return () => {
      live = false;
    };
  }, [key]);
  return loaded === key;
}

export function useCardKit(input: CardKitInput): CardKit {
  const designsQ = useQuery(cardDesignQueries.store(input.brandId));
  const [logo, setLogo] = useState<LogoInfo | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const stored = designsQ.data;
  const fonts = useMemo(() => fontSetOf(stored?.fonts), [stored?.fonts]);
  const messageFonts = useMemo(
    () => messageFontSet(stored?.message_fonts, fonts),
    [stored?.message_fonts, fonts],
  );
  const ready = useCardFontsReady(fonts, messageFonts);

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
      fonts,
      messageFonts,
      photos,
      store: readStoreDesigns(designsQ.data),
      kind: verticalKind(vertical ? verticalLineage(vertical as StoreVertical) : []),
      storeLink: storeAddress(slug).replace(/^https?:\/\//, ""),
      currency: (currency || "BHD").toUpperCase(),
      contact,
      ready,
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
      fonts,
      messageFonts,
      ready,
    ],
  );
}
