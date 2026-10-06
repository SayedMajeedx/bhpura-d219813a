import type { SettingsFieldDef } from "@/features/settings/registry";

/**
 * What the storefront says about delivery time: one estimate for ready pieces and one for pieces
 * made to order (src/lib/delivery-estimate.ts decides which the shopper sees). Kept apart so the
 * registry file does not grow; SETTINGS_REGISTRY spreads it in where the estimate fields were.
 */
export const DELIVERY_ESTIMATE_SETTINGS: SettingsFieldDef[] = [
  {
    key: "delivery_estimate_ar",
    table: "business_settings",
    tab: "orders",
    group: "fulfillment",
    level: "advanced",
    owner: "settings",
    type: "text",
    label: { ar: "مدة التوصيل المتوقعة (عربي)", en: "Estimated Delivery Text (Arabic)" },
    keywords: { ar: ["مدة التوصيل عربي"], en: ["delivery estimate ar"] },
  },
  {
    key: "delivery_estimate_en",
    table: "business_settings",
    tab: "orders",
    group: "fulfillment",
    level: "advanced",
    owner: "settings",
    type: "text",
    label: { ar: "مدة التوصيل المتوقعة (إنجليزي)", en: "Estimated Delivery Text (English)" },
    keywords: { ar: ["مدة التوصيل إنجليزي"], en: ["delivery estimate en"] },
  },
  {
    key: "delivery_estimate_tailored_ar",
    table: "business_settings",
    tab: "orders",
    group: "fulfillment",
    level: "advanced",
    owner: "settings",
    type: "text",
    label: { ar: "مدة توصيل التفصيل (عربي)", en: "Made-to-order Delivery Text (Arabic)" },
    keywords: { ar: ["مدة التفصيل", "توصيل التفصيل"], en: ["tailored delivery estimate ar"] },
  },
  {
    key: "delivery_estimate_tailored_en",
    table: "business_settings",
    tab: "orders",
    group: "fulfillment",
    level: "advanced",
    owner: "settings",
    type: "text",
    label: { ar: "مدة توصيل التفصيل (إنجليزي)", en: "Made-to-order Delivery Text (English)" },
    keywords: { ar: ["مدة التفصيل إنجليزي"], en: ["tailored delivery estimate en"] },
  },
];
