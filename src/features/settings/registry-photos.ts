import type { SettingsFieldDef } from "@/features/settings/registry";

/**
 * The shape of a product's photos: on the storefront's cards (`product_card_aspect_ratio`; empty,
 * the store vertical's shape: `productCardRatio`) and in the product page's gallery
 * (`pdp_gallery_aspect_ratio`). Kept apart so the registry file does not grow;
 * SETTINGS_REGISTRY spreads it in at the same place, so the order is unchanged.
 */
export const PHOTO_SHAPE_SETTINGS: SettingsFieldDef[] = [
  {
    key: "product_card_aspect_ratio",
    table: "business_settings",
    tab: "storefront",
    group: "design_v2",
    level: "advanced",
    owner: "settings",
    type: "select",
    label: { ar: "شكل صور المنتجات في البطاقات", en: "Product photo shape on cards" },
    keywords: {
      ar: ["شكل الصور", "صور المنتجات", "مربع", "طولي", "عرضي", "قص الصور"],
      en: ["photo shape", "product photo", "square", "portrait", "landscape", "cropped"],
    },
  },
  {
    key: "pdp_gallery_aspect_ratio",
    table: "business_settings",
    tab: "storefront",
    group: "design_v2",
    level: "advanced",
    owner: "settings",
    type: "select",
    label: { ar: "تناسب صور معرض المنتج", en: "Product Gallery Aspect Ratio" },
    keywords: {
      ar: ["تناسب صور المنتج", "معرض الصور", "مربع", "طولي"],
      en: ["pdp gallery aspect ratio", "product image ratio", "portrait", "square"],
    },
  },
];
