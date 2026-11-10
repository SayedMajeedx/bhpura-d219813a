import { roundCost } from "./landed-cost";
import { paymentOf, pricesToAdd, type SupplierOrder } from "./order-state";

/**
 * A supplier's account (migration `20261127100000`): a payment is the supplier's, with its day,
 * how it was paid and its reference, spread by the database on the orders the store chose, then
 * on the oldest that owe; what is left is the supplier's credit, spent on the next order that
 * owes. These rules preview what the database will do and read what it did. Pure.
 */

export type PaymentMethod = "cash" | "benefit" | "bank" | "card";
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "benefit", "bank", "card"];

const METHOD_WORDS: Record<PaymentMethod, { ar: string; en: string }> = {
  cash: { ar: "نقداً", en: "Cash" },
  benefit: { ar: "بنفت باي", en: "BenefitPay" },
  bank: { ar: "تحويل بنكي", en: "Bank transfer" },
  card: { ar: "بطاقة", en: "Card" },
};

/** How a payment was paid, in the reader's words; a payment from before the question has none. */
export function methodLabel(method: PaymentMethod | null, lang: "ar" | "en"): string {
  if (!method) return lang === "ar" ? "لم تُسجّل الطريقة" : "Method not recorded";
  return METHOD_WORDS[method][lang];
}

/** What an entry on a supplier's account is: money paid, or an adjustment that moved none. */
export type EntryKind = "payment" | "discount" | "write_off";
export const ENTRY_KINDS: readonly EntryKind[] = ["payment", "discount", "write_off"];

const KIND_WORDS: Record<Exclude<EntryKind, "payment">, { ar: string; en: string }> = {
  discount: { ar: "خصم من المورد", en: "Discount from the supplier" },
  write_off: { ar: "مبلغ مشطوب", en: "Written off" },
};

/** An entry kind in the reader's words ("Payment" for a payment). */
export function kindLabel(kind: EntryKind, lang: "ar" | "en"): string {
  if (kind === "payment") return lang === "ar" ? "دفعة" : "Payment";
  return KIND_WORDS[kind][lang];
}

/** How an entry reads on a list: a payment by its method, an adjustment by what it is. */
export function entryLabel(
  entry: { kind?: EntryKind | null; method: PaymentMethod | null },
  lang: "ar" | "en",
): string {
  const kind = entry.kind ?? "payment";
  return kind === "payment" ? methodLabel(entry.method, lang) : kindLabel(kind, lang);
}

/** Whether an entry is money paid (an adjustment is not). */
export const isPayment = (entry: { kind?: EntryKind | null }) =>
  (entry.kind ?? "payment") === "payment";

/**
 * The supplier's pieces still waiting for a price, on orders that count: what they owe is not
 * known yet, so the balance shown is short by them.
 */
export function pendingPrices(orders: readonly SupplierOrder[], vendorId: string): number {
  return orders
    .filter((o) => o.vendor_id === vendorId && o.status !== "draft")
    .reduce((sum, o) => sum + pricesToAdd(o), 0);
}

export type AppliedPart = { po_id: string; po_number: string; amount: number; voided: boolean };

export type AccountPayment = {
  id: string;
  vendor_id: string;
  amount: number;
  paid_on: string;
  /** A payment, or an adjustment (a discount from the supplier, an amount written off). */
  kind: EntryKind;
  method: PaymentMethod | null;
  reference: string | null;
  note: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
  /** What it paid on each order (taken-back parts marked). */
  applied: AppliedPart[];
};

/** What a payment still holds beyond what it paid on orders: the supplier's credit. */
export function paymentCredit(payment: AccountPayment): number {
  if (payment.voided_at) return 0;
  const used = payment.applied.filter((a) => !a.voided).reduce((sum, a) => sum + a.amount, 0);
  return Math.max(0, roundCost(payment.amount - used));
}

/** Each supplier's credit with the store, by supplier id. */
export function supplierCredits(payments: readonly AccountPayment[]): Map<string, number> {
  const credits = new Map<string, number>();
  for (const payment of payments) {
    const credit = paymentCredit(payment);
    if (credit > 0) {
      credits.set(payment.vendor_id, roundCost((credits.get(payment.vendor_id) ?? 0) + credit));
    }
  }
  return credits;
}

/**
 * The payments that paid this order (the order page's list), newest first: what each put here,
 * and the other orders it paid. A payment taken back shows what it had put here, struck through.
 */
