import type { AddonManifest } from "@/lib/addons/addon-types";

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
    vocabulary: {
      tailor: { ar: "الخياط", en: "Tailor" },
      tailoring: { ar: "التفصيل", en: "Tailoring" },
      fabric: { ar: "القماش", en: "Fabric" },
      workshop: { ar: "الورشة", en: "Workshop" },
      sent_to_tailor: { ar: "تم الإرسال للخياط", en: "Sent to Tailor" },
      received_from_tailor: { ar: "تم الاستلام من الخياط", en: "Received from Tailor" },
    },
    sizingPresetOrder: ["abaya_gulf", "apparel_alpha", "apparel_numeric"],
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" متخصص في الأزياء والملابس.`
        : `Store "${brandName}" specializes in fashion and apparel.`,
  },
};
