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
    variantAxisDefaults: {
      size: { ar: "حجم الهدية / الباقة", en: "Gift Size / Bundle" },
      color: { ar: "لون التغليف", en: "Wrapping Color" },
      fabric: null,
    },
    customFieldPresets: [
      {
        key: "gift",
        label: { ar: "نموذج هدايا / إهداء وتغليف", en: "Gift & Packaging Preset" },
        fields: [
          {
            key: "gift_box",
            label_ar: "نوع التغليف والصندوق",
            label_en: "Gift Box Type",
            type: "select",
            options: ["صندوق مخمل فاخر", "تغليف كلاسيكي شريطة حرير", "صندوق هدايا خشبي"],
            required: false,
          },
          {
            key: "greeting_card",
            label_ar: "نص كرت الإهداء",
            label_en: "Gift Card Message",
            type: "text",
            options: [],
            required: false,
          },
        ],
      },
    ],
    trustBadgeSuggestions: ["Gift", "HeartHandshake"],
    sizingPresets: [
      {
        id: "gift_box_sizes",
        labelAr: "أحجام الصناديق والباقات (صغير، متوسط، كبير، VIP)",
        labelEn: "Gift Box Sizes (Small, Medium, Large, VIP)",
        sizes: ["صغير", "متوسط", "كبير", "فاخر VIP"],
        unit: "box",
      },
    ],
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" يقدم هدايا مميزة وتغليفاً راقياً لمختلف المناسبات.`
        : `Store "${brandName}" creates curated gifts and premium packaging.`,
  },
};
