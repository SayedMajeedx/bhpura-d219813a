import { arCount } from "@/lib/arabic-count";
import { REVIEW_HIGHLIGHT_LABELS } from "@/lib/order-reviews";
import type { ProductReviews } from "@/lib/data/reviews";

/**
 * How a product's page words its reviews. The stars count every review of an order that held the
 * piece; the cards are the reviews the customers let the store show, each with a first name.
 */

type Lang = "ar" | "en";

/** "Based on 5 reviews" / "من 5 تقييمات". */
export function reviewCountLine(count: number, lang: Lang): string {
  if (lang === "en") return `Based on ${count} ${count === 1 ? "review" : "reviews"}`;
  return `من ${arCount(count, { one: "تقييم واحد", two: "تقييمين", few: "تقييمات", many: "تقييماً" })}`;
}

/** The average as the page writes it: one decimal, Western digits ("4.7"). */
export function averageLabel(average: number): string {
  return (Math.round(Number(average) * 10) / 10).toFixed(1);
}

/** What customers praise most, in the store's words, most praised first (three at most). */
export function topPraise(
  highlights: ProductReviews["highlights"],
  lang: Lang,
): Array<{ key: string; label: string; count: number }> {
  return Object.entries(highlights ?? {})
    .filter(([key, count]) => REVIEW_HIGHLIGHT_LABELS[key] && Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([key, count]) => ({
      key,
      label: REVIEW_HIGHLIGHT_LABELS[key][lang],
      count: Number(count),
    }));
}

/** Each star level's share of the reviews (5 first), for the bars beside the average. */
export function starShares(
  stars: ProductReviews["stars"],
  count: number,
): Array<{ stars: number; count: number; share: number }> {
  return [5, 4, 3, 2, 1].map((level) => {
    const n = Number(stars?.[String(level)] ?? 0);
    return { stars: level, count: n, share: count > 0 ? n / count : 0 };
  });
}

/** Who wrote it: the first name the customer gave, else words that name nobody. */
export function reviewerName(name: string | null | undefined, lang: Lang): string {
  return name?.trim() || (lang === "ar" ? "أحد العملاء" : "A customer");
}

/** When: the month and the year ("October 2026" / "أكتوبر 2026"). */
export function reviewDate(date: string, lang: Lang): string {
  const at = new Date(date);
  if (Number.isNaN(at.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
    month: "long",
    year: "numeric",
  }).format(at);
}

/** How many cards show before "Show all". */
export const FIRST_REVIEWS = 3;
