import { bundledFontFile, type TypographyConfig } from "@/lib/typography";
import type { CardFontFiles, CardPurpose } from "./content";

/**
 * The store's own heading fonts as card font files, by language: the font its storefront sets its
 * headings in (`resolveStorefrontTypography(...).display`), as an address the card can load and
 * the print page can name (an uploaded file's own address, else the platform's file for a font it
 * hosts, made whole with `origin`, as the print page opens in a window of its own). A font with no
 * file the card can load (a Google font, a system one) is left out, and the card's own face stays.
 */
export function storeCardFonts(
  typography: TypographyConfig | null | undefined,
  origin: string | null,
): CardFontFiles {
  const fileOf = (lang: "ar" | "en"): string | null => {
    const source = typography?.display?.[lang];
    if (!source) return null;
    if (source.url) return source.url;
    const file = bundledFontFile(source.family, lang);
    if (!file) return null;
    return origin ? `${origin.replace(/\/$/, "")}${file}` : file;
  };
  return { ar: fileOf("ar"), en: fileOf("en") };
}

/**
 * The font files a card is set in: a gift card's are the store's own card fonts (or the cards'
 * faces); a gift message card's are those, else the store's own heading fonts, as the owner asked
 * on 2026-11-10 (the message read in a face the store does not use).
 */
export function cardFontFiles(
  kit: { fonts?: CardFontFiles; storeFonts?: CardFontFiles },
  purpose: CardPurpose | undefined,
): CardFontFiles {
  const own = kit.fonts ?? { ar: null, en: null };
  if (purpose !== "message") return own;
  return { ar: own.ar ?? kit.storeFonts?.ar ?? null, en: own.en ?? kit.storeFonts?.en ?? null };
}
