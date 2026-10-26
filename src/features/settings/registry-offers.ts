import type { SettingsFieldDef } from "@/features/settings/registry";

/**
 * Settings the Discounts page owns. How an automatic offer meets a promo code the shopper typed
 * is chosen beside the offers themselves (`StoreOffersSection`); the order builder and the
 * checkout's preview read it (`store_offers_outcome`). Kept apart so the registry file does not
 * grow.
 */
export const OFFERS_SETTINGS: SettingsFieldDef[] = [
  {
    key: "offers_combine",
    table: "business_settings",
    tab: null,
    group: null,
    level: "advanced",
    owner: "route:discounts",
    type: "select",
    label: { ar: "الرمز والعرض التلقائي", en: "Promo codes and automatic offers" },
    keywords: {
      ar: ["عرض", "عروض تلقائية", "رمز خصم", "توصيل مجاني"],
      en: ["offer", "automatic offers", "promo code", "free delivery"],
    },
  },
];
