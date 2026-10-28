/**
 * What an order's one `discount` figure is made of.
 *
 * The column holds everything taken off the lines: a typed promo code (or a manual amount), the
 * store's automatic offers (`offer_discount`) and the shopper's loyalty points
 * (`loyalty_discount`; `redeem_loyalty_points_for_order` adds them to the discount). The editor
 * applies and removes a code on its own, so it must keep the other two: the database owns them.
 */

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
