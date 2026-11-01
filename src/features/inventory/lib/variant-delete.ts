import { getFriendlyErrorMessage } from "@/lib/utils";

/**
 * A product keeps at least one variant: its price, stock, stock history and order lines live on
 * one, and checkout refuses a product with none. The database refuses deleting a product's last
 * variant (PRODUCT_NEEDS_A_VARIANT, migration 20261110100000); these rules keep the screens from
 * offering it. A service is left alone: its lengths are one set its editor saves whole.
 */

type KindOf = { item_kind?: string | null } | null | undefined;

/** Whether deleting `count` of a product's `total` variants leaves it one. */
export function leavesAVariant(product: KindOf, total: number, count = 1): boolean {
  return product?.item_kind === "service" || total - count >= 1;
}

const KEEP_ONE = {
  ar: "يبقى لكل منتج خيار واحد على الأقل: عليه سعره ومخزونه وطلباته. عدّل هذا الخيار بدل حذفه، أو احذف المنتج كله.",
  en: "A product keeps at least one variant: it holds its price, stock and orders. Edit this one instead, or delete the whole product.",
};

/** What staff read when a delete would leave a product with no variant. */
export function keepOneVariantMessage(isAr: boolean): string {
  return KEEP_ONE[isAr ? "ar" : "en"];
}

/** A failed delete in the reader's words: the database's refusal named, anything else as it came. */
export function variantDeleteError(error: unknown, isAr: boolean): string {
  const text = getFriendlyErrorMessage(error);
  return text.includes("PRODUCT_NEEDS_A_VARIANT") ? keepOneVariantMessage(isAr) : text;
}
