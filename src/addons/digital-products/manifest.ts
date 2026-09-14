import type { AddonManifest } from "@/lib/addons/addon-types";

export const digitalProductsManifest: AddonManifest = {
  id: "digital-products",
  version: 1,
  kind: "pack",
  name: { ar: "حزمة المنتجات الرقمية", en: "Digital Products Pack" },
  description: {
    ar: "إعدادات التسليم الرقمي الفوري وإخفاء تفاصيل الشحن الفعلي والمقاسات",
    en: "Instant digital delivery configuration without physical shipping overhead",
  },
  whatItAdds: [
    { ar: "تفعيل التسليم الرقمي افتراضياً", en: "Enable digital delivery by default" },
    {
      ar: "إخفاء محاور المقاس واللون وحقول الشحن الفعلي",
      en: "Hide physical shipping and apparel variant axes",
    },
    {
      ar: "سياق الذكاء الاصطناعي للملفات والاشتراكات والكتب الإلكترونية",
      en: "AI context for digital files and downloads",
    },
  ],
  icon: "Download",
  activities: ["digital"],
  contributions: {
    vocabulary: {
      workshop: { ar: "التسليم الرقمي", en: "Digital Delivery" },
    },
    variantAxisDefaults: {
      size: null,
      color: null,
      fabric: null,
    },
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" يبيع منتجات رقمية وملفات قابلة للتنزيل واشتراكات.`
        : `Store "${brandName}" sells digital products, downloads, and subscriptions.`,
  },
};
