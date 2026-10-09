/**
 * A store's advance-payment rule (business_settings.advance_payment_enabled,
 * advance_payment_percent and advance_payment_scope): when it is on, an order the
 * rule reaches is complete only once a share of it is paid online (card or
 * BenefitPay); the rest is due later (on delivery or at the event).
 *
 * Which part of an order the rule reaches is the scope:
 *   all                        every order, whole
 *   made_to_order              only the made-to-order lines (services),
 *                              after discounts and with their share of the tax,
 *                              never the delivery fee
 *   delivery                   an order that is delivered, whole, delivery fee included
 *   made_to_order_or_delivery  a delivered order whole; any other order only its
 *                              made-to-order lines
 *   rules_only                 no general share at all: only the store's own rules ask
 *                              for an advance (the percentage is not used)
 *
 * advanceDue is the same arithmetic as the database's order_advance_due (migration
 * 20261003140000), which is what charges, approves and refuses; this copy is for
 * the checkout's preview and the settings screen, and tests/advance-payment-parity
 * runs the two against each other.
 */

import {
  advanceParts,
  advanceRulesDue,
  defaultAdvanceRules,
  type AdvanceOrder,
  type AdvanceRuleDef,
} from "@/lib/payments/advance-rules";

export type { AdvanceOrder } from "@/lib/payments/advance-rules";

export const ADVANCE_MIN_PERCENT = 1;
export const ADVANCE_MAX_PERCENT = 100;
export const DEFAULT_ADVANCE_PERCENT = 30;

export const ADVANCE_SCOPES = [
  "all",
  "made_to_order",
  "delivery",
  "made_to_order_or_delivery",
  "rules_only",
] as const;
export type AdvanceScope = (typeof ADVANCE_SCOPES)[number];
export const DEFAULT_ADVANCE_SCOPE: AdvanceScope = "all";

export function advanceScopeFrom(raw: unknown): AdvanceScope {
  return (ADVANCE_SCOPES as readonly string[]).includes(String(raw))
    ? (raw as AdvanceScope)
    : DEFAULT_ADVANCE_SCOPE;
}

export const ADVANCE_SCOPE_LABELS: Record<
  AdvanceScope,
  { ar: string; en: string; hintAr: string; hintEn: string }
> = {
  all: {
    ar: "كل الطلبات",
    en: "Every order",
    hintAr: "الدفعة على كامل أي طلب.",
    hintEn: "The advance is asked on the whole of any order.",
  },
  made_to_order: {
    ar: "المنتجات حسب الطلب والخدمات فقط",
    en: "Made-to-order items and services only",
    hintAr: "الدفعة على المنتجات حسب الطلب فقط؛ الجاهز لا يتأثر.",
    hintEn:
      "The advance is asked on the made-to-order items only; ready-made items are not touched.",
  },
  delivery: {
    ar: "طلبات التوصيل فقط",
    en: "Delivered orders only",
    hintAr: "الدفعة على الطلب كاملاً مع رسوم التوصيل؛ الاستلام من الفرع لا يتأثر.",
    hintEn:
      "The advance is asked on the whole order, delivery fee included; pickup is not touched.",
  },
  made_to_order_or_delivery: {
    ar: "حسب الطلب أو التوصيل",
    en: "Made-to-order or delivered",
    hintAr: "طلب التوصيل كاملاً، وأي طلب آخر على منتجاته حسب الطلب فقط.",
    hintEn: "A delivered order whole; any other order on its made-to-order items only.",
  },
  rules_only: {
    ar: "قواعدي الخاصة فقط",
    en: "Only my own rules",
    hintAr: "لا توجد نسبة عامة: لا تُطلب دفعة إلا حسب القواعد التي تضيفها أدناه.",
    hintEn: "No general share: an advance is asked only by the rules you add below.",
  },
};

export type AdvanceRule = {
  enabled: boolean;
  percent: number;
  scope: AdvanceScope;
  /** The store's own rules, in order; the general rule (percent and scope) takes what they leave. */
  rules: readonly AdvanceRuleDef[];
};

