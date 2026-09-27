type PricedVariant = {
  selling_price: number | null;
  original_price: number | null;
};

export type Sale = {
  /** The price before the sale. */
  original: number;
  /** The sale price. */
  price: number;
  /** The saving as a whole percentage (at least 1). */
  percent: number;
};

function saleOf(variant: PricedVariant): Sale | null {
  const original = Number(variant.original_price);
  const price = Number(variant.selling_price);
  if (!Number.isFinite(original) || !Number.isFinite(price) || price <= 0 || original <= price) {
    return null;
  }
  return {
    original,
    price,
    percent: Math.max(1, Math.round(((original - price) / original) * 100)),
  };
}

/**
 * The sale to show for the chosen product: the chosen variant's own, or,
 * with no variant chosen, the sale every variant shares (a product whose
 * variants are discounted differently has no single sale to show).
 */
export function studioSale(
  variants: readonly PricedVariant[],
  activeVariant: PricedVariant | null,
): Sale | null {
  if (activeVariant) return saleOf(activeVariant);
  if (variants.length === 0) return null;
  const sales = variants.map(saleOf);
  const [first] = sales;
  if (!first) return null;
  const shared = sales.every(
    (sale) => sale && sale.price === first.price && sale.original === first.original,
  );
  return shared ? first : null;
}
