/**
 * The words the reports use for a figure and for a code the database keeps, in both languages:
 * one set for the screens and the Excel files, so a figure has one name wherever it is read.
 */

export type Words = { en: string; ar: string };
export type ReportLang = "ar" | "en";

export const SALES_WORDS = {
  netSales: { en: "Net sales", ar: "صافي المبيعات" },
  netSalesNote: {
    en: "Before VAT and delivery, after discounts and returns",
    ar: "قبل الضريبة والتوصيل، بعد الخصومات والمرتجعات",
  },
  bySource: { en: "Sales by source", ar: "المبيعات حسب المصدر" },
  store: { en: "Store orders", ar: "طلبات المتجر" },
  partners: { en: "Partner shops", ar: "المحلات الشريكة" },
  services: { en: "Gift card services", ar: "خدمات بطاقات الهدايا" },
  total: { en: "Total sales", ar: "إجمالي المبيعات" },
  billed: { en: "Billed to customers", ar: "المبلغ المفوتر" },
  billedNote: {
    en: "Store orders with VAT and delivery, and partner sales",
    ar: "طلبات المتجر مع الضريبة والتوصيل، ومبيعات المحلات الشريكة",
  },
} satisfies Record<string, Words>;

const PAYMENT_METHODS: Record<string, Words> = {
  cod: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
  cash: { en: "Cash", ar: "نقداً" },
  card: { en: "Card", ar: "بطاقة" },
  online: { en: "Card", ar: "بطاقة" },
  tap: { en: "Card", ar: "بطاقة" },
  benefit: { en: "BenefitPay", ar: "بنفت باي" },
  benefitpay: { en: "BenefitPay", ar: "بنفت باي" },
  bank_transfer: { en: "Bank transfer", ar: "تحويل بنكي" },
  transfer: { en: "Transfer", ar: "تحويل" },
  gift_card: { en: "Gift card", ar: "بطاقة هدية" },
  incubator_receivable: { en: "Partner shop", ar: "محل شريك" },
  unknown: { en: "Not recorded", ar: "غير مسجّلة" },
};

const PAYMENT_STATUSES: Record<string, Words> = {
  paid: { en: "Paid", ar: "مدفوع" },
  partially_paid: { en: "Part paid", ar: "مدفوع جزئياً" },
  unpaid: { en: "Unpaid", ar: "غير مدفوع" },
  pending: { en: "Awaiting payment", ar: "بانتظار الدفع" },
  awaiting_payment: { en: "Awaiting payment", ar: "بانتظار الدفع" },
  refunded: { en: "Refunded", ar: "مسترد" },
  partially_refunded: { en: "Part refunded", ar: "مسترد جزئياً" },
  failed: { en: "Failed", ar: "فشل" },
  voided: { en: "Voided", ar: "ملغى" },
};

const FULFILLMENT: Record<string, Words> = {
  delivery: { en: "Delivery", ar: "توصيل" },
  pickup: { en: "Pickup", ar: "استلام" },
  digital: { en: "Digital", ar: "رقمي" },
  appointment: { en: "Appointment", ar: "موعد" },
  incubator: { en: "Partner shop", ar: "محل شريك" },
  unknown: { en: "Not recorded", ar: "غير مسجّلة" },
};

const CHANNELS: Record<string, Words> = {
  storefront: { en: "Online store", ar: "المتجر الإلكتروني" },
  admin: { en: "By staff", ar: "من الإدارة" },
  pos: { en: "In store", ar: "في المحل" },
  whatsapp: { en: "WhatsApp", ar: "واتساب" },
  instagram: { en: "Instagram", ar: "إنستغرام" },
};

const ORDER_STATUSES: Record<string, Words> = {
  draft: { en: "Draft", ar: "مسودة" },
  pending: { en: "Pending", ar: "قيد الانتظار" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
  canceled: { en: "Cancelled", ar: "ملغي" },
  refunded: { en: "Refunded", ar: "مسترد" },
  voided: { en: "Voided", ar: "ملغى" },
  failed: { en: "Failed", ar: "فشل" },
  archived: { en: "Archived", ar: "مؤرشف" },
  completed: { en: "Completed", ar: "مكتمل" },
  confirmed: { en: "Confirmed", ar: "مؤكد" },
  processing: { en: "Processing", ar: "قيد التجهيز" },
  sent_to_tailor: { en: "At the workshop", ar: "في الورشة" },
};

/** A code in words; a code with no words is shown as written, its underscores as spaces. */
function wordsFor(table: Record<string, Words>, code: unknown, lang: ReportLang) {
  const text = String(code ?? "").trim();
  if (!text) return "";
  const words = table[text.toLowerCase()];
  return words ? words[lang] : text.replace(/_/g, " ");
}

export const paymentMethodWords = (code: unknown, lang: ReportLang) =>
  wordsFor(PAYMENT_METHODS, code || "unknown", lang);
export const paymentStatusWords = (code: unknown, lang: ReportLang) =>
  wordsFor(PAYMENT_STATUSES, code, lang);
export const fulfillmentWords = (code: unknown, lang: ReportLang) =>
  wordsFor(FULFILLMENT, code || "unknown", lang);
export const channelWords = (code: unknown, lang: ReportLang) => wordsFor(CHANNELS, code, lang);
export const orderStatusWords = (code: unknown, lang: ReportLang) =>
  wordsFor(ORDER_STATUSES, code, lang);
