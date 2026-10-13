import { firstImage, type Product } from "@/features/content-studio/lib/studio-content";

/** How many products a lookbook carries: enough to browse, few enough to read. */
export const LOOKBOOK_MIN = 2;
export const LOOKBOOK_MAX = 5;
/** How many products a lookbook starts with, before the merchant picks. */
export const LOOKBOOK_DEFAULT = 4;

/** How many products a template that shows several takes: at least, at most, and to start with. */
export type CollectionLimits = { min: number; max: number; start: number };

/**
 * The templates that show several products, sharing one pick of them: the
 * Lookbook's carousel, a Menu's rows (a café's drinks, a salon's services)
 * and a Bundle's set of two or three.
 */
export const COLLECTION_LIMITS = {
  "lookbook-carousel": { min: LOOKBOOK_MIN, max: LOOKBOOK_MAX, start: LOOKBOOK_DEFAULT },
  "menu-board": { min: 2, max: 6, start: 5 },
  "bundle-set": { min: 2, max: 3, start: 3 },
} as const satisfies Record<string, CollectionLimits>;

export type CollectionTemplateId = keyof typeof COLLECTION_LIMITS;

export function isCollectionTemplate(id: string): id is CollectionTemplateId {
  return id in COLLECTION_LIMITS;
}

type PricedVariant = {
  product_id: string;
  selling_price: number | null;
  /** A service's length, when the variant is one. */
  duration_minutes?: number | null;
};

/** One product in the lookbook, as the template shows it. */
export type LookbookEntry = {
  id: string;
  name: string;
  /** The price it starts from, or null when it has none. */
  price: number | null;
  /** A service's shortest length in minutes, or null for a product. */
  minutes: number | null;
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
  limits: CollectionLimits = COLLECTION_LIMITS["lookbook-carousel"],
): Product[] {
  if (chosenIds.length > 0) {
    const byId = new Map(products.map((product) => [product.id, product]));
    return chosenIds
      .map((id) => byId.get(id))
      .filter((product): product is Product => Boolean(product))
      .slice(0, limits.max);
  }
  const lead = products.find((product) => product.id === leadId);
  const rest = products.filter((product) => product.id !== lead?.id && firstImage(product));
  return [...(lead ? [lead] : []), ...rest].slice(0, limits.start);
}

/**
 * The picks after tapping `id`: added at the end when there is room, removed
 * when it is already in (never below the minimum). Returns the same list when
 * nothing may change.
 */
export function toggleLookbookPick(
  current: readonly string[],
  id: string,
  limits: CollectionLimits = COLLECTION_LIMITS["lookbook-carousel"],
): readonly string[] {
  // Picks made for a template that takes more (a Lookbook's five, then a Bundle) count as its first ones.
  const shown = current.length > limits.max ? current.slice(0, limits.max) : current;
  if (shown.includes(id)) {
    return shown.length > limits.min ? shown.filter((picked) => picked !== id) : current;
  }
  return shown.length < limits.max ? [...shown, id] : current;
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

/** A service's shortest length in minutes (its variants' durations), or null for a product. */
export function shortestMinutes(
  product: Product,
  variants: readonly PricedVariant[],
): number | null {
  const minutes = variants
    .filter((variant) => variant.product_id === product.id)
    .map((variant) => Number(variant.duration_minutes))
    .filter((value) => Number.isFinite(value) && value > 0);
  return minutes.length > 0 ? Math.min(...minutes) : null;
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
    minutes: shortestMinutes(product, variants),
    imageUrl: firstImage(product),
  }));
}
