/**
 * What staff read when the database refuses something on the partners' page. The functions
 * answer with a code; every code has its words in both languages, so nobody reads a code, or
 * Arabic on an English screen.
 */

type Lang = "ar" | "en";

const MESSAGES: Record<string, { en: string; ar: string }> = {
  INSUFFICIENT_MAIN_STOCK: {
    en: "The store does not have that many pieces to transfer",
    ar: "الكمية في مخزون المحل غير كافية للتحويل",
  },
  INSUFFICIENT_INCUBATOR_STOCK: {
    en: "The partner does not hold that many pieces (an order may have taken some)",
    ar: "الكمية الموجودة عند الحاضنة غير كافية (قد يكون طلب أخذ بعضها)",
  },
  INSUFFICIENT_STOCK: {
    en: "There is not enough stock for this",
    ar: "المخزون غير كافٍ لهذه العملية",
  },
  INSUFFICIENT_PACKAGING_STOCK: {
    en: "There is not enough packaging material in stock for this sale",
    ar: "مواد التغليف في المخزون غير كافية لهذه البيعة",
  },
  PAYMENT_EXCEEDS_AMOUNT_DUE: {
    en: "The payment is more than the partner owes",
    ar: "الدفعة أكبر من المبلغ المستحق",
  },
  INVALID_PAYMENT_AMOUNT: {
    en: "Enter an amount above zero",
    ar: "أدخل مبلغاً أكبر من صفر",
  },
  INVALID_QUANTITY: {
    en: "Enter a quantity above zero",
    ar: "أدخل كمية أكبر من صفر",
  },
  PAID_SALE_CANNOT_BE_REVERSED: {
    en: "This sale has a payment against it and cannot be reversed",
    ar: "لا يمكن إلغاء بيعة سُجّلت عليها دفعة",
  },
  SALE_ALREADY_REVERSED: {
    en: "This sale was already reversed",
    ar: "تم إلغاء هذه البيعة مسبقاً",
  },
  INVALID_INCUBATOR_ITEM_TERMS: {
    en: "Check the price and the commission: neither can be negative, and a percentage cannot exceed 100",
    ar: "راجع السعر والعمولة: لا يمكن أن يكونا بالسالب، ولا تتجاوز النسبة 100",
  },
  PARTNER_STOCK_MOVES_WITH_ITS_PARTNER: {
    en: "A partner's pieces change with a transfer, a return or a sale, not by typing a number",
    ar: "قطع الحاضنة تتغير بالتحويل أو الإرجاع أو البيع، وليس بكتابة رقم",
  },
  CROSS_BRAND_INCUBATOR_REFERENCE: {
    en: "This piece does not belong to this store",
    ar: "هذه القطعة لا تتبع هذا المتجر",
  },
  VARIANT_NOT_FOUND: { en: "The piece was not found", ar: "القطعة غير موجودة" },
  VOID_REASON_REQUIRED: {
    en: "Say why the payment is being voided (a few words)",
    ar: "اكتب سبب إلغاء الدفعة (بضع كلمات)",
  },
  PAYMENT_ALREADY_VOIDED: {
    en: "This payment was already voided",
    ar: "تم إلغاء هذه الدفعة مسبقاً",
  },
  NOTHING_TO_TRANSFER: {
    en: "Choose at least one piece to transfer",
    ar: "اختر قطعة واحدة على الأقل للتحويل",
  },
  TOO_MANY_PIECES_IN_ONE_TRANSFER: {
    en: "That is too many different pieces for one transfer; send them in two",
    ar: "عدد الأصناف كبير على تحويل واحد؛ قسّمه على تحويلين",
  },
  NOT_AUTHORIZED: {
    en: "You do not have permission to do this (or the partner is inactive)",
    ar: "لا تملك صلاحية هذه العملية (أو أن الحاضنة موقوفة)",
  },
};

const FALLBACK = { en: "Could not save", ar: "تعذر حفظ العملية" };

/**
 * A batch transfer's refusal names the piece it stopped on (`<code>:<variant id>`): the reason
 * in words, with that piece's own name in front when the screen knows it. Nothing was moved.
 */
export function batchTransferRefusal(
  error: unknown,
  pieceOf: (variantId: string) => string | null | undefined,
  lang: Lang,
): string {
  const text = String((error as { message?: unknown } | null)?.message ?? "");
  const variantId = /:([0-9a-f]{8}-[0-9a-f-]{27})\s*$/i.exec(text)?.[1] ?? null;
  const piece = variantId ? pieceOf(variantId) : null;
  const reason = incubatorErrorMessage(error, lang);
  const nothing = lang === "ar" ? "لم يُحوَّل شيء." : "Nothing was transferred.";
  return piece ? `${piece}: ${reason}. ${nothing}` : `${reason}. ${nothing}`;
}

/** The refusal in words. A reason that is not a known code is shown as it is. */
export function incubatorErrorMessage(error: unknown, lang: Lang): string {
  const text = String((error as { message?: unknown } | null)?.message ?? "").trim();
  // Longest code first: INSUFFICIENT_STOCK is also the start of nothing else, but a longer
  // code that contains a shorter one must win.
  const code = Object.keys(MESSAGES)
    .sort((a, b) => b.length - a.length)
    .find((key) => text.includes(key));
  if (code) return MESSAGES[code][lang];
  // A code nobody translated yet reads as a code: say the plain thing instead.
  if (!text || /^[A-Z0-9_]+(:.*)?$/.test(text)) return FALLBACK[lang];
  return text;
}
