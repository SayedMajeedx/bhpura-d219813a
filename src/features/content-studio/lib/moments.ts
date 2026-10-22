import { formatAxisValue, type ResolvedVariantAxis, type VariantLike } from "@/lib/variant-axes";
import { PLACEHOLDER_SIZE_VALUES } from "@/lib/variant-sku-utils";
import { REVIEW_HIGHLIGHT_LABELS } from "@/lib/order-reviews";
import { formatAmount } from "@/features/content-studio/lib/batch";

/**
 * The rules behind the templates made for a moment: a sale's last days (Last
 * Chance), a piece back on the shelf (Back in Stock), what customers say
 * (Customer Favourite) and a launch to come (Coming Soon). Pure, so what a
 * post claims can be checked.
 */

// ── Last Chance ─────────────────────────────────────────────────────────────

export type PromoLike = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  max_redemptions: number | null;
};

/**
 * The codes a public post may name: switched on, started, ending later than
 * `now`, and open to more than one shopper. A code made for one customer (an
 * abandoned cart's, a review's reward: one redemption) is never advertised.
 * The soonest to end first.
 */
export function postablePromos<P extends PromoLike>(promos: readonly P[], now: Date): P[] {
  const at = now.getTime();
  return promos
    .filter(
      (promo) =>
        promo.is_active &&
        Boolean(promo.end_date) &&
        new Date(promo.end_date as string).getTime() > at &&
        (!promo.start_date || new Date(promo.start_date).getTime() <= at) &&
        (promo.max_redemptions === null || promo.max_redemptions > 1),
    )
    .sort((a, b) => new Date(a.end_date!).getTime() - new Date(b.end_date!).getTime());
}

/**
 * What a code takes off, as a post says it, in pieces in reading order:
 * ["15% off"] / ["خصم 15٪"], ["5.000 BHD", "off"] / ["خصم", "5.000 د.ب."].
 * An amount is its own piece, so an Arabic word and a price are never one
 * string (they reorder into each other when drawn together).
 */
export function promoOffer(
  promo: Pick<PromoLike, "discount_type" | "discount_value">,
  lang: "ar" | "en",
  currencyLabel: string,
): string[] {
  const value = Number(promo.discount_value);
  if (promo.discount_type === "percentage") {
    const percent = Number.isInteger(value) ? String(value) : value.toFixed(1);
    return [lang === "ar" ? `خصم ${percent}٪` : `${percent}% off`];
  }
  const amount = `${formatAmount(value)} ${currencyLabel}`;
  return lang === "ar" ? ["خصم", amount] : [amount, "off"];
}

/** A day (YYYY-MM-DD) on the reader's own calendar, from a moment or a Date. */
export function localDay(moment: string | Date): string {
  const date = typeof moment === "string" ? new Date(moment) : moment;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The day a Last Chance starts on before the merchant picks: three days from `today`. */
export function defaultDeadline(today: Date): string {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
  return localDay(day);
}

/**
 * How a post names its last day: the weekday ("Thursday" / "الخميس") and the
 * date ("16 October" / "16 أكتوبر"), read on the reader's calendar. Null for
 * a day that is not one.
 */
export function deadlineParts(
  day: string,
  lang: "ar" | "en",
): { day: string; date: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  const locale = lang === "ar" ? "ar-u-nu-latn" : "en-GB";
  return {
    day: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date),
    date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(date),
  };
}

// ── Back in Stock ───────────────────────────────────────────────────────────

type StockedVariant = VariantLike & {
  product_id?: string;
  id?: string;
  stock_main?: number | null;
  stock_incubator?: number | null;
};

/** The pieces a variant can sell: the store's and its partners'. */
const units = (variant: StockedVariant) =>
  Math.max(0, Number(variant.stock_main) || 0) + Math.max(0, Number(variant.stock_incubator) || 0);

/**
 * The options a shopper can buy now, as the store labels them: its sizes
 * first (what shoppers wait for), else its first option. Only values with a
 * piece in stock; the "Standard" placeholder is never one. Null when the
 * product has no options to name.
 */