export function paymentsOnOrder(
  payments: readonly AccountPayment[],
  orderId: string,
): Array<{ payment: AccountPayment; here: number; others: string[] }> {
  const counts = (payment: AccountPayment, part: AppliedPart) =>
    payment.voided_at ? true : !part.voided;
  return payments
    .map((payment) => {
      const parts = payment.applied.filter((a) => a.po_id === orderId && counts(payment, a));
      const here = roundCost(parts.reduce((sum, a) => sum + a.amount, 0));
      const others = [
        ...new Set(
          payment.applied
            .filter((a) => a.po_id !== orderId && a.po_number && counts(payment, a))
            .map((a) => a.po_number),
        ),
      ];
      return { payment, here, others, found: parts.length > 0 };
    })
    .filter((row) => row.found)
    .map(({ payment, here, others }) => ({ payment, here, others }))
    .sort((a, b) =>
      b.payment.paid_on === a.payment.paid_on
        ? b.payment.created_at.localeCompare(a.payment.created_at)
        : b.payment.paid_on.localeCompare(a.payment.paid_on),
    );
}

export type OwedOrder = { id: string; po_number: string; owed: number };

/** A supplier's orders that still owe, the oldest first: the database's order of spending. */
export function owedOrders(orders: readonly SupplierOrder[], vendorId: string): OwedOrder[] {
  return orders
    .filter((o) => o.vendor_id === vendorId && o.status !== "draft" && o.status !== "cancelled")
    .map((o) => ({ order: o, owed: paymentOf(o).owed }))
    .filter(({ owed }) => owed > 0)
    .sort(
      (a, b) =>
        a.order.created_at.localeCompare(b.order.created_at) ||
        a.order.po_number.localeCompare(b.order.po_number) ||
        a.order.id.localeCompare(b.order.id),
    )
    .map(({ order, owed }) => ({ id: order.id, po_number: order.po_number, owed }));
}

export type SpreadLine = { id: string; po_number: string; amount: number; chosen: boolean };

/**
 * Where a payment will go: the amounts chosen on orders first, then the oldest orders that still
 * owe, then the supplier's credit. As `supplier_payment_record_internal` spreads it.
 */
export function spreadPayment(
  amount: number,
  owed: readonly OwedOrder[],
  chosen: Readonly<Record<string, number>> = {},
): { lines: SpreadLine[]; credit: number } {
  const total = Number.isFinite(amount) && amount > 0 ? roundCost(amount) : 0;
  const lines = new Map<string, SpreadLine>();
  let left = total;
  for (const order of owed) {
    const part = roundCost(Math.min(chosen[order.id] ?? 0, order.owed, left));
    if (part > 0) {
      lines.set(order.id, { id: order.id, po_number: order.po_number, amount: part, chosen: true });
      left = roundCost(left - part);
    }
  }
  for (const order of owed) {
    if (left <= 0) break;
    const already = lines.get(order.id)?.amount ?? 0;
    const room = roundCost(order.owed - already);
    if (room <= 0) continue;
    const part = roundCost(Math.min(room, left));
    lines.set(order.id, {
      id: order.id,
      po_number: order.po_number,
      amount: roundCost(already + part),
      chosen: lines.get(order.id)?.chosen ?? false,
    });
    left = roundCost(left - part);
  }
  return {
    lines: owed.flatMap((o) => (lines.has(o.id) ? [lines.get(o.id)!] : [])),
    credit: left,
  };
}

export type AccountPaymentProblem = "amount" | "date" | "method" | "reason" | "chosen" | null;

/** What stops a payment, before the database says it. */
export function accountPaymentProblem({
  amount,
  paidOn,
  method,
  chosen,
  owed,
  today,
  kind = "payment",
  reason = "",
}: {
  /** A payment asks how it was paid; an adjustment asks why. */
  kind?: EntryKind;
  reason?: string;
  amount: string;
  paidOn: string;
  method: PaymentMethod | null;
  chosen: Readonly<Record<string, number>>;
  owed: readonly OwedOrder[];
  today: string;
}): AccountPaymentProblem {
  const text = amount.trim();
  const value = Number(text);
  if (text === "" || !Number.isFinite(value) || value <= 0 || roundCost(value) !== value) {
    return "amount";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > today) return "date";
  if (kind === "payment" && !method) return "method";
  if (kind !== "payment" && !reason.trim()) return "reason";
  let given = 0;
  for (const [id, part] of Object.entries(chosen)) {
    if (!part) continue;
    const order = owed.find((o) => o.id === id);
    if (!order || part < 0 || roundCost(part) !== part || part > order.owed) return "chosen";
    given = roundCost(given + part);
  }
  if (given > value) return "chosen";
  return null;
}
