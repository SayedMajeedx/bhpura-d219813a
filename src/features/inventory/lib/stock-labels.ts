/** Stock location and barcode labels shared by the variant table, cards and forms. */
export function stockLabels(isAr: boolean) {
  return {
    mainLabel: isAr ? "مخزون المحل" : "Store Stock",
    incLabel: isAr ? "مخزون الحاضنة" : "Incubator Stock",
    mainTooltip: isAr
      ? "القطع المتوفرة فعلياً داخل متجرك والجاهزة للبيع المباشر والشحن للعملاء."
      : "Physical stock in your primary store, ready for instant sale and shipping.",
    incTooltip: isAr
      ? "القطع المعروضة في محلات خارجية أو حاضنات تجارية شريكة."
      : "Items held at partner boutiques or business incubators.",
    barcodeLabel: isAr ? "الباركود" : "Barcode",
  };
}