/** Every rule an order is worked out under: the store's own, then its general rule. */
export const advanceRulesOf = (rule: AdvanceRule): AdvanceRuleDef[] => [
  ...rule.rules,
  ...defaultAdvanceRules(rule.percent, rule.scope),
];

/** The rule from a store's settings: off unless switched on, a percentage kept within 1 to 100. */
export function advanceRuleFrom(
  settings:
    | {
        advance_payment_enabled?: boolean | null;
        advance_payment_percent?: number | string | null;
        advance_payment_scope?: string | null;
      }
    | null
    | undefined,
  ownRules: readonly AdvanceRuleDef[] = [],
): AdvanceRule {
  const percent = Number(settings?.advance_payment_percent);
  return {
    enabled: settings?.advance_payment_enabled === true,
    percent:
      Number.isFinite(percent) && percent >= ADVANCE_MIN_PERCENT && percent <= ADVANCE_MAX_PERCENT
        ? percent
        : DEFAULT_ADVANCE_PERCENT,
    scope: advanceScopeFrom(settings?.advance_payment_scope),
    rules: ownRules,
  };
}

/**
 * What the order owes in advance, or null when nothing is asked of it: the arithmetic of the
 * database's order_advance_due, under the store's own rules and then its general rule.
 */
export function advanceDue(order: AdvanceOrder, rule: AdvanceRule): number | null {
  if (!rule.enabled) return null;
  return advanceRulesDue(order, advanceRulesOf(rule));
}

export type AdvanceSplit = {
  /** Whether the rules ask for anything of this order. */
  applies: boolean;
  /** The percentage asked, when one percentage rule is all that applies (else null). */
  percent: number | null;
  /** What the advance is of: the whole order, its made-to-order lines, or some other part of it. */
  of: "order" | "made_to_order" | "part";
  /** What to pay now (the whole total when nothing applies). */
  dueNow: number;
  /** What stays due after the advance. */
  balance: number;
};

/** How an order divides into the advance and the balance. */
export function advanceForOrder(order: AdvanceOrder, rule: AdvanceRule): AdvanceSplit {
  const total = Number(order.total) || 0;
  const parts = rule.enabled ? advanceParts(order, advanceRulesOf(rule)) : [];
  const due = advanceDue(order, rule);
  if (due === null) {
    return { applies: false, percent: null, of: "order", dueNow: total, balance: 0 };
  }
  const sole = parts.length === 1 ? parts[0] : null;
  const covered = parts.reduce((sum, part) => sum + part.basis, 0);
  const plainMadeToOrder =
    sole !== null &&
    sole.rule.madeToOrder === true &&
    sole.rule.fulfillment.length === 0 &&
    sole.rule.productIds.length === 0 &&
    sole.rule.categorySlugs.length === 0;
  return {
    applies: true,
    percent: sole !== null && sole.rule.kind === "percent" ? sole.rule.value : null,
    of: covered >= total - 1e-6 ? "order" : plainMadeToOrder ? "made_to_order" : "part",
    dueNow: due,
    balance: Math.round((total - due) * 1000) / 1000,
  };
}

/** The payment methods a customer can use: cash on delivery is not among them when the rule applies. */
export function methodsUnderAdvance<T extends { id: string }>(
  methods: readonly T[],
  applies: boolean,
): T[] {
  return applies ? methods.filter((method) => method.id !== "cod") : [...methods];
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
  let qualifier = "";
  if (split.percent !== null) {
    const percent = Number.isInteger(split.percent)
      ? String(split.percent)
      : split.percent.toFixed(2);
    const of =
      split.of === "made_to_order"
        ? isAr
          ? " من المنتجات حسب الطلب"
          : " of the made-to-order items"
        : split.of === "part"
          ? isAr
            ? " من المنتجات المشمولة"
            : " of the covered items"
          : "";
    qualifier = ` (${percent}%${of})`;
  }
  return [
    isAr
      ? `الدفعة المقدمة${qualifier} تُدفع الآن: ${money(split.dueNow)}`
      : `Advance payment${qualifier} due now: ${money(split.dueNow)}`,
    isAr ? `المتبقي ${money(split.balance)} ${when}` : `Balance ${money(split.balance)} ${when}`,
  ];
}
