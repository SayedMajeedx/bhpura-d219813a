/**
 * What a shopper is told about a booking's deposit. One sentence for every
 * page that mentions it (the service's page, the booking page, the hold at
 * checkout, the service's terms), so none of them promises what the store does
 * not take.
 *
 * The deposit is taken by card only (orderChargePlan); a BenefitPay transfer
 * or cash pays the whole order. A store that does not take cards takes no
 * deposit, and a catalog store takes no payment at all. When the rest is due
 * is the store's booking terms (`balance_due_days`); with none written it is
 * due on the day, when the service is carried out.
 */
import { isCatalogMode } from "@/lib/storefront-mode";

export type DepositSettings = {
  storefront_mode?: string | null;
  card_enabled?: boolean | null;
  cod_enabled?: boolean | null;
  benefit_enabled?: boolean | null;
};

/** The deposit a booking really takes, as a percentage (0: none). */
export function takenDepositPercent(
  depositPercent: number | null | undefined,
  settings: DepositSettings | null | undefined,
): number {
  const percent = Number(depositPercent ?? 0);
  if (!(percent > 0) || !settings?.card_enabled || isCatalogMode(settings)) return 0;
  return percent;
}

/** Whether a card is the only way the store is paid (then "by card" goes without saying). */
export const cardIsOnlyMethod = (settings: DepositSettings | null | undefined): boolean =>
  Boolean(settings?.card_enabled && !settings.cod_enabled && !settings.benefit_enabled);

/** Everything the sentence needs, from the store's booking rules, settings and terms. */
export type DepositTerms = { percent: number; cardOnly: boolean; balanceDueDays: number | null };

export function depositTerms(
  rules: { deposit_percent?: number | null } | null | undefined,
  settings: DepositSettings | null | undefined,
  policy: { balance_due_days?: number | null } | null | undefined,
): DepositTerms {
  return {
    percent: takenDepositPercent(rules?.deposit_percent, settings),
    cardOnly: cardIsOnlyMethod(settings),
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
 * "Paying by card: a 20% deposit when you book, the rest on the day." Null when
 * the booking takes no deposit.
 */
export function depositSentence(terms: DepositTerms, isAr: boolean): string | null {
  const { percent, cardOnly, balanceDueDays } = terms;
  if (!(percent > 0)) return null;
  const rest = balanceWhen(balanceDueDays, isAr);
  if (isAr) {
    return `${cardOnly ? "" : "عند الدفع بالبطاقة: "}عربون ${percent}% عند الحجز، والباقي ${rest}.`;
  }
  return `${cardOnly ? "A" : "Paying by card: a"} ${percent}% deposit when you book, the rest ${rest}.`;
}

/** On an appointment's invoice: the deposit line only when this booking took a deposit. */
export function invoiceDepositPercent(
  booking: { deposit_amount?: number | string | null } | null | undefined,
  depositPercent: number | null | undefined,
): number {
  return Number(booking?.deposit_amount ?? 0) > 0 ? Number(depositPercent ?? 0) : 0;
}
