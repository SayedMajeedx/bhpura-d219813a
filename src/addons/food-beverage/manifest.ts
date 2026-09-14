import type { AddonManifest } from "@/lib/addons/addon-types";

export const foodBeverageManifest: AddonManifest = {
  id: "food-beverage",
  version: 1,
  kind: "pack",
  name: { ar: "حزمة المأكولات والمشروبات", en: "Food & Beverage Pack" },
  description: {
    ar: "إعدادات الاستلام، مفردات المطبخ والتحضير، وتسميات القوائم للمطاعم والمقاهي",
    en: "Pickup settings, kitchen vocabulary, and menu presets for food & beverage businesses",
  },
  whatItAdds: [
    { ar: "مفردات المطبخ، التحضير، ومحطات الطلب", en: "Kitchen and order preparation terms" },
    { ar: "تسمية الحجم للوجبات والمشروبات (S/M/L)", en: "Portion sizing axes (S/M/L) and options" },
    {
      ar: "تفعيل خيارات الاستلام من الفرع تلقائياً",
      en: "Automatic in-store pickup configuration",
    },
  ],
  icon: "UtensilsCrossed",
  activities: ["food"],
  contributions: {
    vocabulary: {
      workshop: { ar: "المطبخ", en: "Kitchen" },
      sent_to_tailor: { ar: "قيد التحضير", en: "In Preparation" },
      received_from_tailor: { ar: "جاهز للتسليم", en: "Ready for Pickup" },
    },
    variantAxisDefaults: {
      size: { ar: "الحجم", en: "Size" },
      color: null,
      fabric: null,
    },
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" يقدم أطعمة ومشروبات ومأكولات طازجة ولذيذة.`
        : `Store "${brandName}" serves fresh foods and beverages.`,
  },
};
