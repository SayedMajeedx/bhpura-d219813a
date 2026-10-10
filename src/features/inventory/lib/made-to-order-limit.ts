/**
 * Pure rules for the "how many can still be made to order" field of a product: what the staff
 * typed (nothing means no limit, a whole number from 0 up is the pieces left) and what the
 * product's current number reads as.
 */

export type MadeToOrderLimitInput =
  { ok: true; value: number | null } | { ok: false; error: { ar: string; en: string } };

/** The limit the staff typed: empty is "no limit", otherwise a whole number from 0 up. */
export function parseMadeToOrderLimit(text: string): MadeToOrderLimitInput {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) {
    return {
      ok: false,
      error: {
        ar: "اكتب عدداً صحيحاً من 0 فأكثر، أو اترك الخانة فارغة لعدم التحديد.",
        en: "Enter a whole number from 0 up, or leave it empty for no limit.",
      },
    };
  }
  return { ok: true, value };
}

/** What the product's current limit says, for the line under the field. */
export function madeToOrderLimitSummary(
  available: number | null | undefined,
  lang: "ar" | "en",
): string {
  const isAr = lang === "ar";
  if (available === null || available === undefined) {
    return isAr
      ? "لا يوجد حد: يمكن طلب هذه القطعة حسب الطلب بلا عدد محدد."
      : "No limit: this piece can be ordered made to order without end.";
  }
  if (available === 0) {
    return isAr
      ? "اكتمل العدد: لا يمكن طلب هذه القطعة حسب الطلب الآن (القطع الجاهزة لا تتأثر)."
      : "Limit reached: it cannot be ordered made to order now (ready sizes are not affected).";
  }
  return isAr
    ? `يمكن صنع ${available} بعد. ينقص العدد مع كل طلب ويعود عند إلغاء الطلب.`
    : `${available} more can be made. The number goes down with each order and comes back when an order is cancelled.`;
}
