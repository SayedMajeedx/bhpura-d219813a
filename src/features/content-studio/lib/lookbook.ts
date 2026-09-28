import { firstImage, type Product } from "@/features/content-studio/lib/studio-content";

/** How many products a lookbook carries: enough to browse, few enough to read. */
export const LOOKBOOK_MIN = 2;
export const LOOKBOOK_MAX = 5;
/** How many products a lookbook starts with, before the merchant picks. */
export const LOOKBOOK_DEFAULT = 4;

type PricedVariant = { product_id: string; selling_price: number | null };

/** One product in the lookbook, as the template shows it. */
export type LookbookEntry = {
  id: string;
  name: string;
  /** The price it starts from, or null when it has none. */
  price: number | null;
  imageUrl: string | null;
};

/**
 * The products in the lookbook, in the order chosen. Until the merchant picks,
 * the chosen product leads, followed by the next products that have a photo.
 * Chosen ids that are no longer in the catalogue are skipped.
 */
export function lookbookProducts(
  products: readonly Product[],
  chosenIds: readonly string[],
  leadId: string | null | undefined,
): Product[] {
  if (chosenIds.length > 0) {
    const byId = new Map(products.map((product) => [product.id, product]));
    return chosenIds
      .map((id) => byId.get(id))
      .filter((product): product is Product => Boolean(product))
      .slice(0, LOOKBOOK_MAX);
  }
  const lead = products.find((product) => product.id === leadId);
  const rest = products.filter((product) => product.id !== lead?.id && firstImage(product));
  return [...(lead ? [lead] : []), ...rest].slice(0, LOOKBOOK_DEFAULT);
}

/**
 * The picks after tapping `id`: added at the end when there is room, removed
 * when it is already in (never below the minimum). Returns the same list when
 * nothing may change.
 */
export function toggleLookbookPick(current: readonly string[], id: string): readonly string[] {
  if (current.includes(id)) {
    return current.length > LOOKBOOK_MIN ? current.filter((picked) => picked !== id) : current;
  }
  return current.length < LOOKBOOK_MAX ? [...current, id] : current;
}

/**
 * The price a product starts from: its cheapest variant's selling price, or
 * its base price when no variant has one.
 */
export function fromPrice(product: Product, variants: readonly PricedVariant[]): number | null {
  const prices = variants
    .filter((variant) => variant.product_id === product.id)
    .map((variant) => Number(variant.selling_price))
    .filter((price) => Number.isFinite(price) && price > 0);
  if (prices.length > 0) return Math.min(...prices);
  const base = Number(product.base_price);
  return Number.isFinite(base) && base > 0 ? base : null;
}

/** The lookbook's products, named in `lang`, with their price and photo. */
export function lookbookEntries(
  products: readonly Product[],
  variants: readonly PricedVariant[],
  lang: "ar" | "en",
): LookbookEntry[] {
  return products.map((product) => ({
    id: product.id,
    name:
      (lang === "ar" ? product.name_ar || product.name : product.name_en || product.name) ||
      product.name,
    price: fromPrice(product, variants),
    imageUrl: firstImage(product),
  }));
}
