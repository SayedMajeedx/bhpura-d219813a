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
  made_to_order: { ar: "تفصيل حسب الطلب", en: "Made to order" },
  sizing_guide: { ar: "دليل المقاسات", en: "Size Guide" },
};

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
