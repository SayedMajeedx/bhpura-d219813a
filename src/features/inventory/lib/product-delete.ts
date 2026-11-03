import { getFriendlyErrorMessage } from "@/lib/utils";
import { arNoun, arNounOblique, countOf } from "@/lib/arabic-count";

/**
 * Removing products from the inventory (`removeProducts`, migration 20261112100000). A product
 * with a history (sold, stock moved, on a supplier order, booked, returned) is archived rather than
 * deleted: hidden from the store and the inventory, kept for its records, and restored from the
 * archived list. A product that still holds pieces is refused until they are recorded.
 */

const WORDS = {
  hasStock: {
    ar: "لهذا المنتج قطع في المخزون. سجّلها أولاً (مباعة أو تالفة أو منقولة)، ثم احذفه.",
    en: "This product still has pieces in stock. Record them first (sold, damaged or moved), then remove it.",
  },
  hasHistory: {
    ar: "لهذا المنتج سجل من المبيعات أو المخزون، فلا يُحذف مباشرة. احذفه من قائمة المنتجات ليُؤرشف ويبقى سجله.",
    en: "This product has a record of sales or stock, so it cannot be deleted directly. Remove it from the product list to archive it and keep its record.",
  },
  notAllowed: {
    ar: "تحتاج صلاحية إدارة المخزون لحذف المنتجات.",
    en: "You need the inventory permission to remove products.",
  },
  failed: {
    ar: "تعذر حذف المنتجات.",
    en: "The products could not be removed.",
  },
};

/** A failed removal in the reader's words: the database's refusals named, anything else as it came. */
export function productDeleteError(error: unknown, isAr: boolean): string {
  const lang = isAr ? "ar" : "en";
  const text = getFriendlyErrorMessage(error);
  if (text.includes("PRODUCT_HAS_STOCK")) return WORDS.hasStock[lang];
  if (text.includes("PRODUCT_HAS_HISTORY")) return WORDS.hasHistory[lang];
  if (text.includes("NOT_AUTHORIZED")) return WORDS.notAllowed[lang];
  return text || WORDS.failed[lang];
}

/** What a removal did: how many products went, and how many were archived for their history. */
export function removedProductsMessage(
  { deleted, archived }: { deleted: number; archived: number },
  isAr: boolean,
): string {
  const gone = isAr
    ? `تم حذف ${arNounOblique(deleted, "product")}.`
    : `${countOf(deleted, "product", "en")} deleted.`;
  if (archived === 0) return gone;
  // The count comes last in Arabic, where the words would otherwise have to agree with it.
  const kept = isAr
    ? `ما له سجل من المبيعات أو المخزون أُرشف: أُخفي من المتجر والمخزون وبقي سجله، ويمكن استعادته من المنتجات المؤرشفة (${arNoun(archived, "product")}).`
    : `${countOf(archived, "product", "en")} archived: with a record of sales or stock, hidden from the store and the inventory, the record kept. Restore it from archived products.`;
  return deleted === 0 ? kept : `${gone} ${kept}`;
}

/** The confirmation's words, saying what happens to a product with history. */
export function removeProductsWarning(count: number, isAr: boolean): string {
  return isAr
    ? "يُحذف المنتج ومقاساته نهائياً. أما المنتج الذي له مبيعات أو حركة مخزون فيُؤرشف بدلاً من حذفه: يُخفى ويبقى سجله، ويمكنك استعادته."
    : count === 1
      ? "The product and its sizes are deleted for good. A product with sales or stock moves is archived instead: hidden, its record kept, and you can restore it."
      : "The products and their sizes are deleted for good. A product with sales or stock moves is archived instead: hidden, its record kept, and you can restore it.";
}
