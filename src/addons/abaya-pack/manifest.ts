import type { AddonManifest } from "@/lib/addons/addon-types";
import { FASHION_FIT_PROFILES } from "@/addons/fit-passport/lib/fit-passport";

export const abayaPackManifest: AddonManifest = {
  id: "abaya-pack",
  version: 1,
  kind: "pack",
  name: { ar: "حزمة العبايات الخليجية", en: "Gulf Abayas Pack" },
  description: {
    ar: "إعدادات وقوالب متخصصة لمتاجر وبوتيكات العبايات في الخليج",
    en: "Specialized templates, sizing, and presets for Gulf abaya boutiques",
  },
  whatItAdds: [
    {
      ar: "قوالب مقاسات العبايات الخليجية (50-60 إنش) افتراضياً",
      en: "Gulf abaya size presets (50-60 inch) by default",
    },
    {
      ar: "ملفات قياس عباية وفستان في الـ Fit Passport",
      en: "Abaya and dress fit profiles in Fit Passport",
    },
    {
      ar: "سياق ذكاء اصطناعي خاص بتفصيل ومقاسات وأقمشة العبايات",
      en: "Dedicated AI context for abaya tailoring and fabrics",
    },
  ],
  icon: "Sparkles",
  activities: ["abayas"],
  requires: ["fashion-core", "size-guides", "fit-passport", "made-to-order"],
  contributions: {
    sizingPresetOrder: ["abaya_gulf", "abaya_extended", "apparel_alpha"],
    aiContext: ({ brandName, lang }) =>
      lang === "ar"
        ? `متجر "${brandName}" بوتيك عبايات خليجية وتفصيل راقٍ.`
        : `Store "${brandName}" is a luxury Gulf abaya and tailoring boutique.`,
  },
  seeds: [
    {
      key: "abaya_default_guide",
      description: {
        ar: "دليل مقاسات العبايات الخليجية الافتراضي",
        en: "Default Gulf abaya size guide",
      },
      run: async ({ brandId, db }) => {
        const { data: existing } = await db
          .from("size_guides")
          .select("id")
          .eq("brand_id", brandId)
          .eq("template_key", "abaya_gulf")
          .maybeSingle();

        if (!existing) {
          await db.from("size_guides").insert({
            brand_id: brandId,
            name_ar: "دليل مقاسات العبايات",
            name_en: "Abaya Size Guide",
            template_key: "abaya_gulf",
            base_unit: "in",
            columns: [
              {
                key: "length",
                label_ar: "الطول",
                label_en: "Length",
                kind: "measurement",
                measurement_key: "length",
              },
              {
                key: "bust",
                label_ar: "محيط الصدر",
                label_en: "Bust",
                kind: "measurement",
                measurement_key: "bust",
              },
              {
                key: "sleeve",
                label_ar: "طول الكم",
                label_en: "Sleeve",
                kind: "measurement",
                measurement_key: "sleeve",
              },
              {
                key: "shoulder",
                label_ar: "عرض الكتف",
                label_en: "Shoulder",
                kind: "measurement",
                measurement_key: "shoulder",
              },
            ],
            rows: [
              { label: "50", values: { length: 50, bust: 20, sleeve: 25, shoulder: 14.5 } },
              { label: "52", values: { length: 52, bust: 21, sleeve: 26, shoulder: 15 } },
              { label: "54", values: { length: 54, bust: 22, sleeve: 27, shoulder: 15.5 } },
              { label: "56", values: { length: 56, bust: 23, sleeve: 28, shoulder: 16 } },
              { label: "58", values: { length: 58, bust: 24, sleeve: 29, shoulder: 16.5 } },
              { label: "60", values: { length: 60, bust: 25, sleeve: 30, shoulder: 17 } },
            ],
            is_default: true,
          });
        }
      },
    },
    {
      key: "abaya_fit_profiles",
      description: {
        ar: "ملفات قياس العباية والفستان في Fit Passport",
        en: "Abaya and dress measurement profiles in Fit Passport",
      },
      run: async ({ brandId, db }) => {
        const { data: bs } = await db
          .from("business_settings")
          .select("fit_profiles")
          .eq("brand_id", brandId)
          .maybeSingle();

        if (!bs?.fit_profiles) {
          await db
            .from("business_settings")
            .update({ fit_profiles: FASHION_FIT_PROFILES })
            .eq("brand_id", brandId);
        }
      },
    },
    {
      key: "abaya_sizing_order",
      description: {
        ar: "ترتيب قوالب مقاسات العبايات أولاً",
        en: "Prioritize abaya sizing presets",
      },
      run: async () => {},
    },
  ],
};
