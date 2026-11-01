import { getFriendlyErrorMessage } from "@/lib/utils";
import { arNoun, arNounOblique, countOf } from "@/lib/arabic-count";

/**
 * Removing a product's sizes. A product keeps at least one variant: its price, stock, stock
 * history and order lines live on one, and checkout refuses a product with none. The database
 * refuses deleting a product's last size in use (PRODUCT_NEEDS_A_VARIANT, migrations
 * 20261110100000 and 20261111100000); these rules keep the screens from offering it. A service
 * is left alone: its lengths are one set its editor saves whole.
 *
 * A size with a history (sold, stock moved, on a supplier order) is archived rather than
 * deleted: hidden from the store and the inventory, kept for its records (`removeVariants`).
 */

type KindOf = { item_kind?: string | null } | null | undefined;

/** Whether removing `count` of a product's `total` sizes in use leaves it one. */
export function leavesAVariant(product: KindOf, total: number, count = 1): boolean {
  return product?.item_kind === "service" || total - count >= 1;
}

const WORDS = {
  keepOne: {
    ar: "يبقى لكل منتج خيار واحد على الأقل: عليه سعره ومخزونه وطلباته. عدّل هذا الخيار بدل حذفه، أو احذف المنتج كله.",
    en: "A product keeps at least one variant: it holds its price, stock and orders. Edit this one instead, or delete the whole product.",
  },
  hasStock: {
    ar: "لهذا الخيار قطع في المخزون. سجّلها أولاً (مباعة أو تالفة أو منقولة)، ثم احذفه.",
    en: "This variant still has pieces in stock. Record them first (sold, damaged or moved), then remove it.",
  },
  notAllowed: {
    ar: "تحتاج صلاحية إدارة المخزون لحذف الخيارات.",
    en: "You need the inventory permission to remove variants.",
  },
};

/** What staff read when a removal would leave a product with no size in use. */
export function keepOneVariantMessage(isAr: boolean): string {
  return WORDS.keepOne[isAr ? "ar" : "en"];
}

/** A failed removal in the reader's words: the database's refusals named, anything else as it came. */
export function variantDeleteError(error: unknown, isAr: boolean): string {
  const lang = isAr ? "ar" : "en";
  const text = getFriendlyErrorMessage(error);
  if (text.includes("PRODUCT_NEEDS_A_VARIANT")) return WORDS.keepOne[lang];
  if (text.includes("VARIANT_HAS_STOCK")) return WORDS.hasStock[lang];
  if (text.includes("NOT_AUTHORIZED")) return WORDS.notAllowed[lang];
  return text;
}

/** What a removal did: how many sizes went, and how many were archived for their history. */
export function removedMessage(
  { deleted, archived }: { deleted: number; archived: number },
  isAr: boolean,
): string {
  const gone = isAr
    ? `تم حذف ${arNounOblique(deleted, "variant")}.`
    : `${countOf(deleted, "variant", "en")} deleted.`;
  if (archived === 0) return gone;
  // The count comes last in Arabic, where the words would otherwise have to agree with it.
  const kept = isAr
    ? `ما له سجل من المبيعات أو المخزون أُرشف: أُخفي من المتجر والمخزون وبقي سجله (${arNoun(archived, "variant")}).`
    : `${countOf(archived, "variant", "en")} archived: with a record of sales or stock, hidden from the store and the inventory, the record kept.`;
  return deleted === 0 ? kept : `${gone} ${kept}`;
}
