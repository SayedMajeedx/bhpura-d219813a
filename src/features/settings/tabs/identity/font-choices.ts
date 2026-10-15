import { FONT_MOOD_PRESETS } from "@/components/settings/QuickThemeCustomizer";
import {
  resolveStorefrontTypography,
  type FontSource,
  type StorefrontFontSettings,
  type TypographyConfig,
  type TypographyLanguage,
} from "@/lib/typography";

/**
 * A store's fonts in one place: its text font and its heading font for Arabic and English, set
 * from the Typography group alone (the palette's font cards wrote the same columns), and read the
 * way the storefront reads them (`resolveStorefrontTypography`).
 */

export type FontPair = {
  id: string;
  label: { ar: string; en: string };
  description: { ar: string; en: string };
  heading: Record<TypographyLanguage, string>;
  text: Record<TypographyLanguage, string>;
};

/** The font pairs, each a heading font and a text font, as their cards say. */
export const FONT_PAIRS: FontPair[] = FONT_MOOD_PRESETS.map((preset) => ({
  id: preset.id,
  label: { ar: preset.labelAr, en: preset.labelEn },
  description: { ar: preset.descriptionAr, en: preset.descriptionEn },
  heading: { ar: preset.displayFontAr ?? preset.fontAr, en: preset.displayFontEn ?? preset.fontEn },
  text: { ar: preset.bodyFontAr ?? preset.fontAr, en: preset.bodyFontEn ?? preset.fontEn },
}));

type Settings = StorefrontFontSettings & Record<string, unknown>;

const same = (a: FontSource, b: FontSource) => a.family === b.family && a.url === b.url;

/** The fonts the storefront shows now. */
export function shownFonts(bs: Settings) {
  const typography = resolveStorefrontTypography(bs);
  return { text: typography.body, heading: typography.display, typography };
}

/** What a language's heading picker says: like the text, a family, or an uploaded file. */
export function headingChoice(bs: Settings, language: TypographyLanguage): string {
  const { text, heading } = shownFonts(bs);
  if (same(heading[language], text[language])) return "same";
  if (heading[language].url) return "upload";
  return heading[language].family;
}

/** The pair whose heading and text fonts are exactly what the store shows, if any. */
export function activePair(bs: Settings): string | null {
  const { text, heading } = shownFonts(bs);
  const match = FONT_PAIRS.find((pair) =>
    (["ar", "en"] as const).every(
      (language) =>
        !text[language].url &&
        !heading[language].url &&
        pair.text[language] === text[language].family &&
        pair.heading[language] === heading[language].family,
    ),
  );
  return match?.id ?? null;
}

export type FontChange = {
  text?: Partial<Record<TypographyLanguage, string>>;
  /** A family, or "same" to follow the text font. */
  heading?: Partial<Record<TypographyLanguage, string>>;
};

/**
 * The settings patch for a change of fonts. The text font is the simple picker's column (which
 * the storefront reads first); the typography settings keep the text and the heading together,
 * a heading equal to the text meaning "follow the text" (`resolveStorefrontTypography`).
 */
export function fontPatch(bs: Settings, change: FontChange) {
  const { typography } = shownFonts(bs);
  const text: Record<TypographyLanguage, FontSource> = { ...typography.body };
  const heading: Record<TypographyLanguage, FontSource> = { ...typography.display };
  const patch: Record<string, unknown> = {};
  for (const language of ["ar", "en"] as const) {
    const followed = same(heading[language], text[language]);
    const family = change.text?.[language];
    if (family) {
      text[language] = { family, url: null };
      patch[`storefront_font_${language}`] = family;
      patch[`storefront_font_${language}_url`] = null;
      // A heading that followed the text keeps following it.
      if (followed) heading[language] = text[language];
    }
    const choice = change.heading?.[language];
    if (choice)
      heading[language] = choice === "same" ? text[language] : { family: choice, url: null };
  }
  const next: TypographyConfig = { ...typography, body: text, display: heading };
  patch.storefront_typography = next;
  return patch;
}

/** The patch for a font pair: its text and heading fonts in both languages. */
export function pairPatch(bs: Settings, pair: FontPair) {
  return fontPatch(bs, { text: pair.text, heading: pair.heading });
}
