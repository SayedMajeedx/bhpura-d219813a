/**
 * What staff read after approving a transfer (BenefitPay or bank), or when it is refused.
 *
 * The database decides what an approval records (`approve_benefit_payment`): only the advance
 * of an order placed under an advance rule, with the balance collected on delivery, or the
 * whole total. The message says which, so nobody reads "paid" on an order that still owes.
 */

type Lang = "en" | "ar";

export type TransferApproval = { advanceOnly: boolean; alreadyPaid: boolean };

export function transferApprovedMessage(result: TransferApproval, lang: Lang): string {
  if (result.alreadyPaid) {
    return lang === "ar" ? "تم اعتماد هذا الدفع مسبقاً" : "This payment was already approved";
  }
  if (result.advanceOnly) {
    return lang === "ar"
      ? "تم اعتماد العربون، والمتبقي يُحصَّل عند التسليم"
      : "Advance approved; the balance is collected on delivery";
  }
  return lang === "ar" ? "تم التحقق من الدفع واعتماده" : "Payment verified and approved";
}

const REFUSALS: Record<string, { en: string; ar: string }> = {
  FORBIDDEN: {
    en: "Only an admin of this store can approve a payment",
    ar: "اعتماد الدفع متاح لمدير المتجر فقط",
  },
  NOT_A_TRANSFER_ORDER: {
    en: "This order is not paid by transfer; record its payment from the order page",
    ar: "هذا الطلب ليس مدفوعاً بالتحويل؛ سجّل الدفع من صفحة الطلب",
  },
  ORDER_NOT_FOUND: { en: "The order was not found", ar: "الطلب غير موجود" },
};

/** The reason an approval was refused, in words; the fallback when the reason is not known. */
export function transferRefusedMessage(error: unknown, lang: Lang): string {
  const text = String((error as { message?: unknown } | null)?.message ?? "");
  const code = Object.keys(REFUSALS).find((key) => text.includes(key));
  if (code) return REFUSALS[code][lang];
  return lang === "ar" ? "تعذر اعتماد الدفع" : "Could not approve the payment";
}

/** Whether a transfer's approval is on record: in full, or for the advance. */
export function transferApproved(paymentStatus: string | null | undefined): boolean {
  return ["paid", "partially_paid", "partial"].includes(String(paymentStatus ?? "").toLowerCase());
}
