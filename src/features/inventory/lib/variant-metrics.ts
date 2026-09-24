/**
 * Pricing and stock signals shown on every variant row (desktop table and
 * mobile card). Pure: the components decide the wording and colours.
 */

/** Gross margin as a percentage of the selling price (0 when there is no price). */
export function marginPercent(sellingPrice: number, costPrice: number): number {
  return sellingPrice > 0 ? ((sellingPrice - costPrice) / sellingPrice) * 100 : 0;
}

export type MarginBand = "low" | "medium" | "healthy";

/** Under 20% is low, under 50% medium, otherwise healthy. */
export function marginBand(margin: number): MarginBand {
  if (margin < 20) return "low";
  if (margin < 50) return "medium";
  return "healthy";
}

/** The sale-price input shows the current sale price, or stays empty when there is no sale. */
export function saleInputValue(variant: {
  original_price: number | null;
  selling_price: number;
}): string {
  return Number(variant.original_price || 0) > Number(variant.selling_price || 0)
    ? String(variant.selling_price)
    : "";
}

export type SalePriceDecision =
  | { kind: "clear"; sellingPrice: number }
  | { kind: "invalid" }
  | { kind: "sale"; sellingPrice: number };

/**
 * What to do with a typed sale price. Empty, zero or equal to the regular
 * price removes the sale; above the regular price (or not a number) is
 * rejected; anything else becomes the new selling price.
 */
export function decideSalePrice(rawValue: string, regularPrice: number): SalePriceDecision {
  const salePrice = rawValue === "" ? 0 : Number(rawValue);
  if (rawValue === "" || salePrice === 0 || salePrice === regularPrice) {
    return { kind: "clear", sellingPrice: regularPrice };
  }
  if (!Number.isFinite(salePrice) || salePrice < 0 || salePrice > regularPrice) {
    return { kind: "invalid" };
  }
  return { kind: "sale", sellingPrice: salePrice };
}

export type StockRunRate =
  { kind: "out" } | { kind: "no-sales" } | { kind: "days-left"; days: number };

const DAY_MS = 1000 * 60 * 60 * 24;
/** Sales are averaged over the variant's age, capped at this many days. */
const VELOCITY_WINDOW_DAYS = 45;

/** How long the current stock lasts at the recent daily sales rate. */
export function stockRunRate({
  stockMain,
  stockIncubator,
  qtySold,
  createdAt,
  now = new Date(),
}: {
  stockMain: number | null | undefined;
  stockIncubator: number | null | undefined;
  qtySold: number;
  createdAt: string | null | undefined;
  now?: Date;
}): StockRunRate {
  const stock = (stockMain ?? 0) + (stockIncubator ?? 0);
  if (stock <= 0) return { kind: "out" };

  const created = createdAt ? new Date(createdAt) : null;
  const daysElapsed = created
    ? Math.max(
        1,
        Math.min(VELOCITY_WINDOW_DAYS, Math.ceil((now.getTime() - created.getTime()) / DAY_MS)),
      )
    : VELOCITY_WINDOW_DAYS;
  const dailyVelocity = qtySold / daysElapsed;
  if (dailyVelocity > 0) return { kind: "days-left", days: Math.ceil(stock / dailyVelocity) };
  return { kind: "no-sales" };
}
