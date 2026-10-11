import type { SettingsFieldDef } from "@/features/settings/registry";

/**
 * Settings the inventory page owns. The low-stock level is set where its effect is seen (the
 * stock summary above the product list), not in the settings screen; the dashboard, the export,
 * the products report and the phone alert read the same number. Kept apart so the registry file
 * does not grow.
 */
export const INVENTORY_SETTINGS: SettingsFieldDef[] = [
  {
    key: "low_stock_threshold",
    table: "business_settings",
    tab: null,
    group: null,
    level: "advanced",
    owner: "route:inventory",
    type: "number",
    label: { ar: "حد تنبيه المخزون المنخفض", en: "Low Stock Warning Level" },
    keywords: {
      ar: ["مخزون منخفض", "حد المخزون", "تنبيه المخزون"],
      en: ["low stock", "stock level", "reorder"],
    },
    readOnlyMirrors: [
      "admin.b.$slug.dashboard.tsx",
      "admin.b.$slug.export.tsx",
      "admin.b.$slug.reports.products.tsx",
    ],
  },
];
