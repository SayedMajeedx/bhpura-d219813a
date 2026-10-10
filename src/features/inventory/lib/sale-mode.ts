/**
 * Pure rules for "how is this piece sold?" in the product editor: the two ways a product is
 * sold, and how one line of a made-to-order product's record reads.
 */

export type SaleMode = "stock" | "made_to_order";

export function saleModeOf(form: { is_made_to_order?: boolean | null }): SaleMode {
  return form.is_made_to_order ? "made_to_order" : "stock";
}

export const SALE_MODES: ReadonlyArray<{
  mode: SaleMode;
  title: { ar: string; en: string };
  hint: { ar: string; en: string };
}> = [
  {
    mode: "stock",
    title: { ar: "من المخزون الجاهز", en: "From ready stock" },
    hint: {
      ar: "تُباع القطع الموجودة فقط، ويتوقف البيع عند انتهاء المخزون.",
      en: "Only pieces in stock are sold; selling stops when stock runs out.",
    },
  },
  {
    mode: "made_to_order",
    title: { ar: "حسب الطلب", en: "Made to order" },
    hint: {
      ar: "تُصنع عند الطلب ولا تحتاج مخزوناً. أضف مقاسات جاهزة في جدول الخيارات لبيع الجاهز أيضاً.",
      en: "Made when ordered, with no stock needed. Add ready sizes in the options table to sell ready pieces too.",
    },
  },
];

export type MadeToOrderMovement = {
  reason: string;
  available_before: number | null;
  available_after: number | null;
  /** The order's invoice number, for a piece an order took or gave back. */
  invoiceNumber?: number | string | null;
};

const count = (value: number | null, lang: "ar" | "en") =>
  value === null ? (lang === "ar" ? "بلا حد" : "no limit") : String(value);

/** One line of the record: what happened and what the number became. */
export function madeToOrderMovementLine(movement: MadeToOrderMovement, lang: "ar" | "en"): string {
  const isAr = lang === "ar";
  const order = movement.invoiceNumber
    ? isAr
      ? ` (طلب #${movement.invoiceNumber})`
      : ` (order #${movement.invoiceNumber})`
    : "";
  const after = count(movement.available_after, lang);
  switch (movement.reason) {
    case "order_reserve":
      return isAr
        ? `طلب أخذ قطعة${order}: الباقي ${after}`
        : `An order took a piece${order}: ${after} left`;
    case "order_release":
      return isAr
        ? `طلب ملغى أعاد قطعة${order}: الباقي ${after}`
        : `A cancelled order gave a piece back${order}: ${after} left`;
    case "paused":
      return isAr ? "أُوقف مؤقتاً" : "Paused";
    case "resumed":
      return isAr ? "استُؤنف" : "Resumed";
    default:
      return isAr
        ? `حُدّد العدد: من ${count(movement.available_before, lang)} إلى ${after}`
        : `Limit set: from ${count(movement.available_before, lang)} to ${after}`;
  }
}
