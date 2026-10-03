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
 *
 * advanceDue is the same arithmetic as the database's order_advance_due (migration
 * 20261003140000), which is what charges, approves and refuses; this copy is for
 * the checkout's preview and the settings screen, and tests/advance-payment-parity
 * runs the two against each other.
 */

export const ADVANCE_MIN_PERCENT = 1;
export const ADVANCE_MAX_PERCENT = 100;
export const DEFAULT_ADVANCE_PERCENT = 30;

export const ADVANCE_SCOPES = [
  "all",
  "made_to_order",
  "delivery",
  "made_to_order_or_delivery",
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
};

export type AdvanceRule = { enabled: boolean; percent: number; scope: AdvanceScope };

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
): AdvanceRule {
  const percent = Number(settings?.advance_payment_percent);
  return {
    enabled: settings?.advance_payment_enabled === true,
    percent:
      Number.isFinite(percent) && percent >= ADVANCE_MIN_PERCENT && percent <= ADVANCE_MAX_PERCENT
        ? percent
        : DEFAULT_ADVANCE_PERCENT,
    scope: advanceScopeFrom(settings?.advance_payment_scope),
  };
}

export type AdvanceOrder = {
  /** The order's total (lines after discounts, tax and delivery fee). */
  total: number;
  /** The delivery fee inside the total. */
  shipping: number;
  fulfillment: "delivery" | "pickup" | "digital" | "appointment";
  /** The lines, each with its amount and whether it is made to order. */
  lines: ReadonlyArray<{ amount: number; madeToOrder: boolean }>;
};

const wholeFils = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * What the order owes in advance, or null when nothing is asked of it. The same
 * arithmetic as order_advance_due: the part of the order the scope reaches, the
 * percentage of it rounded up to the fils, never more than the total.
 */
export function advanceDue(order: AdvanceOrder, rule: AdvanceRule): number | null {
  const total = Number(order.total) || 0;
  if (!rule.enabled || total <= 0) return null;
  const delivered = order.fulfillment === "delivery";
  const linesSum = order.lines.reduce((sum, line) => sum + line.amount, 0);
  const madeSum = order.lines.reduce((sum, line) => sum + (line.madeToOrder ? line.amount : 0), 0);
  // The order without its delivery fee: discounts and tax are spread over the lines.
  const items = Math.max(total - (Number(order.shipping) || 0), 0);
  const madeShare = linesSum > 0 ? (items * madeSum) / linesSum : 0;
  let basis: number;
  switch (rule.scope) {
    case "delivery":
      basis = delivered ? total : 0;
      break;
    case "made_to_order":
      basis = madeShare;
      break;
    case "made_to_order_or_delivery":
      basis = delivered ? total : madeShare;
      break;
    default:
      basis = total;
  }
  basis = wholeFils(basis);
  if (basis <= 0) return null;
  const amount =
    rule.percent >= 100
      ? Math.round(basis * 1000) / 1000
      : Math.ceil(wholeFils(basis * rule.percent * 10 - 1e-9)) / 1000;
  return Math.min(total, amount);
}

export type AdvanceSplit = {
  /** Whether the rule asks for anything of this order. */
  applies: boolean;
  percent: number;
  scope: AdvanceScope;
  /** What to pay now (the whole total when the rule does not apply). */
  dueNow: number;
  /** What stays due after the advance. */
  balance: number;
  /** The advance is on the made-to-order items only, not the whole order. */
  partial: boolean;
};

/** How an order divides into the advance and the balance. */
export function advanceForOrder(order: AdvanceOrder, rule: AdvanceRule): AdvanceSplit {
  const total = Number(order.total) || 0;
  const due = advanceDue(order, rule);
  const delivered = order.fulfillment === "delivery";
  const partial =
    rule.scope === "made_to_order" || (rule.scope === "made_to_order_or_delivery" && !delivered);
  if (due === null) {
    return {
      applies: false,
      percent: rule.percent,
      scope: rule.scope,
      dueNow: total,
      balance: 0,
      partial,
    };
  }
  return {
    applies: true,
    percent: rule.percent,
    scope: rule.scope,
    dueNow: due,
    balance: Math.round((total - due) * 1000) / 1000,
    partial,
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
  const of = split.partial ? (isAr ? ` من المنتجات حسب الطلب` : ` of the made-to-order items`) : "";
  return [
    isAr
      ? `الدفعة المقدمة (${percent}%${of}) تُدفع الآن: ${money(split.dueNow)}`
      : `Advance payment (${percent}%${of}) due now: ${money(split.dueNow)}`,
    isAr ? `المتبقي ${money(split.balance)} ${when}` : `Balance ${money(split.balance)} ${when}`,
  ];
}
