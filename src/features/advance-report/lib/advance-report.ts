import { formatMoney } from "@/lib/format";

/**
 * The advance-payment report: of the orders that were placed under an advance rule, what has
 * been collected and what is still owed. An order carries the rule it was placed under
 * (`advance_percent` is set by the database only then), so the report needs no engine of its
 * own; it only reads how much was paid against the order's total.
 */

export type AdvanceReportOrder = {
  id: string;
  invoice_number: number;
  created_at: string;
  currency: string;
  total: number;
  advance_paid: number;
  status: string;
  payment_status: string;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  public_invoice_token: string;
};

/** Nothing paid yet, an advance paid with a balance left, or paid in full. */
export type AdvanceStage = "awaiting" | "balance" | "settled";

const fils = (value: number) => Math.round(value * 1000) / 1000;

/** What is still owed on an order (never below zero). */
export const orderBalance = (order: Pick<AdvanceReportOrder, "total" | "advance_paid">): number =>
  Math.max(0, fils(Number(order.total) - Number(order.advance_paid)));

/**
 * Where an order stands, or null when it does not belong in the report: a cancelled or draft
 * order will never be collected, and a refunded one has been given back.
 */
export function advanceStage(order: AdvanceReportOrder): AdvanceStage | null {
  if (order.status === "cancelled" || order.status === "draft") return null;
  if (order.payment_status === "refunded") return null;
  const paid = Number(order.advance_paid);
  if (orderBalance(order) <= 0) return "settled";
  return paid > 0 ? "balance" : "awaiting";
}

export type AdvanceSummary = {
  /** Orders in the report. */
  orders: number;
  /** Money received so far on them. */
  collected: number;
  /** Money still owed on them. */
  outstanding: number;
  awaiting: { orders: number; amount: number };
  balance: { orders: number; amount: number };
  settled: { orders: number };
  /** The currency of the first order (a store sells in one currency). */
  currency: string | null;
};

export function summarizeAdvance(orders: readonly AdvanceReportOrder[]): AdvanceSummary {
  const summary: AdvanceSummary = {
    orders: 0,
    collected: 0,
    outstanding: 0,
    awaiting: { orders: 0, amount: 0 },
    balance: { orders: 0, amount: 0 },
    settled: { orders: 0 },
    currency: orders[0]?.currency ?? null,
  };
  for (const order of orders) {
    const stage = advanceStage(order);
    if (!stage) continue;
    const owed = orderBalance(order);
    summary.orders += 1;
    summary.collected = fils(summary.collected + Math.min(Number(order.advance_paid), order.total));
    summary.outstanding = fils(summary.outstanding + owed);
    if (stage === "awaiting") {
      summary.awaiting.orders += 1;
      summary.awaiting.amount = fils(summary.awaiting.amount + owed);
    } else if (stage === "balance") {
      summary.balance.orders += 1;
      summary.balance.amount = fils(summary.balance.amount + owed);
    } else {
      summary.settled.orders += 1;
    }
  }
  return summary;
}

export type OwedRow = {
  order: AdvanceReportOrder;
  stage: Exclude<AdvanceStage, "settled">;
  balance: number;
  /** Whole days since the order was placed. */
  ageDays: number;
};

const DAY = 24 * 60 * 60 * 1000;

/** The orders with money still owed, the longest waiting first. */
export function owedRows(orders: readonly AdvanceReportOrder[], now: Date): OwedRow[] {
  const rows: OwedRow[] = [];
  for (const order of orders) {
    const stage = advanceStage(order);
    if (stage !== "awaiting" && stage !== "balance") continue;
    rows.push({
      order,
      stage,
      balance: orderBalance(order),
      ageDays: Math.max(
        0,
        Math.floor((now.getTime() - new Date(order.created_at).getTime()) / DAY),
      ),
    });
  }
  return rows.sort(
    (a, b) => b.ageDays - a.ageDays || a.order.invoice_number - b.order.invoice_number,
  );
}

/** The reminder a staff member sends on WhatsApp: what is owed and where to pay or see it. */
export function reminderMessage({
  isAr,
  brandName,
  customerName,
  invoiceNumber,
  stage,
  balance,
  currency,
  link,
}: {
  isAr: boolean;
  brandName: string;
  customerName?: string | null;
  invoiceNumber: number;
  stage: "awaiting" | "balance";
  balance: number;
  currency: string;
  link: string;
}): string {
  const amount = formatMoney(balance, currency);
  const hello = customerName
    ? isAr
      ? `مرحباً ${customerName}،`
      : `Hello ${customerName},`
    : isAr
      ? "مرحباً،"
      : "Hello,";
  const lines = isAr
    ? [
        hello,
        stage === "awaiting"
          ? `تذكير من ${brandName}: طلبك رقم ${invoiceNumber} بانتظار الدفعة المقدمة لنبدأ بتجهيزه.`
          : `تذكير من ${brandName}: المتبقي على طلبك رقم ${invoiceNumber} هو ${amount}.`,
        stage === "awaiting" ? `المبلغ المستحق: ${amount}` : "",
        `الفاتورة: ${link}`,
        "شكراً لك.",
      ]
    : [
        hello,
        stage === "awaiting"
          ? `A reminder from ${brandName}: order #${invoiceNumber} is waiting for its advance payment before we can start on it.`
          : `A reminder from ${brandName}: the balance on order #${invoiceNumber} is ${amount}.`,
        stage === "awaiting" ? `Amount due: ${amount}` : "",
        `Invoice: ${link}`,
        "Thank you.",
      ];
  return lines.filter(Boolean).join("\n");
}