export function inStockOptions(
  axes: readonly ResolvedVariantAxis[],
  variants: readonly StockedVariant[],
  lang: "ar" | "en",
): { axisLabel: string; options: string[] } | null {
  const axis = axes.find((candidate) => candidate.field === "size") ?? axes[0];
  if (!axis) return null;
  const options = axis.values.filter((value) => {
    if ((PLACEHOLDER_SIZE_VALUES as readonly string[]).includes(value)) return false;
    const key = value.trim().toLowerCase();
    return variants.some(
      (variant) => (variant[axis.field] ?? "").trim().toLowerCase() === key && units(variant) > 0,
    );
  });
  if (options.length === 0) return null;
  return {
    axisLabel: axis.label,
    options: options.slice(0, 8).map((value) => formatAxisValue(axis, value, lang, [...variants])),
  };
}

type Request = { product_id: string; variant_id: string | null; notified_at: string | null };

/** How many shoppers asked to hear when this product is back (told or still waiting). */
export function askedCount(requests: readonly Request[], productId: string): number {
  return requests.filter((request) => request.product_id === productId).length;
}

/**
 * The products shoppers are still waiting for that can be bought again: a
 * request for a size needs a piece of that size, one for the product any
 * piece. In order of how many are waiting.
 */
export function backNowProductIds(
  requests: readonly Request[],
  variants: readonly StockedVariant[],
): string[] {
  const byVariant = new Map(variants.map((variant) => [variant.id, variant]));
  const productUnits = new Map<string, number>();
  for (const variant of variants) {
    if (!variant.product_id) continue;
    productUnits.set(
      variant.product_id,
      (productUnits.get(variant.product_id) ?? 0) + units(variant),
    );
  }
  const waiting = new Map<string, number>();
  for (const request of requests) {
    if (request.notified_at) continue;
    const variant = request.variant_id ? byVariant.get(request.variant_id) : undefined;
    const ready = variant ? units(variant) : (productUnits.get(request.product_id) ?? 0);
    if (ready > 0) waiting.set(request.product_id, (waiting.get(request.product_id) ?? 0) + 1);
  }
  return [...waiting.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

// ── Customer Favourite ──────────────────────────────────────────────────────

/** The store's reviews summed up for a post: never a name, a phone or a comment. */
export type RatingSummary = { average: number; count: number; highlights: string[] };

/**
 * The average rating (to one decimal), how many reviews, and the three things
 * customers praise most, in the store's words for them. Null with no reviews.
 */
export function ratingSummary(
  reviews: ReadonlyArray<{ rating: number; highlights: string[] | null }>,
  lang: "ar" | "en",
): RatingSummary | null {
  const rated = reviews.filter((review) => Number(review.rating) > 0);
  if (rated.length === 0) return null;
  const average = rated.reduce((sum, review) => sum + Number(review.rating), 0) / rated.length;
  const tally = new Map<string, number>();
  for (const review of rated) {
    for (const key of review.highlights ?? []) tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const highlights = [...tally.entries()]
    .filter(([key]) => REVIEW_HIGHLIGHT_LABELS[key])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => REVIEW_HIGHLIGHT_LABELS[key][lang]);
  return { average: Math.round(average * 10) / 10, count: rated.length, highlights };
}

// ── Coming Soon ─────────────────────────────────────────────────────────────

/**
 * A launch hour as a post writes it, from a time field's "HH:MM": "8 PM",
 * "8:30 PM" / "8 مساءً", "10:15 صباحاً" (minutes only when there are some,
 * Western digits). Null for an empty or broken value.
 */
export function launchTime(value: string, lang: "ar" | "en"): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const clock = minutes ? `${hour12}:${match[2]}` : String(hour12);
  const morning = hours < 12;
  if (lang === "en") return `${clock} ${morning ? "AM" : "PM"}`;
  return `${clock} ${morning ? "صباحاً" : "مساءً"}`;
}
