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
      sent_to_workshop: { ar: "قيد التحضير بالمطبخ", en: "In Kitchen Preparation" },
      received_from_workshop: { ar: "جاهز للتسليم", en: "Ready for Pickup" },
      sent_to_tailor: { ar: "قيد التحضير بالمطبخ", en: "In Kitchen Preparation" },
      received_from_tailor: { ar: "جاهز للتسليم", en: "Ready for Pickup" },
      workshop_notes_label: {
        ar: "ملاحظات وتفاصيل التحضير بالمطبخ:",
        en: "Kitchen Preparation Notes:",
      },
      workshop_instructions: { ar: "تعليمات للمطبخ", en: "Kitchen instructions" },
    },
    variantAxisDefaults: {
      size: { ar: "الوزن / الحجم", en: "Weight / Size" },
      color: { ar: "النكهة / الخيار", en: "Flavor / Option" },
      fabric: null,
    },
    sizingPresets: [
      {
        id: "sweets_bakery_weights",
        labelAr: "أوزان الحلويات والمخبوزات (250غ، 500غ، 700غ، 1كغ)",
        labelEn: "Sweets & Bakery Weights (250g, 500g, 700g, 1kg)",
        sizes: ["250", "500", "700", "1000"],
        unit: "g",
      },
      {
        id: "food_portions",
        labelAr: "أحجام الوجبات (صغير، وسط، كبير)",
        labelEn: "Meal Portions (Small, Medium, Large)",
        sizes: ["صغير", "وسط", "كبير"],
        unit: "portion",
      },
      {
        id: "food_servings",
        labelAr: "حصص الأفراد (فردي، ثنائي، عائلي)",
        labelEn: "Servings (Single, Double, Family)",
        sizes: ["شخص واحد", "شخصين", "عائلي (4-6 أشخاص)"],
        unit: "serving",
      },
      {
        id: "beverage_sizes",
        labelAr: "أحجام المشروبات (عادي، كبير)",
        labelEn: "Drink Sizes (Regular, Large)",
        sizes: ["عادي", "حجم كبير"],
        unit: "volume",
      },
    ],
    settingsPatchOnInstall: {
      pickup_enabled: true,
    },
    readinessChecks: [
      {
        id: "food_pickup_branch_check",
        label: { ar: "فرع الاستلام", en: "Pickup Branch" },
        description: {
          ar: "تأكد من وجود فرع استلام متاح لاستلام طلبات الطعام.",
          en: "Ensure a pickup branch exists for food orders.",
        },
        actionTo: "/admin/b/$slug/settings?tab=business",
        evaluate: async ({ brandId, db }) => {
          const { count } = await db
            .from("branches")
            .select("id", { count: "exact", head: true })
            .eq("brand_id", brandId);
          return (count ?? 0) > 0 ? "ok" : "warn";
        },
      },
    ],
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" يقدم أطعمة ومشروبات ومأكولات طازجة ولذيذة.`
        : `Store "${brandName}" serves fresh foods and beverages.`,
  },
};
