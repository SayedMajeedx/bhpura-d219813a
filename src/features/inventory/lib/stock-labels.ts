/** Stock location and barcode labels shared by the variant table, cards and forms. */
export function stockLabels(isAr: boolean) {
  return {
    mainLabel: isAr ? "مخزون المحل" : "Store Stock",
    incLabel: isAr ? "مخزون المحل الشريك" : "Partner shop stock",
    mainTooltip: isAr
      ? "القطع المتوفرة فعلياً داخل متجرك والجاهزة للبيع المباشر والشحن للعملاء."
      : "Physical stock in your primary store, ready for instant sale and shipping.",
    barcodeLabel: isAr ? "الباركود" : "Barcode",
  };
}

/**
 * What a partner's quantity is and where it changes. It is shown beside a variant, never typed
 * there: each partner's count moves with a transfer, a return or a sale on the partners' page,
 * so the total always equals what the partners hold.
 */
export function partnerStockHint(isAr: boolean): string {
  return isAr
    ? "القطع الموجودة عند محلات الشركاء. تتغير من صفحة محلات الشركاء: تحويل، إرجاع أو بيع."
    : "Pieces held at partner incubators. They change on the Incubators page: a transfer, a return or a sale.";
}
