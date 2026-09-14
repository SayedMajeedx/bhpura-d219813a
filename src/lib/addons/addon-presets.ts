import { FASHION_CUSTOMIZER_PRESETS, type CustomFieldPreset } from "@/addons/fashion-core/presets";
export {
  FIT_PROFILE_FIELDS,
  FASHION_FIT_PROFILES,
  fitProfileForProduct,
  matchCustomFieldToMeasurement,
  missingFitFields,
  normalizeFitProfiles,
  resolveFitProfiles,
  type FitMeasurements,
  type FitProfileDefinition,
  type FitProfileField,
  type FitProfileMatch,
  type FitProfiles,
  type FitProfileType,
} from "@/addons/fit-passport/lib/fit-passport";
export type { SizeGuide } from "@/addons/size-guides/lib/size-guide";

export type { CustomFieldPreset };

export const GENERIC_CUSTOMIZER_PRESETS: Record<string, CustomFieldPreset> = {
  print: {
    label_en: "Print / Stamp Shop Preset",
    label_ar: "نموذج مطبعة / متجر أختام",
    fields: [
      {
        key: "stamp_size",
        label_ar: "مقاس الختم / الطباعة",
        label_en: "Stamp/Print Size Swatches",
        type: "select",
        options: ["Q13 (13*49mm)", "Q20 (20*20mm)", "Q30 (30*30mm)"],
        required: true,
      },
      {
        key: "ink_color",
        label_ar: "لون الحبر",
        label_en: "Ink/Color Picker",
        type: "select",
        options: ["Black", "Blue", "Red", "Green"],
        required: true,
      },
      {
        key: "logo_upload",
        label_ar: "تحميل شعار الختم / التصميم",
        label_en: "Upload Logo File Input",
        type: "file",
        options: [],
        required: false,
      },
      {
        key: "custom_note",
        label_ar: "نص الكتابة المطلوب للختم",
        label_en: "Custom Note Text Area",
        type: "text",
        options: [],
        required: false,
      },
    ],
  },
  gift: {
    label_en: "Gift / Perfume Preset",
    label_ar: "نموذج هدايا / عطور",
    fields: [
      {
        key: "gift_box",
        label_ar: "إضافة صندوق هدايا فاخر",
        label_en: "Gift Box Add-On (+X BHD)",
        type: "select",
        options: ["No / لا", "Yes (+2.000 BHD) / نعم (+2.000 د.ب)"],
        required: true,
      },
      {
        key: "greeting_card",
        label_ar: "نص كرت الإهداء",
        label_en: "Greeting Card Message Text Area",
        type: "text",
        options: [],
        required: false,
      },
    ],
  },
  jewelry: {
    label_en: "Jewelry / Engraving Preset",
    label_ar: "نموذج مجوهرات / حفر",
    fields: [
      {
        key: "engraving_text",
        label_ar: "النص المطلوب للحفر",
        label_en: "Custom Engraving Text",
        type: "text",
        options: [],
        required: false,
      },
      {
        key: "font_style",
        label_ar: "خط الكتابة",
        label_en: "Font Style Selector",
        type: "select",
        options: ["Arabic Calligraphy / ديواني", "Classic Serif", "Modern Sans-Serif"],
        required: false,
      },
      {
        key: "material_swatch",
        label_ar: "نوع المعدن",
        label_en: "Material/Metal Swatch",
        type: "select",
        options: ["Gold / ذهب", "Silver / فضة", "Rose Gold / روز جولد"],
        required: true,
      },
    ],
  },
};

export function getCustomizerPresets(
  installedAddonIds?: string[],
): Record<string, CustomFieldPreset> {
  const result: Record<string, CustomFieldPreset> = { ...GENERIC_CUSTOMIZER_PRESETS };
  // If no list passed or includes fashion/abaya, merge fashion presets
  if (
    !installedAddonIds ||
    installedAddonIds.includes("fashion-core") ||
    installedAddonIds.includes("abaya-pack") ||
    installedAddonIds.includes("fit-passport")
  ) {
    Object.assign(result, FASHION_CUSTOMIZER_PRESETS);
  }
  return result;
}

export const CUSTOMIZER_PRESETS = getCustomizerPresets();
