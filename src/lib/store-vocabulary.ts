export type VocabularyEntry = {
  ar: string;
  en: string;
};

export type StoreVocabulary = {
  workshop: VocabularyEntry;
  sent_to_workshop: VocabularyEntry;
  received_from_workshop: VocabularyEntry;
  sent_to_workshop_success: VocabularyEntry;
  received_from_workshop_success: VocabularyEntry;
  custom_order: VocabularyEntry;
  custom_sizing: VocabularyEntry;
  customization_options: VocabularyEntry;
  workshop_instructions: VocabularyEntry;
  workshop_notes_label: VocabularyEntry;
  workshop_notes_placeholder: VocabularyEntry;
  ready_made: VocabularyEntry;
  made_to_order: VocabularyEntry;
  sizing_guide: VocabularyEntry;
  product_noun: VocabularyEntry;
  collections_noun: VocabularyEntry;
  specifications_label: VocabularyEntry;
  care_instructions_label: VocabularyEntry;
  variant_picker_prompt: VocabularyEntry;
};

export const DEFAULT_VOCABULARY: StoreVocabulary = {
  workshop: { ar: "الورشة", en: "Workshop" },
  sent_to_workshop: { ar: "تم الإرسال للورشة", en: "Sent to Workshop" },
  received_from_workshop: { ar: "تم الاستلام من الورشة", en: "Received from Workshop" },
  sent_to_workshop_success: { ar: "تم الإرسال للورشة بنجاح!", en: "Order sent to workshop!" },
  received_from_workshop_success: {
    ar: "تم استلام الطلب من الورشة بنجاح!",
    en: "Received from workshop!",
  },
  custom_order: { ar: "حسب الطلب", en: "Made to order" },
  custom_sizing: { ar: "قياسات خاصة / حسب الطلب", en: "Custom sizing" },
  customization_options: { ar: "خيارات التخصيص والمقاسات", en: "Customization & Sizing Options" },
  workshop_instructions: { ar: "تعليمات للمشغل / الورشة", en: "Workshop instructions" },
  workshop_notes_label: { ar: "ملاحظات وتفاصيل التجهيز:", en: "Production & Workshop Notes:" },
  workshop_notes_placeholder: {
    ar: "دوّن أي تفاصيل خاصة بالتجهيز أو التعديلات المطلوبة...",
    en: "Enter any special production or adjustment notes...",
  },
  ready_made: { ar: "جاهز", en: "Ready-made" },
  made_to_order: { ar: "صنع حسب الطلب", en: "Made to order" },
  sizing_guide: { ar: "دليل المقاسات", en: "Size Guide" },
  product_noun: { ar: "المنتج", en: "Product" },
  collections_noun: { ar: "التشكيلات", en: "Collections" },
  specifications_label: { ar: "المواصفات والتفاصيل", en: "Specifications & Details" },
  care_instructions_label: { ar: "العناية والاستخدام", en: "Care & Usage" },
  variant_picker_prompt: { ar: "اختر الخيار المناسب", en: "Select option" },
};

export function getVerticalVocabularyOverrides(vertical?: string | null): Partial<StoreVocabulary> {
  const v = (vertical || "").toLowerCase();
  if (v === "coffee" || v === "food" || v === "cafe") {
    return {
      specifications_label: { ar: "المكونات والتحضير", en: "Ingredients & Details" },
      care_instructions_label: { ar: "إرشادات الحفظ والتقديم", en: "Storage & Serving" },
      sizing_guide: { ar: "دليل الأحجام والأوزان", en: "Size & Weight Guide" },
      variant_picker_prompt: { ar: "اختر الحجم أو الوزن", en: "Select size or weight" },
    };
  }
  if (v === "perfumes" || v === "beauty") {
    return {
      specifications_label: { ar: "المكونات العطرية", en: "Fragrance Notes" },
      care_instructions_label: { ar: "إرشادات الاستخدام", en: "Usage Guidelines" },
      sizing_guide: { ar: "دليل الأحجام", en: "Size Guide" },
      variant_picker_prompt: { ar: "اختر الحجم أو العبوة", en: "Select size or bottle" },
    };
  }
  if (v === "electronics") {
    return {
      specifications_label: { ar: "المواصفات التقنية", en: "Technical Specifications" },
      care_instructions_label: { ar: "إرشادات التشغيل والضمان", en: "Operating & Warranty" },
      sizing_guide: { ar: "دليل المواصفات", en: "Specs Guide" },
      variant_picker_prompt: { ar: "اختر الطراز أو السعة", en: "Select model or capacity" },
    };
  }
  if (v === "fashion" || v === "clothing" || v === "apparel") {
    return {
      specifications_label: { ar: "الخامة والتفاصيل", en: "Fabric & Details" },
      care_instructions_label: { ar: "تعليمات الغسيل والعناية", en: "Washing & Care Instructions" },
      sizing_guide: { ar: "دليل المقاسات", en: "Size Guide" },
      variant_picker_prompt: { ar: "اختر المقاس", en: "Select size" },
    };
  }
  return {};
}

export function resolveVocabulary(
  base: StoreVocabulary = DEFAULT_VOCABULARY,
  ...overrides: Array<Partial<StoreVocabulary> | undefined | null>
): StoreVocabulary {
  const result: StoreVocabulary = {
    ...base,
    workshop: { ...base.workshop },
    sent_to_workshop: { ...base.sent_to_workshop },
    received_from_workshop: { ...base.received_from_workshop },
    sent_to_workshop_success: { ...base.sent_to_workshop_success },
    received_from_workshop_success: { ...base.received_from_workshop_success },
    custom_order: { ...base.custom_order },
    custom_sizing: { ...base.custom_sizing },
    customization_options: { ...base.customization_options },
    workshop_instructions: { ...base.workshop_instructions },
    workshop_notes_label: { ...base.workshop_notes_label },
    workshop_notes_placeholder: { ...base.workshop_notes_placeholder },
    ready_made: { ...base.ready_made },
    made_to_order: { ...base.made_to_order },
    sizing_guide: { ...base.sizing_guide },
    product_noun: { ...base.product_noun },
    collections_noun: { ...base.collections_noun },
    specifications_label: { ...base.specifications_label },
    care_instructions_label: { ...base.care_instructions_label },
    variant_picker_prompt: { ...base.variant_picker_prompt },
  };

  for (const override of overrides) {
    if (!override) continue;
    for (const key of Object.keys(override) as Array<keyof StoreVocabulary>) {
      const entry = override[key];
      if (entry) {
        result[key] = {
          ar: entry.ar ?? result[key].ar,
          en: entry.en ?? result[key].en,
        };
      }
    }
  }

  return result;
}
