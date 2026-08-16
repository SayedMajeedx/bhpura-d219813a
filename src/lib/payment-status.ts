export type PaymentBadge = "paid" | "partial" | "unpaid" | "refunded";

export const PAYMENT_BADGE_VALUES: PaymentBadge[] = ["unpaid", "partial", "paid", "refunded"];

export function resolvePaymentStatus(
  manual: string | null | undefined,
  orderStatus: string | null | undefined,
  total: number,
  advance: number,
): PaymentBadge {
  if (manual) {
    const norm = manual.toLowerCase();
    if (norm === "paid") return "paid";
    if (norm === "partial" || norm === "partially_paid") return "partial";
    if (norm === "unpaid") return "unpaid";
    if (norm === "refunded") return "refunded";
  }
  return derivePaymentStatus(orderStatus, total, advance);
}

export function derivePaymentStatus(
  orderStatus: string | null | undefined,
  total: number,
  advance: number,
): PaymentBadge {
  const t = Number(total || 0);
  const a = Number(advance || 0);
  const remaining = +(t - a).toFixed(3);
  // Fully paid: remaining is exactly 0 (and there's a total), or manually marked paid with no outstanding balance
  if (t > 0 && remaining <= 0) return "paid";
  if (orderStatus === "paid" && remaining <= 0) return "paid";
  // Partial: some advance paid but still a remaining balance
  if (a > 0 && remaining > 0) return "partial";
  return "unpaid";
}

export const PAYMENT_BADGE_CLASSES: Record<PaymentBadge, string> = {
  paid: "bg-emerald-50 text-emerald-800 border-emerald-200 font-bold dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80",
  partial:
    "bg-amber-50 text-amber-800 border-amber-300 font-bold dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80",
  unpaid:
    "bg-rose-50 text-rose-700 border-rose-200 font-bold dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/80",
  refunded:
    "bg-purple-50 text-purple-800 border-purple-200 font-bold dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/80",
};

export const PAYMENT_BADGE_KEY: Record<PaymentBadge, string> = {
  paid: "payStatus.paid",
  partial: "payStatus.partial",
  unpaid: "payStatus.unpaid",
  refunded: "payStatus.refunded",
};

export const PAYMENT_BADGE_LABEL: Record<PaymentBadge, { en: string; ar: string }> = {
  paid: { en: "Paid", ar: "مدفوع" },
  partial: { en: "Partially Paid", ar: "مدفوع جزئياً" },
  unpaid: { en: "Unpaid", ar: "غير مدفوع" },
  refunded: { en: "Refunded", ar: "مسترجع" },
};

export function formatPaymentBadgeDetail(
  badge: PaymentBadge,
  total: number,
  advance: number,
  currency: string = "BHD",
  lang: "en" | "ar" = "en",
): string {
  const isAr = lang === "ar";
  const baseLabel = PAYMENT_BADGE_LABEL[badge]?.[lang] || badge;
  if (badge === "partial" && advance > 0) {
    const due = Math.max(0, total - advance);
    if (isAr) {
      return `${baseLabel} (مدفوع ${advance.toFixed(3)} ${currency} / متبقي ${due.toFixed(3)} ${currency})`;
    }
    return `${baseLabel} (Paid ${currency} ${advance.toFixed(3)} / Due ${currency} ${due.toFixed(3)})`;
  }
  return baseLabel;
}
