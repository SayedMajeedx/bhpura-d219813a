/**
 * What an order was placed to pay now, read from the rule it carries.
 *
 * A shopper's order under an advance rule (a store's percentage, its own rules, or the shopper's
 * choice to pay in full) keeps the rules it was placed under (`orders.advance_rules`, else
 * `advance_percent` and `advance_scope`). Approving a transfer records exactly that amount
 * (`approve_benefit_payment` -> `order_advance_due`, which no browser can call), so staff read the
 * same figure here, from the same arithmetic (`advanceSplitUnderRules`), before they approve.
 * Until then `advance_paid` is 0 and the order looks like a plain unpaid one.
 */

import { advanceSplitUnderRules, type AdvanceSplit } from "@/lib/payments/advance-payment";
import {
  advanceRuleFromJson,
  defaultAdvanceRules,
  type AdvanceFulfillment,
  type AdvanceLine,
  type AdvanceRuleDef,
} from "@/lib/payments/advance-rules";

type RuleJson = Parameters<typeof advanceRuleFromJson>[0];

export type AdvanceOrderSource = {
  total?: number | string | null;
  shipping?: number | string | null;
  fulfillment_method?: string | null;
  advance_rules?: unknown;
  advance_percent?: number | string | null;
  advance_scope?: string | null;
  advance_returning?: boolean | null;
  destination_country?: string | null;
  advance_paid?: number | string | null;
  payment_status?: string | null;
  status?: string | null;
  order_items?:
    | readonly {
        line_total?: number | string | null;
        location?: string | null;
        product_id?: string | null;
      }[]
    | null;
  /** An appointment's booking carries its own deposit, which a transfer pays when no advance is asked. */
  bookings?: readonly { deposit_amount?: number | string | null }[] | null;
};

/** Nothing collected yet, the advance collected with a balance left, or all of it. */
export type AdvanceStanding = "awaiting" | "advance_paid" | "paid";

export type ExpectedAdvance = {
  split: AdvanceSplit;
  /** The shopper pays the whole total now (they chose to, or the rule asks all of it). */
  payInFull: boolean;
  /** The amount is a booking's own deposit, not a store's advance. */
  isDeposit: boolean;
  standing: AdvanceStanding;
};

const FULFILLMENTS: readonly string[] = ["delivery", "pickup", "digital", "appointment"];

function rulesOf(order: AdvanceOrderSource): AdvanceRuleDef[] | null {
  if (Array.isArray(order.advance_rules)) {
    return (order.advance_rules as RuleJson[]).map(advanceRuleFromJson);
  }
  const percent = Number(order.advance_percent);
  if (!Number.isFinite(percent) || percent <= 0) return null;
  return defaultAdvanceRules(percent, order.advance_scope ?? "all");
}

const roundFils = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The advance an order owes now and the balance after it, or null when nothing is asked of it
 * (a plain order, a draft, or an order whose category rules cannot be read without `categoryOf`:
 * better to say nothing than a wrong figure).
 */
export function expectedAdvance(
  order: AdvanceOrderSource | null | undefined,
  categoryOf?: (productId: string) => string | null | undefined,
): ExpectedAdvance | null {
  if (!order) return null;
  const total = Number(order.total) || 0;
  if (total <= 0) return null;
  // Nothing is collected on an order that was undone.
  if (["cancelled", "draft", "voided", "failed"].includes(String(order.status ?? ""))) return null;
  if (String(order.payment_status ?? "") === "refunded") return null;

  const rules = rulesOf(order);
  let split: AdvanceSplit | null = null;
  let isDeposit = false;

  if (rules) {
    if (!categoryOf && rules.some((rule) => rule.categorySlugs.length > 0)) return null;
    const fulfillment = String(order.fulfillment_method ?? "");
    const lines: AdvanceLine[] = (order.order_items ?? []).map((item) => ({
      amount: Number(item.line_total) || 0,
      madeToOrder: item.location === "custom",
      productId: item.product_id ?? null,
      category: item.product_id ? (categoryOf?.(item.product_id) ?? null) : null,
    }));
    const found = advanceSplitUnderRules(
      {
        total,
        shipping: Number(order.shipping) || 0,
        fulfillment: (FULFILLMENTS.includes(fulfillment)
          ? fulfillment
          : "delivery") as AdvanceFulfillment,
        lines,
        returning: order.advance_returning === true,
        country: order.destination_country ?? null,
      },
      rules,
    );
    if (found.applies) split = found;
  }

  if (!split) {
    const deposit = (order.bookings ?? [])
      .map((booking) => Number(booking.deposit_amount) || 0)
      .find((amount) => amount > 0);
    if (!deposit) return null;
    const dueNow = Math.min(total, deposit);
    split = {
      applies: true,
      percent: null,
      of: "order",
      dueNow,
      balance: roundFils(total - dueNow),
      deposit: { balanceDueDays: null },
    };
    isDeposit = true;
  }

  const status = String(order.payment_status ?? "").toLowerCase();
  const standing: AdvanceStanding =
    status === "paid"
      ? "paid"
      : status === "partially_paid" || status === "partial"
        ? "advance_paid"
        : "awaiting";
  return { split, payInFull: split.balance <= 0, isDeposit, standing };
}
