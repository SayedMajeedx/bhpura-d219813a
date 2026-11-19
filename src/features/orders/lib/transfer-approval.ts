/**
 * What staff read after approving a transfer (BenefitPay or bank), or when it is refused.
 *
 * The database decides what an approval records (`approve_benefit_payment`): only the advance
 * of an order placed under an advance rule, with the balance collected on delivery, a booking's
 * deposit (migration 20261023100000), or the whole total. The message says which, so nobody reads "paid" on an order that still owes,
 * and says when a booking paid after its hold ran out lost its day meanwhile (migration 20261026100000).
 */

import type { ConfirmFact } from "@/components/ui/app-confirm";
import type { ConfirmOptions } from "@/components/ui/confirm-dialog";
import { expectedAdvance, type AdvanceOrderSource } from "@/features/orders/lib/expected-advance";

type Lang = "en" | "ar";

export type TransferApproval = {
  advanceOnly: boolean;
  alreadyPaid: boolean;
  /** The payment is recorded, and the booking was not confirmed: its day was taken after its hold ran out. */
  slotTaken?: boolean;
};

export function transferApprovedMessage(
  result: TransferApproval,
  lang: Lang,
  /** An appointment's transfer paid its booking's deposit: the rest is due by the booking's terms. */
  options: { appointment?: boolean } = {},
): string {
  if (result.slotTaken) {
    return lang === "ar"
      ? "تم تسجيل الدفع، لكن الموعد حُجز لعميل آخر بعد انتهاء المهلة فلم يُؤكَّد. انقل الحجز إلى موعد متاح أو ألغِه وأعد المبلغ"
      : "Payment recorded, but the date was booked by another customer after the hold ran out, so it was not confirmed. Move the booking to a free time, or cancel it and return the money";
  }
  if (result.alreadyPaid) {
    return lang === "ar" ? "تم اعتماد هذا الدفع مسبقاً" : "This payment was already approved";
  }
  if (result.advanceOnly && options.appointment) {
    return lang === "ar"
      ? "تم اعتماد العربون وتأكيد الموعد، والمتبقي يُحصَّل حسب شروط الحجز"
      : "Deposit approved and the date confirmed; the rest is collected by the booking terms";
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

/**
 * Whether the order's transfer receipt is still to be checked and so shown at the top of the
 * order (`PendingTransferReview`). Once approved it is a record and sits with the money.
 */
export function receiptOnTop(
  order:
    | {
        payment_method?: string | null;
        benefit_receipt_key?: string | null;
        payment_status?: string | null;
      }
    | null
    | undefined,
): boolean {
  return (
    order?.payment_method === "benefit" &&
    Boolean(order.benefit_receipt_key) &&
    !transferApproved(order.payment_status)
  );
}

/** Whether a transfer's approval is on record: in full, or for the advance. */
export function transferApproved(paymentStatus: string | null | undefined): boolean {
  return ["paid", "partially_paid", "partial"].includes(String(paymentStatus ?? "").toLowerCase());
}

type AskOrder = AdvanceOrderSource & {
  benefit_receipt_key?: string | null;
  customer_name_snapshot?: string | null;
};

/**
 * What staff are asked before approving a transfer (the review of 2026-11-19: it was approved on
 * one tap, with no amount, and an approval cannot be rejected afterwards): the amount the
 * approval records, the order's total when that is only its advance, and whether a receipt was
 * uploaded to check against. When the advance cannot be worked out here (a category rule), the
 * amount is left to the order page rather than guessed.
 */
export function transferApprovalAsk(
  order: AskOrder,
  lang: Lang,
  money: (amount: number) => string,
): ConfirmOptions {
  const ar = lang === "ar";
  const total = Number(order.total) || 0;
  const paid = Number(order.advance_paid) || 0;
  const asked = Array.isArray(order.advance_rules) || Number(order.advance_percent) > 0;
  const expected = expectedAdvance(order);
  const amount = expected
    ? expected.split.dueNow
    : asked
      ? null
      : Math.round((total - paid) * 1000) / 1000;
  const facts: ConfirmFact[] = [];
  if (order.customer_name_snapshot) {
    facts.push({ label: ar ? "العميل" : "Customer", value: order.customer_name_snapshot });
  }
  if (amount !== null) {
    facts.push({ label: ar ? "المبلغ المعتمد" : "Amount to approve", value: money(amount) });
  }
  if (amount === null || Math.abs(amount - total) > 0.0005) {
    facts.push({ label: ar ? "إجمالي الطلب" : "Order total", value: money(total) });
  }
  facts.push({
    label: ar ? "الإيصال" : "Receipt",
    value: order.benefit_receipt_key
      ? ar
        ? "مرفوع: طابقه بالمبلغ"
        : "Uploaded: match it to the amount"
      : ar
        ? "لا يوجد: تحقق من حسابك"
        : "None: check your account",
  });
  return {
    title: ar ? "اعتماد التحويل؟" : "Approve this transfer?",
    description: ar
      ? "تأكد أن المبلغ وصل حسابك. لا يمكن رفض التحويل بعد اعتماده."
      : "Make sure the money reached your account. An approved transfer cannot be rejected later.",
    facts,
    confirmLabel: ar ? "اعتماد التحويل" : "Approve the transfer",
    cancelLabel: ar ? "ليس الآن" : "Not yet",
  };
}
