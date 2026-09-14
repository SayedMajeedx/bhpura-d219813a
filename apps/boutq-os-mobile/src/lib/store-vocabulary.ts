export type MobileVocabularyEntry = {
  ar: string;
  en: string;
};

export type MobileStoreVocabulary = {
  workshop: MobileVocabularyEntry;
  sent_to_workshop: MobileVocabularyEntry;
  received_from_workshop: MobileVocabularyEntry;
  sent_to_workshop_success: MobileVocabularyEntry;
  received_from_workshop_success: MobileVocabularyEntry;
  custom_order: MobileVocabularyEntry;
  custom_sizing: MobileVocabularyEntry;
  customization_options: MobileVocabularyEntry;
  workshop_instructions: MobileVocabularyEntry;
  workshop_notes_label: MobileVocabularyEntry;
  workshop_notes_placeholder: MobileVocabularyEntry;
  ready_made: MobileVocabularyEntry;
  made_to_order: MobileVocabularyEntry;
  sizing_guide: MobileVocabularyEntry;
};

export const DEFAULT_MOBILE_VOCABULARY: MobileStoreVocabulary = {
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

/**
 * Vertical / Addon specific vocabulary overrides
 */
export const FASHION_VOCABULARY_OVERRIDE: Partial<MobileStoreVocabulary> = {
  workshop: { ar: "الخياط", en: "Tailor" },
  sent_to_workshop: { ar: "تم الإرسال للخياط", en: "Sent to Tailor" },
  received_from_workshop: { ar: "تم الاستلام من الخياط", en: "Received from Tailor" },
  sent_to_workshop_success: { ar: "تم الإرسال للخياط بنجاح!", en: "Order sent to tailor!" },
  received_from_workshop_success: {
    ar: "تم استلام الطلب من الخياط بنجاح!",
    en: "Received from tailor!",
  },
  workshop_instructions: { ar: "تعليمات للخياط", en: "Tailor instructions" },
};

export function resolveMobileVocabulary(
  installedAddonIds: string[] = [],
  storeVertical?: string | null,
  customVocabulary?: Partial<MobileStoreVocabulary> | null,
): MobileStoreVocabulary {
  const result: MobileStoreVocabulary = { ...DEFAULT_MOBILE_VOCABULARY };

  // If fashion vertical or fashion-core / abaya-pack is installed
  const isFashion =
    installedAddonIds.includes("fashion-core") ||
    installedAddonIds.includes("abaya-pack") ||
    storeVertical === "abayas" ||
    storeVertical === "fashion";

  if (isFashion) {
    Object.assign(result, FASHION_VOCABULARY_OVERRIDE);
  }

  if (customVocabulary && typeof customVocabulary === "object") {
    for (const [key, val] of Object.entries(customVocabulary)) {
      if (val && typeof val === "object" && "ar" in val && "en" in val) {
        (result as any)[key] = val;
      }
    }
  }

  return result;
}
