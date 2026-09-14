import type { AddonManifest } from "@/lib/addons/addon-types";

export const beautyPerfumeManifest: AddonManifest = {
  id: "beauty-perfume",
  version: 1,
  kind: "pack",
  name: { ar: "حزمة العطور والتجميل", en: "Beauty & Perfume Pack" },
  description: {
    ar: "تسميات المحاور، قوالب الأحجام وسياق المنتجات لمتاجر العطور والتجميل",
    en: "Variant axis labels, size presets, and AI context for perfume and cosmetics",
  },
  whatItAdds: [
    {
      ar: "تسمية محور الحجم (مل) والتركيز بدل المقاس واللون",
      en: "Volume (ml) and concentration axis labels",
    },
    {
      ar: "قوالب أحجام العطور القياسية (30، 50، 100 مل)",
      en: "Standard perfume bottle sizes (30, 50, 100 ml)",
    },
    { ar: "شارات الثقة لعطور ومنتجات أصلية 100%", en: "100% authentic fragrance trust badges" },
  ],
  icon: "Sparkles",
  activities: ["beauty"],
  contributions: {
    variantAxisDefaults: {
      size: { ar: "الحجم", en: "Volume" },
      color: { ar: "التركيز", en: "Concentration" },
      fabric: null,
    },
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" متخصص في العطور الفاخرة ومنتجات العناية والتجميل.`
        : `Store "${brandName}" specializes in luxury perfumes and cosmetics.`,
  },
};
