/**
 * What the super admin reads when deleting a store fails: in words, saying that nothing was
 * deleted (the purge is one transaction), with the database's reason kept for support. The dialog
 * once showed the bare code ("VARIANT_HAS_HISTORY", 2026-11-22).
 */
const REASONS: Array<{ match: RegExp; ar: string; en: string }> = [
  {
    match: /VARIANT_HAS_HISTORY|PRODUCT_HAS_HISTORY/,
    ar: "منتج له سجل (طلبات أو حركة مخزون) منع الحذف",
    en: "a product with a history (orders or stock moves) stopped it",
  },
  {
    match: /ORDER_LINE_HAS_ALTERATION/,
    ar: "سطر طلب عليه تعديل منع الحذف",
    en: "an order line with an alteration stopped it",
  },
  {
    match: /foreign key/i,
    ar: "بيانات مرتبطة ببعضها منعت الحذف",
    en: "linked records stopped it",
  },
  {
    match: /Only a super admin/i,
    ar: "الحذف للمدير الأعلى فقط",
    en: "only a super admin can delete a store",
  },
];

export function brandDeleteFailure(message: string, isAr: boolean): string {
  const reason = REASONS.find((r) => r.match.test(message));
  const why = reason ? (isAr ? reason.ar : reason.en) : null;
  if (isAr) {
    return why
      ? `تعذّر حذف المتجر: ${why}. لم يُحذف شيء. (${message})`
      : `تعذّر حذف المتجر، ولم يُحذف شيء. (${message})`;
  }
  return why
    ? `The store could not be deleted: ${why}. Nothing was deleted. (${message})`
    : `The store could not be deleted, and nothing was deleted. (${message})`;
}
