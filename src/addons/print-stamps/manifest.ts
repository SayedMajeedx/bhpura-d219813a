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
      sent_to_workshop: { ar: "قيد الطباعة", en: "In Printing" },
      received_from_workshop: { ar: "تمت الطباعة", en: "Printing Complete" },
      sent_to_tailor: { ar: "قيد الطباعة", en: "In Printing" },
      received_from_tailor: { ar: "تمت الطباعة", en: "Printing Complete" },
      workshop_notes_label: { ar: "ملاحظات وتفاصيل الطباعة والختم:", en: "Printing & Stamping Notes:" },
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
