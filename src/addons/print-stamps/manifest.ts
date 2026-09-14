import type { AddonManifest } from "@/lib/addons/addon-types";

export const printStampsManifest: AddonManifest = {
  id: "print-stamps",
  version: 1,
  kind: "pack",
  name: { ar: "حزمة الطباعة والأختام", en: "Print & Stamps Pack" },
  description: {
    ar: "إعدادات وتصنيفات ومفردات المطابع والمنتجات المطبوعة حسب الطلب",
    en: "Printing press settings, customization presets, and bespoke print workflow",
  },
  whatItAdds: [
    {
      ar: "قوالب حقول الطباعة والتخصيص المخصصة",
      en: "Print customization and text engraving fields",
    },
    {
      ar: "مفردات المطبعة ومراحل الطباعة والتجهيز",
      en: "Printing press and production stage vocabulary",
    },
    {
      ar: "سياق الذكاء الاصطناعي للمطبوعات واللوحات والأختام",
      en: "AI context for stationery and custom print",
    },
  ],
  icon: "Printer",
  activities: ["print"],
  requires: ["made-to-order"],
  contributions: {
    vocabulary: {
      workshop: { ar: "المطبعة", en: "Printing Press" },
      sent_to_tailor: { ar: "قيد الطباعة", en: "In Printing" },
      received_from_tailor: { ar: "تمت الطباعة", en: "Printing Complete" },
    },
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" يقدم خدمات الطباعة الحرارية والأختام والتصاميم المخصصة.`
        : `Store "${brandName}" provides bespoke printing and stamping services.`,
  },
};
