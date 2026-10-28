/**
 * What an order's one `discount` figure is made of.
 *
 * The column holds everything taken off the lines: a typed promo code (or a manual amount), the
 * store's automatic offers (`offer_discount`) and the shopper's loyalty points
 * (`loyalty_discount`; `redeem_loyalty_points_for_order` adds them to the discount). The editor
 * applies and removes a code on its own, so it must keep the other two: the database owns them.
 */

import { appliedOfferName, appliedOffersOf } from "@/lib/offers";

type DiscountSource = {
  discount?: unknown;
  offer_discount?: unknown;
  loyalty_discount?: unknown;
};

const fils = (n: number) => Math.round(Math.max(0, n) * 1000) / 1000;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export type DiscountParts = {
  /** Automatic offers, applied by the order builder. */
  offers: number;
  /** The shopper's points. */
  points: number;
  /** What is left: a promo code or an amount typed by staff. */
  code: number;
  total: number;
};

export function discountParts(order: DiscountSource | null | undefined): DiscountParts {
  const total = fils(num(order?.discount));
  const offers = Math.min(fils(num(order?.offer_discount)), total);
  const points = Math.min(fils(num(order?.loyalty_discount)), fils(total - offers));
  return { offers, points, code: fils(total - offers - points), total };
}

/** The part of the discount that stays when a code is removed or replaced. */
export function keptDiscount(order: DiscountSource | null | undefined): number {
  const { offers, points } = discountParts(order);
  return fils(offers + points);
}

type Lang = "ar" | "en";

export type DiscountLine = { key: "offers" | "points" | "code"; label: string; amount: number };

/**
 * The discount as the summary reads it when more than one thing made it up: the store's offers
 * (by name), the shopper's points, and the code or the amount staff typed. Empty when the whole
 * discount has one source, which the discount row already names.
 */
export function discountLines(
  order:
    (DiscountSource & { promo_code?: string | null; applied_offers?: unknown }) | null | undefined,
  lang: Lang,
): DiscountLine[] {
  const ar = lang === "ar";
  const parts = discountParts(order);
  const lines: DiscountLine[] = [];
  if (parts.offers > 0) {
    const names = appliedOffersOf(order?.applied_offers)
      .filter((offer) => offer.kind !== "free_delivery")
      .map((offer) => appliedOfferName(offer, lang));
    lines.push({
      key: "offers",
      label: names.length > 0 ? names.join(ar ? "، " : ", ") : ar ? "عرض المتجر" : "Store offer",
      amount: parts.offers,
    });
  }
  if (parts.points > 0) {
    lines.push({
      key: "points",
      label: ar ? "نقاط الولاء" : "Loyalty points",
      amount: parts.points,
    });
  }
  if (parts.code > 0) {
    const code = String(order?.promo_code ?? "").trim();
    lines.push({
      key: "code",
      label: code ? (ar ? `رمز ${code}` : `Promo: ${code}`) : ar ? "خصم يدوي" : "Manual discount",
      amount: parts.code,
    });
  }
  return lines.length > 1 ? lines : [];
}
