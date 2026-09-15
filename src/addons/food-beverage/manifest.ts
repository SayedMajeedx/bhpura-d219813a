import type { AddonManifest } from "@/lib/addons/addon-types";
import { resolveBrandOwnerUserId } from "@/lib/addons/seed-helpers";

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
      size: { ar: "الحجم", en: "Size" },
      color: null,
      fabric: null,
    },
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
  seeds: [
    {
      key: "food_extras_customization",
      description: {
        ar: "خيارات إضافات الوجبات والمشروبات الافتراضية",
        en: "Default food & beverage customization extras",
      },
      run: async ({ brandId, db }) => {
        const optionName = "إضافة صوص أو مقبلات إضافية";
        const { data: existing, error: existErr } = await db
          .from("customization_options")
          .select("id")
          .eq("brand_id", brandId)
          .eq("name", optionName)
          .maybeSingle();

        if (existErr) throw existErr;

        if (!existing) {
          const userId = await resolveBrandOwnerUserId(db, brandId);
          if (!userId) {
            return;
          }

          const { error } = await db.from("customization_options").insert({
            brand_id: brandId,
            user_id: userId,
            name: optionName,
            price_delta: 0.5,
            product_ids: [],
          });

          if (error) throw error;
        }
      },
    },
  ],
};
