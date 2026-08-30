export const DEFAULT_LOW_STOCK_UNITS = 5;

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
