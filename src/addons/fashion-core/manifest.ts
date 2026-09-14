import type { AddonManifest } from "@/lib/addons/addon-types";
import { FASHION_VOCABULARY } from "./vocabulary";

export const fashionCoreManifest: AddonManifest = {
  id: "fashion-core",
  version: 1,
  kind: "pack",
  name: { ar: "حزمة أساسيات الأزياء", en: "Fashion Core Pack" },
  description: {
    ar: "المفردات، تسميات المتغيرات، وترتيب قوالب المقاسات الخاصة بقطاع الأزياء",
    en: "Vocabularies, variant axes, and sizing presets for the fashion vertical",
  },
  whatItAdds: [
    {
      ar: "مفردات قطاع الأزياء (الخياط، التفصيل، القماش)",
      en: "Fashion vocabulary terms (tailor, tailoring, fabric)",
    },
    {
      ar: "تقديم قوالب قياس الملابس والعبايات أولاً",
      en: "Prioritize apparel and abaya sizing templates",
    },
    {
      ar: "سياق الذكاء الاصطناعي لمنتجات وتصاميم الأزياء",
      en: "AI context for fashion design and apparel descriptions",
    },
  ],
  icon: "Shirt",
  activities: ["abayas", "fashion"],
  contributions: {
    vocabulary: FASHION_VOCABULARY,
    sizingPresetOrder: ["apparel_standard", "apparel_compact"],
    sizingPresets: [
      {
        id: "apparel_standard",
        labelAr: "ملابس (XS - 2XL)",
        labelEn: "Apparel (XS - 2XL)",
        sizes: ["XS", "S", "M", "L", "XL", "2XL"],
        unit: "",
      },
      {
        id: "apparel_compact",
        labelAr: "ملابس (S - XL)",
        labelEn: "Apparel (S - XL)",
        sizes: ["S", "M", "L", "XL"],
        unit: "",
      },
      {
        id: "shoes_women",
        labelAr: "أحذية نسائية (36 - 41)",
        labelEn: "Women Shoes (36 - 41)",
        sizes: ["36", "37", "38", "39", "40", "41"],
        unit: "",
      },
      {
        id: "shoes_men",
        labelAr: "أحذية رجالية (40 - 45)",
        labelEn: "Men Shoes (40 - 45)",
        sizes: ["40", "41", "42", "43", "44", "45"],
        unit: "",
      },
    ],
    customFieldPresets: [
      {
        key: "fashion",
        label: { ar: "نموذج أزياء / ملابس", en: "Fashion / Apparel Preset" },
        fields: [
          { key: "length", label_ar: "الطول", label_en: "Length", type: "text", options: [], required: false },
          { key: "bust", label_ar: "الصدر", label_en: "Bust", type: "text", options: [], required: false },
          { key: "sleeve", label_ar: "الكم", label_en: "Sleeve", type: "text", options: [], required: false },
          { key: "shoulder", label_ar: "الكتف", label_en: "Shoulder", type: "text", options: [], required: false },
        ],
      },
    ],
    variantAxisDefaults: {
      size: { ar: "المقاس", en: "Size" },
      color: { ar: "اللون", en: "Color" },
      fabric: { ar: "الخامة", en: "Fabric" },
    },
    trustBadgeSuggestions: ["Shirt", "Scissors", "Leaf"],
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" متخصص في الأزياء والملابس.`
        : `Store "${brandName}" specializes in fashion and apparel.`,
  },
};
