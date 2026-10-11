export const DEFAULT_LOW_STOCK_UNITS = 5;
/** The most pieces a store may call "low": above this the word means nothing. */
export const MAX_LOW_STOCK_UNITS = 1000;

/**
 * The store's own low-stock level (`business_settings.low_stock_threshold`): a product sold
 * from stock is "low" at this many pieces or fewer. A boutique with one piece per size and a
 * roastery with a shelf of bags do not mean the same number. Anything that is not a whole
 * number from 0 to 1000 falls back to 5; 0 turns the warning off (only "out" is left).
 */
export function lowStockLevel(value: unknown): number {
  const level = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isInteger(level)) {
    return DEFAULT_LOW_STOCK_UNITS;
  }
  return level < 0 || level > MAX_LOW_STOCK_UNITS ? DEFAULT_LOW_STOCK_UNITS : level;
}

/** One shared definition for inventory health across every admin surface. */
export function isOutOfStock(totalStock: number) {
  return Number(totalStock || 0) <= 0;
}

export function isLowStock(
  totalStock: number,
  expectedWeeklySales = 0,
  lowStockUnits = DEFAULT_LOW_STOCK_UNITS,
) {
  const stock = Number(totalStock || 0);
  const weeklySales = Math.max(0, Number(expectedWeeklySales || 0));
  return stock > 0 && (stock <= lowStockUnits || (weeklySales > 0 && stock < weeklySales));
}
