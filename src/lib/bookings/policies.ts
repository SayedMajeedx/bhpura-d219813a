/**
 * A store's booking policies (booking_policies; migration 20261002160000): when
 * the balance is due, how long a booking can be moved, whether the deposit
 * comes back, and free-text terms. Pure rules: the sentences a customer reads,
 * the balance's due date, and the merchant's form.
 */

export type BookingPolicy = {
  balance_due_days: number | null;
  reschedule_months: number | null;
  deposit_refundable: boolean;
  terms_en: string | null;
  terms_ar: string | null;
};

export const NO_POLICY: BookingPolicy = {
  balance_due_days: null,
  reschedule_months: null,
  deposit_refundable: false,
  terms_en: null,
  terms_ar: null,
};

const DAY_MS = 86_400_000;

/** The day the balance is due: `days` before the event (ISO dates). */
export function balanceDueDate(eventDay: string, days: number): string {
  return new Date(Date.parse(`${eventDay}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);
}

const daysText = (days: number, isAr: boolean) =>
  isAr
    ? days === 0
      ? "يوم المناسبة"
      : days === 1
        ? "يوم واحد"
        : days === 2
          ? "يومين"
          : `${days} أيام`
    : days === 1
      ? "1 day"
      : `${days} days`;

const monthsText = (months: number, isAr: boolean) =>
  isAr
    ? months === 1
      ? "شهر"
      : months === 2
        ? "شهرين"
        : months <= 10
          ? `${months} أشهر`
          : `${months} شهراً`
    : months === 1
      ? "1 month"
      : `${months} months`;

/** The policy sentences in the reader's language, in the order a customer meets them. `depositPercent` is the store's deposit (0: none). */
export function policyLines(
  policy: BookingPolicy,
  options: { isAr: boolean; depositPercent?: number; eventDay?: string | null },
): string[] {
  const { isAr, depositPercent = 0, eventDay } = options;
  const lines: string[] = [];
  if (depositPercent > 0) {
    lines.push(
      policy.deposit_refundable
        ? isAr
          ? `عربون ${depositPercent}% يُسترد عند الإلغاء.`
          : `The ${depositPercent}% deposit is refunded if you cancel.`
        : isAr
          ? `عربون ${depositPercent}% غير قابل للاسترداد.`
          : `The ${depositPercent}% deposit is non-refundable.`,
    );
  }
  if (policy.balance_due_days !== null) {
    const days = policy.balance_due_days;
    const due = eventDay ? balanceDueDate(eventDay, days) : null;
    lines.push(
      days === 0
        ? isAr
          ? "يُدفع الرصيد المتبقي في يوم المناسبة."
          : "The balance is due on the day of the event."
        : isAr
          ? `يُدفع الرصيد المتبقي قبل المناسبة بـ ${daysText(days, true)}${due ? ` (${due})` : ""}.`
          : `The balance is due ${daysText(days, false)} before the event${due ? ` (${due})` : ""}.`,
    );
  }
  if (policy.reschedule_months !== null && policy.reschedule_months > 0) {
    lines.push(
      isAr
        ? `يمكن نقل الحجز إلى موعد آخر خلال ${monthsText(policy.reschedule_months, true)}.`
        : `You can move your booking to another date within ${monthsText(policy.reschedule_months, false)}.`,
    );
  }
  const terms = (
    isAr ? policy.terms_ar || policy.terms_en : policy.terms_en || policy.terms_ar
  )?.trim();
  if (terms) lines.push(terms);
  return lines;
}

/** What is still to pay on a booking, and the day it is due (null: nothing to pay or no rule). */
export function balanceReminder(
  policy: BookingPolicy,
  booking: { event_date: string; total: number; paid: number },
): { balance: number; due: string | null } | null {
  const balance = Math.round((booking.total - booking.paid) * 1000) / 1000;
  if (balance <= 0) return null;
  return {
    balance,
    due:
      policy.balance_due_days === null
        ? null
        : balanceDueDate(booking.event_date, policy.balance_due_days),
  };
}

// ── The merchant's form ─────────────────────────────────────────────────────

export type PolicyForm = {
  balance_due_days: string;
  reschedule_months: string;
  deposit_refundable: boolean;
  terms_en: string;
  terms_ar: string;
};

export const policyFormFrom = (policy: BookingPolicy | null): PolicyForm => ({
  balance_due_days: policy?.balance_due_days == null ? "" : String(policy.balance_due_days),
  reschedule_months: policy?.reschedule_months == null ? "" : String(policy.reschedule_months),
  deposit_refundable: policy?.deposit_refundable ?? false,
  terms_en: policy?.terms_en ?? "",
  terms_ar: policy?.terms_ar ?? "",
});

const wholeNumber = (text: string, max: number): number | null | typeof Number.NaN => {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : Number.NaN;
};

/** Why the form can't be saved, or null. */
export function policyFormError(form: PolicyForm, isAr: boolean): string | null {
  if (Number.isNaN(wholeNumber(form.balance_due_days, 365))) {
    return isAr
      ? "أيام الرصيد: رقم صحيح من 0 إلى 365."
      : "Balance days: a whole number from 0 to 365.";
  }
  if (Number.isNaN(wholeNumber(form.reschedule_months, 60))) {
    return isAr
      ? "أشهر النقل: رقم صحيح من 0 إلى 60."
      : "Months to move: a whole number from 0 to 60.";
  }
  if (form.terms_en.length > 2000 || form.terms_ar.length > 2000) {
    return isAr ? "الشروط أطول من 2000 حرف." : "The terms are over 2000 characters.";
  }
  return null;
}

/** The booking_policies columns a form saves. */
export function policyColumns(form: PolicyForm): BookingPolicy {
  return {
    balance_due_days: wholeNumber(form.balance_due_days, 365) as number | null,
    reschedule_months: wholeNumber(form.reschedule_months, 60) as number | null,
    deposit_refundable: form.deposit_refundable,
    terms_en: form.terms_en.trim() || null,
    terms_ar: form.terms_ar.trim() || null,
  };
}
