export type PaymentMethodFilter = "all" | "benefit" | "cod" | "card";
export type CanonicalPaymentMethod = Exclude<PaymentMethodFilter, "all">;

const PAYMENT_METHOD_ALIASES: Record<CanonicalPaymentMethod, ReadonlySet<string>> = {
  benefit: new Set(["benefit", "benefitpay", "benefit_pay", "bank_transfer"]),
  cod: new Set(["cod", "cash", "cash_on_delivery", "cash on delivery"]),
  card: new Set([
    "card",
    "tap",
    "creimax",
    "credit",
    "credit_card",
    "debit_card",
    "apple_pay",
    "google_pay",
  ]),
};

export function normalizePaymentMethod(
  paymentMethod: string | null | undefined,
): CanonicalPaymentMethod | null {
  const normalized = String(paymentMethod ?? "")
    .trim()
    .toLowerCase();

  for (const method of ["benefit", "cod", "card"] as const) {
    if (PAYMENT_METHOD_ALIASES[method].has(normalized)) return method;
  }

  return null;
}

export function matchesPaymentMethodFilter(
  paymentMethod: string | null | undefined,
  filter: PaymentMethodFilter,
): boolean {
  return filter === "all" || normalizePaymentMethod(paymentMethod) === filter;
}

export function getPaymentMethodLabel(
  paymentMethod: string | null | undefined,
  lang: "en" | "ar",
): string | null {
  const method = normalizePaymentMethod(paymentMethod);
  if (method === "card") return lang === "ar" ? "بطاقة" : "Card";
  if (method === "cod") return lang === "ar" ? "الدفع عند الاستلام" : "Cash on Delivery";
  if (method === "benefit") return lang === "ar" ? "بنفت" : "Benefit";
  return null;
}

export function getStoredPaymentMethodPresentation(
  paymentMethod: string | null | undefined,
  lang: "en" | "ar",
): { label: string; recognized: boolean; rawValue: string | null } {
  const rawValue = String(paymentMethod ?? "").trim() || null;
  const localized = getPaymentMethodLabel(rawValue, lang);
  if (localized) return { label: localized, recognized: true, rawValue };
  if (rawValue) {
    return {
      label: lang === "ar" ? `غير معروفة: ${rawValue}` : `Unrecognized: ${rawValue}`,
      recognized: false,
      rawValue,
    };
  }
  return {
    label: lang === "ar" ? "غير مسجلة" : "Not recorded",
    recognized: false,
    rawValue: null,
  };
}
