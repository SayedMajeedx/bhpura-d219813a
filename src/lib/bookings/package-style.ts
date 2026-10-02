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
    ar: "هالة",
    en: "Aura",
    hintAr: "إطار معدني متحرك وتوهج هادئ",
    hintEn: "A living foil border with a breathing glow",
  },
  shimmer: {
    ar: "بريق",
    en: "Sheen",
    hintAr: "شعاع ضوء ناعم يعبر البطاقة",
    hintEn: "A soft band of light crosses the card",
  },
  ribbon: {
    ar: "شريط",
    en: "Ribbon",
    hintAr: "بطاقة معلّقة وحافة بارزة",
    hintEn: "A hanging tag and a bold edge",
  },
  plain: {
    ar: "كلاسيكي",
    en: "Classic",
    hintAr: "لون عميق وإطار رفيع، هادئ وراقٍ",
    hintEn: "A deep tint and a hairline frame, calm and formal",
  },
};

/** What a package saves against its price before the offer (null when it saves nothing). */
export function packageSavingPercent(was: number | null, price: number | null): number | null {
  if (was === null || price === null || was <= 0 || price <= 0 || price >= was) return null;
  return Math.round(((was - price) / was) * 100);
}
