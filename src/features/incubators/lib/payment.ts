import {
  PAYMENT_METHODS,
  methodLabel,
  type PaymentMethod,
} from "@/features/supplier-orders/lib/supplier-account";

/**
 * A payment a partner shop makes to the store, as the dialog takes it: the same four ways to
 * pay as a payment to a supplier, an amount no more than the partner owes, on a day not after
 * today. Payments recorded before kept their method as typed, and read as typed.
 */

type Lang = "ar" | "en";

export { PAYMENT_METHODS as PARTNER_PAYMENT_METHODS, type PaymentMethod };

/** A payment's method in words: one of the four in the reader's language, else as it was typed. */
export function paymentMethodWords(method: string | null | undefined, lang: Lang): string | null {
  const raw = method?.trim();
  if (!raw) return null;
  return (PAYMENT_METHODS as readonly string[]).includes(raw)
    ? methodLabel(raw as PaymentMethod, lang)
    : raw;
}

export type PaymentForm = { amount: string; date: string; method: PaymentMethod | null };

export type PaymentProblem = "amount" | "too_much" | "date" | "method";

/** What stops the payment being recorded, or null. Amounts are kept to the fils. */
export function partnerPaymentProblem(
  form: PaymentForm,
  due: number,
  today: string,
): PaymentProblem | null {
  const text = form.amount.trim();
  const amount = Number(text);
  if (!text || !Number.isFinite(amount) || amount <= 0 || !/^\d+(\.\d{1,3})?$/.test(text)) {
    return "amount";
  }
  if (Math.round(amount * 1000) > Math.round(due * 1000)) return "too_much";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || form.date > today) return "date";
  if (!form.method) return "method";
  return null;
}

/** The sentence under a field that holds the payment back. */
export function paymentProblemText(problem: PaymentProblem, due: string, lang: Lang): string {
  const ar = lang === "ar";
  switch (problem) {
    case "amount":
      return ar
        ? "اكتب مبلغاً أكبر من صفر، بثلاث خانات عشرية على الأكثر."
        : "Type an amount above zero, with at most three decimals.";
    case "too_much":
      return ar ? `المبلغ أكثر مما عليهم (${due}).` : `That is more than they owe (${due}).`;
    case "date":
      return ar
        ? "اختر يوم الاستلام، اليوم أو قبله."
        : "Choose the day it was received: today or before.";
    case "method":
      return ar ? "اختر طريقة الدفع." : "Choose how it was paid.";
  }
}
