import { offeredPiecePrice } from "@/lib/offer-price";
import type { StoreOffer } from "@/lib/offers";
import { buyableVariants, sellingPrice, type PricedProduct } from "@/lib/product-price";

type PricedVariant = {
  selling_price?: number | null;
  original_price?: number | null;
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

/** The product as the store's price rules read it. */
export type OfferedProductLike = PricedProduct & { id: string; category?: string | null };

/**
 * The sale to show for a product once the store's live automatic offers are counted, as the
 * storefront's own price rule reads them (`offeredPiecePrice`: the offer that saves most, applied
 * to the chosen variant, or to the cheapest one a shopper can buy when none is chosen), and when
 * that offer ends (`ends_at`, null with no end). With no offer reaching it, the product's own sale.
 */
export function studioOfferedSale(
  product: OfferedProductLike | null | undefined,
  variants: ReadonlyArray<PricedVariant & { id?: string }>,
  activeVariant: (PricedVariant & { id?: string }) | null,
  offers: readonly StoreOffer[],
): { sale: Sale | null; endsAt: string | null; offer: StoreOffer | null } {
  const own = { sale: studioSale(variants, activeVariant), endsAt: null, offer: null };
  if (!product || offers.length === 0) return own;
  const candidates = activeVariant
    ? [activeVariant]
    : buyableVariants(product, variants).filter((variant) => sellingPrice(variant, product) > 0);
  const pieces = candidates
    .map((variant) => offeredPiecePrice(offers, product, variant))
    .filter((piece) => piece.offer && piece.was != null && piece.was > piece.price);
  if (pieces.length === 0) return own;
  const best = pieces.reduce((lowest, piece) => (piece.price < lowest.price ? piece : lowest));
  const was = best.was as number;
  return {
    sale: {
      original: was,
      price: best.price,
      percent: Math.max(1, Math.round(((was - best.price) / was) * 100)),
    },
    endsAt: best.offer?.ends_at ?? null,
    offer: best.offer,
  };
}
