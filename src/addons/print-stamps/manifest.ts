import type { AddonManifest } from "@/lib/addons/addon-types";
import { resolveBrandOwnerUserId } from "@/lib/addons/seed-helpers";

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
      sent_to_tailor: { ar: "قيد الطباعة", en: "In Printing" },
      received_from_tailor: { ar: "تمت الطباعة", en: "Printing Complete" },
    },
    trustBadgeSuggestions: ["custom_print", "high_precision"],
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" يقدم خدمات الطباعة الحرارية والأختام والتصاميم المخصصة.`
        : `Store "${brandName}" provides bespoke printing and stamping services.`,
  },
  seeds: [
    {
      key: "print_stamps_customization",
      description: {
        ar: "خيارات تخصيص الطباعة والأختام الافتراضية",
        en: "Default printing and stamping customization options",
      },
      run: async ({ brandId, db }) => {
        const optionName = "تخصيص الاسم أو الشعار المطبوع";
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
            price_delta: 2.0,
            product_ids: [],
          });

          if (error) throw error;
        }
      },
    },
  ],
};
