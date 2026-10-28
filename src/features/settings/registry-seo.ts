import type { SettingsFieldDef } from "@/features/settings/registry";

/**
 * The SEO group's settings: the home page's title and description in each language, and Google
 * Search Console's verification code. Kept apart so the registry file does not grow.
 */
export const SEO_SETTINGS: SettingsFieldDef[] = [
  {
    key: "meta_title",
    table: "brands",
    tab: "storefront",
    group: "seo",
    level: "advanced",
    owner: "settings",
    type: "text",
    label: { ar: "عنوان المتجر في محركات البحث", en: "SEO Meta Title" },
    keywords: { ar: ["سيو", "عنوان البحث", "قوقل"], en: ["seo", "meta title", "google title"] },
  },
  {
    key: "meta_description",
    table: "brands",
    tab: "storefront",
    group: "seo",
    level: "advanced",
    owner: "settings",
    type: "textarea",
    label: { ar: "وصف المتجر في محركات البحث", en: "SEO Meta Description" },
    keywords: {
      ar: ["وصف البحث", "سيو", "قوقل"],
      en: ["seo", "meta description", "google snippet"],
    },
  },
  {
    key: "meta_title_en",
    table: "brands",
    tab: "storefront",
    group: "seo",
    level: "advanced",
    owner: "settings",
    type: "text",
    label: { ar: "عنوان المتجر بالإنجليزية في محركات البحث", en: "SEO Meta Title (English)" },
    keywords: { ar: ["سيو", "عنوان إنجليزي"], en: ["seo", "english title", "google title"] },
  },
  {
    key: "meta_description_en",
    table: "brands",
    tab: "storefront",
    group: "seo",
    level: "advanced",
    owner: "settings",
    type: "textarea",
    label: { ar: "وصف المتجر بالإنجليزية في محركات البحث", en: "SEO Meta Description (English)" },
    keywords: { ar: ["سيو", "وصف إنجليزي"], en: ["seo", "english description", "snippet"] },
  },
  {
    key: "google_site_verification",
    table: "brands",
    tab: "storefront",
    group: "seo",
    level: "advanced",
    owner: "settings",
    type: "text",
    label: { ar: "رمز التحقق من Google Search Console", en: "Google Search Console verification" },
    keywords: {
      ar: ["سيو", "قوقل", "سيرش كونسول", "التحقق"],
      en: ["seo", "search console", "verify", "google"],
    },
  },
];
