import type { SettingsFieldDef } from "@/features/settings/registry";

/**
 * The busy pause, set and lifted from the dashboard (`StoreStatusCard`): while it is in the
 * future the store takes no new storefront order or booking (migration 20261027110000).
 */
export const STORE_STATUS_SETTINGS: SettingsFieldDef[] = [
  {
    key: "orders_paused_until",
    table: "business_settings",
    tab: null,
    group: null,
    level: "advanced",
    owner: "route:dashboard",
    type: "text",
    label: { ar: "إيقاف الطلبات مؤقتًا", en: "Pause new orders" },
    keywords: {
      ar: ["مشغول", "إيقاف الطلبات", "إغلاق مؤقت"],
      en: ["busy", "pause orders", "temporary closure"],
    },
  },
];
