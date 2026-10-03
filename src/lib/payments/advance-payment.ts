import { depositOf } from "@/lib/payments/charge-plan";

/**
 * A store's advance-payment rule (business_settings.advance_payment_enabled and
 * advance_payment_percent): when it is on, an order is complete only once a share
 * of its total is paid online (card or BenefitPay) and the rest is due later (on
 * delivery or at the event). The database refuses cash on delivery for such a
 * store (migration 20261003120000); these are the rules the screens use.
 */

export const ADVANCE_MIN_PERCENT = 1;
export const ADVANCE_MAX_PERCENT = 100;
export const DEFAULT_ADVANCE_PERCENT = 30;

export type AdvanceRule = { enabled: boolean; percent: number };

/** The rule from a store's settings: off unless switched on, with a percentage kept within 1 to 100. */
export function advanceRuleFrom(
  settings:
    | { advance_payment_enabled?: boolean | null; advance_payment_percent?: number | string | null }
    | null
    | undefined,
): AdvanceRule {
  const percent = Number(settings?.advance_payment_percent);
  return {
    enabled: settings?.advance_payment_enabled === true,
    percent:
      Number.isFinite(percent) && percent >= ADVANCE_MIN_PERCENT && percent <= ADVANCE_MAX_PERCENT
        ? percent
        : DEFAULT_ADVANCE_PERCENT,
  };
}

export type AdvanceSplit = {
  /** Whether the rule asks for anything at all. */
  applies: boolean;
  percent: number;
  /** What to pay now (the whole total at 100%). */
  dueNow: number;
  /** What stays due after the advance. */
  balance: number;
};

/** How an order's total divides into the advance and the balance. */
export function advanceSplit(total: number, rule: AdvanceRule): AdvanceSplit {
  const amount = Number(total) || 0;
  if (!rule.enabled || amount <= 0) {
    return { applies: false, percent: rule.percent, dueNow: amount, balance: 0 };
  }
  const advance = depositOf(amount, rule.percent);
  const dueNow = advance === null ? amount : Math.min(advance, amount);
  return {
    applies: true,
    percent: rule.percent,
    dueNow,
    balance: Math.round((amount - dueNow) * 1000) / 1000,
  };
}

/** The payment methods a customer can use: cash on delivery is not among them under the rule. */
export function methodsUnderAdvance<T extends { id: string }>(
  methods: readonly T[],
  rule: AdvanceRule,
): T[] {
  return rule.enabled ? methods.filter((method) => method.id !== "cod") : [...methods];
}

/** Why the percentage can't be saved, or null. */
export function advancePercentError(value: unknown, isAr: boolean): string | null {
  const percent = Number(value);
  if (value === "" || value === null || value === undefined || !Number.isFinite(percent)) {
    return isAr ? "اكتب نسبة الدفعة المقدمة." : "Enter the advance percentage.";
  }
  if (percent < ADVANCE_MIN_PERCENT || percent > ADVANCE_MAX_PERCENT) {
    return isAr ? "النسبة من 1% إلى 100%." : "The percentage must be from 1% to 100%.";
  }
  return null;
}

/** What the customer reads: the advance now and the balance later, in one or two short lines. */
export function advanceLines(
  split: AdvanceSplit,
  options: { isAr: boolean; money: (n: number) => string; balanceWhen?: "delivery" | "event" },
): string[] {
  if (!split.applies) return [];
  const { isAr, money } = options;
  const percent = Number.isInteger(split.percent)
    ? String(split.percent)
    : split.percent.toFixed(2);
  if (split.balance <= 0) {
    return [
      isAr
        ? `يُدفع المبلغ كاملاً الآن: ${money(split.dueNow)}`
        : `The full amount is paid now: ${money(split.dueNow)}`,
    ];
  }
  const when =
    options.balanceWhen === "event"
      ? isAr
        ? "يوم المناسبة"
        : "on the day of the event"
      : isAr
        ? "عند الاستلام"
        : "on delivery";
  return [
    isAr
      ? `الدفعة المقدمة (${percent}%) تُدفع الآن: ${money(split.dueNow)}`
      : `Advance payment (${percent}%) due now: ${money(split.dueNow)}`,
    isAr ? `المتبقي ${money(split.balance)} ${when}` : `Balance ${money(split.balance)} ${when}`,
  ];
}
