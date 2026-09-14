import type { StoreVocabulary } from "@/lib/store-vocabulary";

export const FASHION_VOCABULARY: Partial<StoreVocabulary> = {
  workshop: { ar: "الخياط", en: "Tailor" },
  sent_to_workshop: { ar: "تم الإرسال للخياط", en: "Sent to Tailor" },
  received_from_workshop: { ar: "تم الاستلام من الخياط", en: "Received from Tailor" },
  sent_to_workshop_success: { ar: "تم الإرسال للخياط بنجاح!", en: "Order sent to tailor!" },
  received_from_workshop_success: {
    ar: "تم استلام الطلب من الخياط بنجاح!",
    en: "Received from tailor!",
  },
  custom_order: { ar: "تفصيل", en: "Tailoring" },
  custom_sizing: { ar: "تفصيل حسب الطلب", en: "Custom Tailoring" },
  customization_options: {
    ar: "خيارات التخصيص والمقاسات (التفصيل)",
    en: "Customization & Tailoring Options",
  },
  workshop_instructions: { ar: "تعليمات للمشغل", en: "Workshop instructions" },
  workshop_notes_label: {
    ar: "ملاحظات وتفاصيل التفصيل والخياط:",
    en: "Tailoring & Workshop Notes:",
  },
  workshop_notes_placeholder: {
    ar: "دوّن أي تفاصيل خاصة للخياطة (مثل: بطانة كاملة، تعديل طول الكم، خياطة مخفية، فتحة أزرار، تضييق الخصر...)",
    en: "Enter any workshop instructions (e.g., full lining, specific sleeve adjustment, hidden buttons)...",
  },
  ready_made: { ar: "جاهز", en: "Ready-made" },
  made_to_order: { ar: "تفصيل حسب الطلب", en: "Made to order" },
  sizing_guide: { ar: "دليل المقاسات", en: "Size Guide" },
};
