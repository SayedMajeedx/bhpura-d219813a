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

import type { StoreVertical } from "@/lib/store-profile";

export const SIZING_PRESETS = [
  {
    id: "abaya_gulf",
    labelAr: "عبايات (50 - 60 زوجي)",
    labelEn: "Abayas (50 - 60 even)",
    sizes: ["50", "52", "54", "56", "58", "60"],
    unit: "inch" as const,
  },
  {
    id: "abaya_extended",
    labelAr: "عبايات موسعة (48 - 62)",
    labelEn: "Abayas Ext (48 - 62)",
    sizes: ["48", "50", "52", "54", "56", "58", "60", "62"],
    unit: "inch" as const,
  },
  {
    id: "apparel_standard",
    labelAr: "ملابس (XS - 2XL)",
    labelEn: "Apparel (XS - 2XL)",
    sizes: ["XS", "S", "M", "L", "XL", "2XL"],
    unit: "" as const,
  },
  {
    id: "apparel_compact",
    labelAr: "ملابس (S - XL)",
    labelEn: "Apparel (S - XL)",
    sizes: ["S", "M", "L", "XL"],
    unit: "" as const,
  },
  {
    id: "numbered_1_5",
    labelAr: "أرقام (1 إلى 5)",
    labelEn: "Numbered (1 to 5)",
    sizes: ["1", "2", "3", "4", "5"],
    unit: "" as const,
  },
  {
    id: "shoes_women",
    labelAr: "أحذية نسائية (36 - 41)",
    labelEn: "Women Shoes (36 - 41)",
    sizes: ["36", "37", "38", "39", "40", "41"],
    unit: "" as const,
  },
  {
    id: "shoes_men",
    labelAr: "أحذية رجالية (40 - 45)",
    labelEn: "Men Shoes (40 - 45)",
    sizes: ["40", "41", "42", "43", "44", "45"],
    unit: "" as const,
  },
  {
    id: "free_size",
    labelAr: "مقاس موحد (Free Size)",
    labelEn: "Free Size",
    sizes: ["Free Size"],
    unit: "" as const,
  },
];

export function orderSizingPresetsForVertical(vertical: StoreVertical) {
  if (vertical === "fashion" || vertical === "abayas") {
    return SIZING_PRESETS;
  }
  const abayaIds = new Set(["abaya_gulf", "abaya_extended"]);
  const nonAbaya = SIZING_PRESETS.filter((p) => !abayaIds.has(p.id));
  const abaya = SIZING_PRESETS.filter((p) => abayaIds.has(p.id));
  return [...nonAbaya, ...abaya];
}
