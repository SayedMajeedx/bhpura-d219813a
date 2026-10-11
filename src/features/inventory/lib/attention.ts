import { productAvailability, type AvailabilityProduct } from "@/lib/product-availability";

/**
 * What is wrong with a product, as the inventory list says it: one rule for the "Needs attention"
 * tab, its count, the marks on a row (desktop and phone) and the issue filter. They were three
 * readings before: the tab counted low, out and no photo while the rows also marked no category
 * and hidden with stock, so the tab said 3 and nine rows carried a mark.
 */

export type AttentionKey =
  | "out_of_stock"
  | "low_stock"
  | "missing_image"
  | "missing_price"
  | "missing_category"
  | "hidden_with_stock";

export type AttentionReason = {
  key: AttentionKey;
  label_ar: string;
  label_en: string;
  tone: "danger" | "warning" | "info";
};

const REASONS: Record<AttentionKey, Omit<AttentionReason, "key">> = {
  out_of_stock: { label_ar: "نفاد المخزون", label_en: "Out of Stock", tone: "danger" },
  low_stock: { label_ar: "مخزون منخفض", label_en: "Low Stock", tone: "warning" },
  missing_image: { label_ar: "نقص الصور", label_en: "No Image", tone: "warning" },
  missing_price: { label_ar: "بدون سعر", label_en: "No Price", tone: "warning" },
  missing_category: { label_ar: "بدون تصنيف", label_en: "No Category", tone: "info" },
  hidden_with_stock: { label_ar: "مخفي ولديه مخزون", label_en: "Hidden with Stock", tone: "info" },
};

/** Every issue, in the order a row shows them: the choices of the issue filter. */
export const ATTENTION_KEYS = Object.keys(REASONS) as AttentionKey[];

export function attentionReason(key: AttentionKey): AttentionReason {
  return { key, ...REASONS[key] };
}

export function isAttentionKey(value: unknown): value is AttentionKey {
  return typeof value === "string" && value in REASONS;
}

export type AttentionProduct = AvailabilityProduct & {
  image_url?: string | null;
  media?: unknown;
  category?: string | null;
  is_active?: boolean | null;
};

/** A main picture, or one usable entry in the gallery. */
export function hasPicture(product: Pick<AttentionProduct, "image_url" | "media">): boolean {
  const media: unknown[] = Array.isArray(product.media) ? product.media : [];
  return Boolean(
    product.image_url ||
    media.some((entry) => {
      if (typeof entry === "string") return Boolean(entry.trim());
      const item = entry as { url?: string; src?: string } | null;
      return Boolean(item?.url || item?.src);
    }),
  );
}

export type AttentionFacts = {
  /** Ready pieces across the product's variants (the store's and its partners'). */
  stock: number;
  /** Expected weekly sales: sharpens "low" (stock that will not last the week). */
  weeklySales?: number;
  /** The store's own low-stock level; the default when left out. */
  lowStockUnits?: number;
  /** The lowest price a shopper can pay for it; left out when it is not known. */
  lowestPrice?: number | null;
  /** False for a catalog that shows no prices: a product with no price is then as meant. */
  pricesMatter?: boolean;
};

/**
 * The product's issues. Stock issues follow the one availability rule, so a made-to-order piece
 * or a service is never out or low; "hidden with stock" is ready stock nobody can buy.
 */
export function productAttentionReasons(
  product: AttentionProduct,
  { stock, weeklySales = 0, lowStockUnits, lowestPrice, pricesMatter = true }: AttentionFacts,
): AttentionReason[] {
  const keys: AttentionKey[] = [];
  const status = productAvailability(product, stock, weeklySales, lowStockUnits).status;
  if (status === "out") keys.push("out_of_stock");
  else if (status === "low") keys.push("low_stock");
  if (!hasPicture(product)) keys.push("missing_image");
  if (pricesMatter && lowestPrice !== undefined && lowestPrice !== null && !(lowestPrice > 0)) {
    keys.push("missing_price");
  }
  if (!product.category?.trim()) keys.push("missing_category");
  if (!product.is_active && Number(stock || 0) > 0) keys.push("hidden_with_stock");
  return keys.map(attentionReason);
}
