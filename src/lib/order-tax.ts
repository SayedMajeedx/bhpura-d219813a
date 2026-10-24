/**
 * The tax an order carries and the total it charges: the TypeScript twin of the order builder's
 * rule (`place_storefront_order`, and `reprice_order_totals` when a booking's add-ons or offer
 * change the order), so the checkout shows the total the order will charge.
 * `tests/order-tax-parity.test.ts` runs both over the same orders.
 *
 * The rule: the store's rate (`business_settings.default_tax_rate`) on the subtotal after
 * discounts (promo code, booking offer); the delivery fee is not taxed. A store whose prices
 * exclude VAT adds it to the total; one whose prices include it (`vat_inclusive`) charges the
 * same total and the order records the share that is tax. Amounts are kept to the fils (three
 * decimals), the tax rounded half away from zero as Postgres does.
 *
 * Loyalty points come off after the order is placed (`redeem_loyalty_points_for_order`): they
 * lower the total and leave the tax as it was, which is added on top of what is left only where
 * prices exclude it. Where prices include it the tax is already in the subtotal: adding it again
 * charged a 40.000 order with 3.000 of points 40.636 (bug #43, migration `20261024100000`).
 */

export type TaxRule = {
  /** Percent, as the store wrote it (10 = 10%). 0 when the store charges no tax. */
  rate: number;
  /** Prices already include the tax: it is part of the total, not added to it. */
  inclusive: boolean;
};

export const NO_TAX: TaxRule = { rate: 0, inclusive: false };

/**
 * A store's tax rule from its public settings. A rate the page does not carry is no tax: the
 * column has a value for every store, so a missing one is a page read before it was public.
 */
export function storeTaxRule(settings: {
  default_tax_rate?: number | string | null;
  vat_inclusive?: boolean | null;
}): TaxRule {
  const rate = Number(settings.default_tax_rate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return NO_TAX;
  return { rate, inclusive: Boolean(settings.vat_inclusive) };
}

export type OrderAmounts = {
  /** The lines' total (and a booking's add-ons). */
  subtotal: number;
  /** The promo code's and the booking offer's discount together. */
  discount: number;
  /** The delivery or travel fee. */
  shipping: number;
  /** What the shopper's points take off, applied after the order is placed. */
  loyaltyDiscount?: number;
};

export type OrderTotals = {
  /** What the tax is worked on: the subtotal after discounts, never below zero. */
  taxable: number;
  /** The order's `tax_amount`. */
  tax: number;
  /** The order's `total`, after any points. */
  total: number;
  /** The tax is added to the prices (false: it is part of them). */
  added: boolean;
};

const fils = (amount: number) => Math.round(Math.max(0, Number(amount) || 0) * 1000);
const money = (amountInFils: number) => amountInFils / 1000;

/** n / d rounded half away from zero, for non-negative integers. */
function divideRounded(n: number, d: number): number {
  const q = Math.floor(n / d);
  return 2 * (n - q * d) >= d ? q + 1 : q;
}

/** What the order builder writes: its tax and its total. */
export function orderTotals(amounts: OrderAmounts, rule: TaxRule): OrderTotals {
  const subtotal = fils(amounts.subtotal);
  const discount = fils(amounts.discount);
  const shipping = fils(amounts.shipping);
  const taxable = Math.max(0, subtotal - discount);
  // numeric(5,2): the rate in hundredths of a percent, so the tax is exact before rounding.
  const rate = Math.round(Math.max(0, rule.rate) * 100);
  const tax = rule.inclusive
    ? divideRounded(taxable * rate, 10000 + rate)
    : divideRounded(taxable * rate, 10000);
  let total = rule.inclusive ? taxable + shipping : taxable + tax + shipping;

  const points = Math.min(fils(amounts.loyaltyDiscount ?? 0), taxable);
  if (points > 0) {
    total = Math.max(0, subtotal - (discount + points)) + shipping + (rule.inclusive ? 0 : tax);
  }

  return {
    taxable: money(taxable),
    tax: money(tax),
    total: money(total),
    added: !rule.inclusive,
  };
}

/** A rate as it is written beside the tax: 10 → "10%", 7.5 → "7.5%". */
export function taxRateLabel(rate: number): string {
  return `${Number(rate.toFixed(2))}%`;
}
