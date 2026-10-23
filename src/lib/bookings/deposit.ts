/**
 * What a shopper is told about a booking's deposit, and what checkout asks for
 * now. One reading for every page that mentions it (the service's page, the
 * booking page, the hold at checkout, the service's terms, the payment), so none
 * of them promises what the store does not take.
 *
 * A booking pays its deposit by card (orderChargePlan) or by BenefitPay (the
 * transfer pays the deposit only, approve_benefit_payment records it), and is
 * not paid in cash while there is a deposit (trg_orders_booking_deposit_cod;
 * migration 20261023100000). A store that takes neither a card nor BenefitPay
 * takes no deposit, and a catalog store takes no payment at all. When the rest
 * is due is the store's booking terms (`balance_due_days`); with none written
 * it is due on the day, when the service is carried out.
 */
import { isCatalogMode } from "@/lib/storefront-mode";
import { depositOf } from "@/lib/payments/charge-plan";
import type { AdvanceSplit } from "@/lib/payments/advance-payment";

export type DepositSettings = {
  storefront_mode?: string | null;
  card_enabled?: boolean | null;
  benefit_enabled?: boolean | null;
};

/** Whether the store can take a deposit: it is paid online, by card or BenefitPay. */
export const takesDeposits = (settings: DepositSettings | null | undefined): boolean =>
  Boolean((settings?.card_enabled || settings?.benefit_enabled) && !isCatalogMode(settings));

/** The deposit a booking really takes, as a percentage (0: none; 100: everything when booking). */
export function takenDepositPercent(
  depositPercent: number | null | undefined,
  settings: DepositSettings | null | undefined,
): number {
  const percent = Number(depositPercent ?? 0);
  if (!(percent > 0) || !takesDeposits(settings)) return 0;
  return Math.min(percent, 100);
}

/** Everything the sentence needs, from the store's booking rules, settings and terms. */
export type DepositTerms = { percent: number; balanceDueDays: number | null };

export function depositTerms(
  rules: { deposit_percent?: number | null } | null | undefined,
  settings: DepositSettings | null | undefined,
  policy: { balance_due_days?: number | null } | null | undefined,
): DepositTerms {
  return {
    percent: takenDepositPercent(rules?.deposit_percent, settings),
    balanceDueDays: policy?.balance_due_days ?? null,
  };
}

const arDays = (days: number) =>
  days === 1 ? "بيوم" : days === 2 ? "بيومين" : days <= 10 ? `بـ ${days} أيام` : `بـ ${days} يوماً`;

/** When the rest is paid: "on the day", or "3 days before". */
export function balanceWhen(balanceDueDays: number | null | undefined, isAr: boolean): string {
  const days = Number(balanceDueDays ?? 0);
  if (!(days > 0)) return isAr ? "يوم الموعد" : "on the day";
  return isAr ? `قبل الموعد ${arDays(days)}` : `${days === 1 ? "1 day" : `${days} days`} before`;
}

/**
 * "A 20% deposit when you book, the rest on the day." Null when the booking
 * takes no deposit.
 */
export function depositSentence(terms: DepositTerms, isAr: boolean): string | null {
  const { percent, balanceDueDays } = terms;
  if (!(percent > 0)) return null;
  if (percent >= 100) {
    return isAr ? "يُدفع المبلغ كاملاً عند الحجز." : "The whole amount is paid when you book.";
  }
  const rest = balanceWhen(balanceDueDays, isAr);
  return isAr
    ? `عربون ${percent}% عند الحجز، والباقي ${rest}.`
    : `A ${percent}% deposit when you book, the rest ${rest}.`;
}

/**
 * How a booking's checkout divides under its deposit: what is paid now and what
 * stays due, rounded as the database rounds it (up to the fils). Null when the
 * booking takes no deposit.
 */
export function bookingDepositSplit(total: number, terms: DepositTerms): AdvanceSplit | null {
  const { percent, balanceDueDays } = terms;
  if (!(percent > 0)) return null;
  const deposit = { balanceDueDays };
  const amount = depositOf(total, percent);
  if (amount === null) {
    return { applies: true, percent: 100, of: "order", dueNow: total, balance: 0, deposit };
  }
  return {
    applies: true,
    percent,
    of: "order",
    dueNow: amount,
    balance: Math.round((total - amount) * 1000) / 1000,
    deposit,
  };
}

/**
 * What checkout asks for now: the store's advance when one reaches the order (or the whole
 * total the shopper chose), else a booking's own deposit, else nothing up front. The card charge
 * and the transfer's approval read them in the same order (orderChargePlan,
 * approve_benefit_payment).
 */
export function upfrontSplit(advance: AdvanceSplit, deposit: AdvanceSplit | null): AdvanceSplit {
  return !advance.applies && deposit ? deposit : advance;
}

/** On an appointment's invoice: the deposit line only when this booking took a deposit. */
export function invoiceDepositPercent(
  booking: { deposit_amount?: number | string | null } | null | undefined,
  depositPercent: number | null | undefined,
): number {
  return Number(booking?.deposit_amount ?? 0) > 0 ? Number(depositPercent ?? 0) : 0;
}
