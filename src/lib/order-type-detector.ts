/**
 * Order Type Detector
 * Automatically classifies whether an order is:
 * - "ready_stock" (مخزون جاهز)
 * - "tailoring" (تفصيل حسب الطلب)
 * - "mixed" (جاهز وتفصيل معاً)
 */

export type OrderType = "ready_stock" | "tailoring" | "mixed";

export interface OrderItemForTypeDetection {
  product_id?: string | null;
  product_name?: string | null;
  size?: string | null;
  color?: string | null;
  fabric?: string | null;
  custom_fields?: Array<{ label?: string; value?: string; [key: string]: any }> | null;
  custom_field_values?: Array<{ label?: string; value?: string; [key: string]: any }> | null;
  notes?: string | null;
  is_tailoring?: boolean | null;
  item_type?: string | null;
}

export function isTailoringItem(item: OrderItemForTypeDetection): boolean {
  if (item.is_tailoring === true) return true;
  if (item.item_type?.toLowerCase() === "tailoring") return true;

  // Check custom fields or measurements
  const fields = item.custom_fields ?? item.custom_field_values ?? [];
  if (Array.isArray(fields) && fields.length > 0) {
    const hasFilledValue = fields.some(
      (f) => typeof f?.value === "string" && f.value.trim().length > 0,
    );
    if (hasFilledValue) return true;
  }

  // Check size string or notes for tailoring keywords
  const sizeText = (item.size ?? "").toLowerCase();
  const notesText = (item.notes ?? "").toLowerCase();
  const keywords = ["تفصيل", "tailor", "custom", "مخصص", "مقاس خاص", "حسب الطلب", "made-to-order"];

  if (keywords.some((kw) => sizeText.includes(kw) || notesText.includes(kw))) {
    return true;
  }

  return false;
}

export function detectOrderType(
  items: OrderItemForTypeDetection[] | null | undefined,
  explicitOrderType?: string | null,
): OrderType {
  if (explicitOrderType === "tailoring" || explicitOrderType === "ready_stock") {
    return explicitOrderType;
  }

  if (!items || items.length === 0) {
    return "ready_stock";
  }

  let tailoringCount = 0;
  let readyStockCount = 0;

  for (const item of items) {
    if (isTailoringItem(item)) {
      tailoringCount++;
    } else {
      readyStockCount++;
    }
  }

  if (tailoringCount > 0 && readyStockCount > 0) {
    return "mixed";
  }
  if (tailoringCount > 0) {
    return "tailoring";
  }
  return "ready_stock";
}

export function getOrderTypeLabel(type: OrderType, lang: "ar" | "en" = "ar"): string {
  switch (type) {
    case "tailoring":
      return lang === "ar" ? "تفصيل" : "Tailoring";
    case "mixed":
      return lang === "ar" ? "جاهز وتفصيل" : "Mixed";
    case "ready_stock":
    default:
      return lang === "ar" ? "جاهز" : "Ready Stock";
  }
}
