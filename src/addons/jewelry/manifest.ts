import type { AddonManifest } from "@/lib/addons/addon-types";

export const jewelryManifest: AddonManifest = {
  id: "jewelry",
  version: 1,
  kind: "pack",
  name: { ar: "حزمة المجوهرات والإكسسوارات", en: "Jewelry & Accessories Pack" },
  description: {
    ar: "تسميات مقاسات الخواتم والأساور، حقول الحفر والتخصيص، ومفردات ورش الصاغة",
    en: "Ring and bracelet sizing, engraving fields, and jeweler workshop presets",
  },
  whatItAdds: [
    {
      ar: "قوالب قياس الخواتم والأساور القياسية",
      en: "Ring sizing and bracelet measurement charts",
    },
    {
      ar: "تسمية محور المقاس بمقاس الخاتم واللون بنوع المعدن",
      en: "Ring size and metal type variant axis labels",
    },
    {
      ar: "سياق الذكاء الاصطناعي للمجوهرات والذهب والفضة والأحجار",
      en: "AI context for jewelry craftsmanship",
    },
  ],
  icon: "Gem",
  activities: ["jewelry"],
  requires: ["size-guides", "made-to-order"],
  contributions: {
    vocabulary: {
      workshop: { ar: "ورشة الصياغة", en: "Jeweler Workshop" },
      sent_to_tailor: { ar: "قيد الصياغة والحفر", en: "In Crafting & Engraving" },
      received_from_tailor: { ar: "جاهز للاستلام", en: "Ready for Collection" },
    },
    variantAxisDefaults: {
      size: { ar: "مقاس الخاتم", en: "Ring Size" },
      color: { ar: "نوع المعدن", en: "Metal Type" },
      fabric: null,
    },
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" يقدم مجوهرات راقية وإكسسوارات مصاغة بعناية.`
        : `Store "${brandName}" crafts fine jewelry and bespoke accessories.`,
  },
};
