export type CustomFieldPreset = {
  label_en: string;
  label_ar: string;
  fields: Array<{
    key: string;
    label_ar: string;
    label_en: string;
    type: "text" | "number" | "select" | "file";
    options: string[];
    required: boolean;
  }>;
};

export const FASHION_CUSTOMIZER_PRESETS: Record<string, CustomFieldPreset> = {
  fashion: {
    label_en: "Fashion / Apparel Preset",
    label_ar: "نموذج أزياء / ملابس",
    fields: [
      {
        key: "length",
        label_ar: "الطول",
        label_en: "Length",
        type: "text",
        options: [],
        required: false,
      },
      {
        key: "bust",
        label_ar: "الصدر",
        label_en: "Bust",
        type: "text",
        options: [],
        required: false,
      },
      {
        key: "sleeve",
        label_ar: "الكم",
        label_en: "Sleeve",
        type: "text",
        options: [],
        required: false,
      },
      {
        key: "shoulder",
        label_ar: "الكتف",
        label_en: "Shoulder",
        type: "text",
        options: [],
        required: false,
      },
    ],
  },
  passport_abaya: {
    label_en: "Fit Passport — Abaya",
    label_ar: "جواز المقاسات — عباية",
    fields: [
      {
        key: "passport_abaya_length",
        label_ar: "الطول",
        label_en: "Length",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_abaya_chest_width",
        label_ar: "عرض الصدر",
        label_en: "Chest width",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_abaya_sleeve",
        label_ar: "طول الكم",
        label_en: "Sleeve length",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_abaya_armpit_height",
        label_ar: "ارتفاع الإبط (اختياري)",
        label_en: "Armpit height (optional)",
        type: "number",
        options: [],
        required: false,
      },
      {
        key: "passport_abaya_waist_width",
        label_ar: "عرض الوسط (اختياري)",
        label_en: "Waist width (optional)",
        type: "number",
        options: [],
        required: false,
      },
      {
        key: "passport_abaya_hem_width",
        label_ar: "عرض الأسفل (اختياري)",
        label_en: "Hem width (optional)",
        type: "number",
        options: [],
        required: false,
      },
      {
        key: "passport_abaya_sleeve_opening",
        label_ar: "فتحة الكم (اختياري)",
        label_en: "Sleeve opening (optional)",
        type: "number",
        options: [],
        required: false,
      },
    ],
  },
  passport_dress: {
    label_en: "Fit Passport — Dress",
    label_ar: "جواز المقاسات — فستان",
    fields: [
      {
        key: "passport_dress_length",
        label_ar: "الطول",
        label_en: "Length",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_dress_bust",
        label_ar: "الصدر",
        label_en: "Bust",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_dress_waist",
        label_ar: "الخصر",
        label_en: "Waist",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_dress_shoulder",
        label_ar: "عرض الكتف",
        label_en: "Shoulder",
        type: "number",
        options: [],
        required: true,
      },
      {
        key: "passport_dress_sleeve",
        label_ar: "طول الكم (اختياري)",
        label_en: "Sleeve length (optional)",
        type: "number",
        options: [],
        required: false,
      },
      {
        key: "passport_dress_hips",
        label_ar: "الأرداف (اختياري)",
        label_en: "Hips (optional)",
        type: "number",
        options: [],
        required: false,
      },
    ],
  },
};
