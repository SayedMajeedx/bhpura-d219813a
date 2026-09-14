import type { AddonManifest } from "@/lib/addons/addon-types";

export const giftsManifest: AddonManifest = {
  id: "gifts",
  version: 1,
  kind: "pack",
  name: { ar: "حزمة الهدايا والحرف", en: "Gifts & Crafts Pack" },
  description: {
    ar: "خيارات تغليف الهدايا، بطاقات الإهداء، والمفردات المخصصة للبوتيكات",
    en: "Gift wrapping options, message cards, and personalized boutique settings",
  },
  whatItAdds: [
    { ar: "قوالب حقول رسالة وبطاقة الإهداء", en: "Gift message and greeting card fields" },
    { ar: "خيارات تغليف الهدايا المخصصة", en: "Gift wrapping customization options" },
    {
      ar: "سياق الذكاء الاصطناعي للمناسبات والهدايا التذكارية",
      en: "AI context for celebratory gifts",
    },
  ],
  icon: "Gift",
  activities: ["gifts"],
  contributions: {
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" يقدم هدايا مميزة وتغليفاً راقياً لمختلف المناسبات.`
        : `Store "${brandName}" creates curated gifts and premium packaging.`,
  },
};
