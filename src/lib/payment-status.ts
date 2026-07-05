export type PaymentBadge = "paid" | "partial" | "unpaid";

const PAID_STATUSES = new Set(["paid", "shipped", "completed"]);

export function derivePaymentStatus(
  orderStatus: string | null | undefined,
  total: number,
  advance: number,
): PaymentBadge {
  const t = Number(total || 0);
  const a = Number(advance || 0);
  if (orderStatus && PAID_STATUSES.has(orderStatus)) return "paid";
  if (t > 0 && a >= t) return "paid";
  if (a > 0 && a < t) return "partial";
  return "unpaid";
}

export const PAYMENT_BADGE_CLASSES: Record<PaymentBadge, string> = {
  paid: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
  partial: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  unpaid: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
};

export const PAYMENT_BADGE_KEY: Record<PaymentBadge, string> = {
  paid: "payStatus.paid",
  partial: "payStatus.partial",
  unpaid: "payStatus.unpaid",
};

export const PAYMENT_BADGE_LABEL: Record<PaymentBadge, { en: string; ar: string }> = {
  paid: { en: "Paid", ar: "مدفوع" },
  partial: { en: "Partially Paid", ar: "مدفوع جزئياً" },
  unpaid: { en: "Unpaid", ar: "غير مدفوع" },
};
