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
    sizingPresetOrder: ["abaya_gulf", "apparel_alpha", "apparel_numeric"],
    variantAxisDefaults: {
      size: { ar: "المقاس", en: "Size" },
      color: { ar: "اللون", en: "Color" },
      fabric: { ar: "الخامة", en: "Fabric" },
    },
    trustBadgeSuggestions: ["quality_guarantee", "made_with_love"],
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" متخصص في الأزياء والملابس.`
        : `Store "${brandName}" specializes in fashion and apparel.`,
  },
};
