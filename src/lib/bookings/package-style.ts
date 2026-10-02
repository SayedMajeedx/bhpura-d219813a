/**
 * How packages stand out on a store's booking page (booking_page_options;
 * migration 20261002170000). The merchant picks one of four looks; the page
 * draws it with the `pkg-card` classes in styles.css.
 */

export const PACKAGE_STYLES = ["glow", "shimmer", "ribbon", "plain"] as const;

export type PackageStyle = (typeof PACKAGE_STYLES)[number];

export const DEFAULT_PACKAGE_STYLE: PackageStyle = "glow";

/** A style read from a row; anything unknown is the default. */
export function packageStyleFrom(raw: unknown): PackageStyle {
  return (PACKAGE_STYLES as readonly string[]).includes(String(raw))
    ? (raw as PackageStyle)
    : DEFAULT_PACKAGE_STYLE;
}

/** The classes of a package card in this style. */
export const packageCardClass = (style: PackageStyle): string => `pkg-card pkg-card--${style}`;

export const PACKAGE_STYLE_LABELS: Record<
  PackageStyle,
  { ar: string; en: string; hintAr: string; hintEn: string }
> = {
  glow: {
    ar: "توهج",
    en: "Glow",
    hintAr: "إطار يتوهج بهدوء",
    hintEn: "A soft pulsing glow around the card",
  },
  shimmer: {
    ar: "لمعان",
    en: "Shimmer",
    hintAr: "لمعة خفيفة تعبر البطاقة",
    hintEn: "A light sweep across the card",
  },
  ribbon: {
    ar: "شريط",
    en: "Ribbon",
    hintAr: "شريط في الزاوية ورفعة عند التمرير",
    hintEn: "A corner ribbon, lifting on hover",
  },
  plain: {
    ar: "هادئ",
    en: "Plain",
    hintAr: "بطاقة ملوّنة بلا حركة",
    hintEn: "A tinted card, no animation",
  },
};

/** What a package saves against its price before the offer (null when it saves nothing). */
export function packageSavingPercent(was: number | null, price: number | null): number | null {
  if (was === null || price === null || was <= 0 || price <= 0 || price >= was) return null;
  return Math.round(((was - price) / was) * 100);
}
