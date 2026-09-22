/**
 * Phrases that mark an order line as made-to-order when no explicit flag or
 * location is set (legacy orders, imports, free-text notes). Owned by the
 * made-to-order add-on subsystem so the core order-type detector stays
 * vertical-agnostic; extend here when a vertical adds its own vocabulary.
 */
export const MADE_TO_ORDER_KEYWORDS: readonly string[] = [
  "تفصيل",
  "بدون مخزون",
  "tailor",
  "custom",
  "مخصص",
  "مقاس خاص",
  "حسب الطلب",
  "made-to-order",
];
