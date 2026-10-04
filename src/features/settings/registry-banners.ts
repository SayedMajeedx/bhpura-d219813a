import type { SettingsFieldDef } from "@/features/settings/registry";

/**
 * The storefront's banners (the picture-and-title bands above a home page section and above a
 * category's products): their pictures, their parallax and their size. Kept apart so the registry
 * file does not grow; SETTINGS_REGISTRY spreads it in at the same place, so the order is unchanged.
 */
export const BANNER_SETTINGS: SettingsFieldDef[] = [
  {
    key: "category_banner_background_url",
    table: "business_settings",
    tab: "storefront",
    group: "home_sections",
    level: "advanced",
    owner: "settings",
    type: "image",
    label: { ar: "صورة خلفية بنر التصنيفات", en: "Category Banner Background Image" },
    keywords: { ar: ["بنر تصنيفات"], en: ["category banner"] },
  },
  {
    key: "secondary_banner_parallax_enabled",
    table: "business_settings",
    tab: "storefront",
    group: "home_sections",
    level: "advanced",
    owner: "settings",
    type: "boolean",
    label: { ar: "تفعيل تأثير البارالاكس للبنر الثانوي", en: "Enable Secondary Banner Parallax" },
    keywords: { ar: ["بارالاكس", "تأثير حركة"], en: ["parallax effect", "banner parallax"] },
  },
  {
    key: "secondary_banner_parallax_mobile_enabled",
    table: "business_settings",
    tab: "storefront",
    group: "home_sections",
    level: "advanced",
    owner: "settings",
    type: "boolean",
    label: { ar: "تفعيل بارالاكس البنر على الجوال", en: "Enable Parallax on Mobile" },
    keywords: { ar: ["بارالاكس جوال"], en: ["parallax mobile"] },
  },
  {
    key: "secondary_banner_parallax_breakpoint",
    table: "business_settings",
    tab: "storefront",
    group: "home_sections",
    level: "advanced",
    owner: "settings",
    type: "number",
    label: { ar: "نقطة توقف شاشة البارالاكس (px)", en: "Parallax Screen Breakpoint" },
    keywords: { ar: ["شاشة", "نقطة توقف"], en: ["breakpoint", "screen width"] },
  },
  {
    key: "storefront_banner_size",
    table: "business_settings",
    tab: "storefront",
    group: "home_sections",
    level: "advanced",
    owner: "settings",
    type: "select",
    label: { ar: "حجم اللافتات", en: "Banner Size" },
    keywords: {
      ar: ["حجم اللافتة", "حجم البنر", "لافتة مضغوطة", "ارتفاع البنر"],
      en: ["banner size", "banner height", "compact banner", "section banner"],
    },
  },
];
