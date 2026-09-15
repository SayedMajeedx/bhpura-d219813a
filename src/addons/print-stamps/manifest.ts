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
      sent_to_workshop: { ar: "قيد الطباعة", en: "In Printing" },
      received_from_workshop: { ar: "تمت الطباعة", en: "Printing Complete" },
      sent_to_tailor: { ar: "قيد الطباعة", en: "In Printing" },
      received_from_tailor: { ar: "تمت الطباعة", en: "Printing Complete" },
      workshop_notes_label: {
        ar: "ملاحظات وتفاصيل الطباعة والختم:",
        en: "Printing & Stamping Notes:",
      },
      workshop_instructions: { ar: "تعليمات للمطبعة", en: "Printing instructions" },
    },
    variantAxisDefaults: {
      size: { ar: "المقاس / الأبعاد", en: "Dimensions" },
      color: { ar: "لون الحبر أو الخامة", en: "Ink / Color" },
      fabric: null,
    },
    customFieldPresets: [
      {
        key: "print",
        label: { ar: "نموذج طباعة وأختام / تخصيص", en: "Print & Stamp Preset" },
        fields: [
          {
            key: "stamp_size",
            label_ar: "مقاس الختم / اللوحة",
            label_en: "Stamp / Print Size",
            type: "text",
            options: [],
            required: false,
          },
          {
            key: "ink_color",
            label_ar: "لون الحبر / الطباعة",
            label_en: "Ink Color",
            type: "select",
            options: ["أسود", "أزرق", "أحمر", "أخضر"],
            required: false,
          },
          {
            key: "logo_upload",
            label_ar: "رابط الشعار أو الملف",
            label_en: "Logo / File URL",
            type: "text",
            options: [],
            required: false,
          },
          {
            key: "custom_note",
            label_ar: "نص الختم أو العبارة",
            label_en: "Custom Text / Note",
            type: "text",
            options: [],
            required: false,
          },
        ],
      },
    ],
    trustBadgeSuggestions: ["Palette", "PackageCheck"],
    sizingPresets: [
      {
        id: "print_paper_sizes",
        labelAr: "مقاسات الأوراق والمطبوعات (A5, A4, A3, A2)",
        labelEn: "Paper & Print Sizes (A5, A4, A3, A2)",
        sizes: ["A5", "A4", "A3", "A2"],
        unit: "paper",
      },
      {
        id: "round_stamps",
        labelAr: "أختام دائرية (25mm, 30mm, 40mm, 50mm)",
        labelEn: "Round Stamp Diameters (25mm, 30mm, 40mm, 50mm)",
        sizes: ["25mm", "30mm", "40mm", "50mm"],
        unit: "mm",
      },
      {
        id: "rect_stamps",
        labelAr: "أختام مستطيلة (20x50mm, 25x65mm, 30x70mm)",
        labelEn: "Rectangular Stamps (20x50mm, 25x65mm, 30x70mm)",
        sizes: ["20x50mm", "25x65mm", "30x70mm"],
        unit: "mm",
      },
      {
        id: "cards_count",
        labelAr: "كميات الكروت المطبوعة (100, 250, 500, 1000)",
        labelEn: "Card Quantities (100, 250, 500, 1000)",
        sizes: ["100 كرت", "250 كرت", "500 كرت", "1000 كرت"],
        unit: "count",
      },
    ],
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" يقدم خدمات الطباعة الحرارية والأختام والتصاميم المخصصة.`
        : `Store "${brandName}" provides bespoke printing and stamping services.`,
  },
};
