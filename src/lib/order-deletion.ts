/**
 * Which orders may be deleted for good.
 *
 * An order that took money or was handed over is a record the store's books, its invoice numbers,
 * its customer's points and its reports stand on: it is cancelled or refunded, never erased. What
 * may go is an order nothing was built on: a draft, or one that never took a payment and was not
 * delivered (a test, a mistake, an abandoned checkout). The server refuses the rest
 * (`deleteOrderWithPrivateReceipt`), and the screens leave the button off them.
 */

type DeletionSource = {
  status?: string | null;
  fulfillment_status?: string | null;
  payment_status?: string | null;
  advance_paid?: unknown;
  total?: unknown;
};

const SOLD_STAGES = ["completed", "delivered", "picked_up", "returned"];
const NO_MONEY = ["", "unpaid", "pending", "failed", "cancelled"];

export function orderDeletable(order: DeletionSource | null | undefined): boolean {
  if (!order) return false;
  const status = String(order.status ?? "").toLowerCase();
  const stage = String(order.fulfillment_status ?? "").toLowerCase();
  const payment = String(order.payment_status ?? "").toLowerCase();
  if (SOLD_STAGES.includes(stage) || SOLD_STAGES.includes(status)) return false;
  if (status === "refunded" || payment === "refunded") return false;
  if (Number(order.advance_paid ?? 0) > 0) return false;
  return NO_MONEY.includes(payment);
}

/** The server's refusal, in words for the screen. */
export function orderKeptMessage(lang: "ar" | "en", count = 1): string {
  return lang === "ar"
    ? count > 1
      ? "الطلبات المدفوعة أو المسلَّمة تبقى في السجل: ألغِها بدل حذفها."
      : "الطلب المدفوع أو المسلَّم يبقى في السجل: ألغِه بدل حذفه."
    : count > 1
      ? "Paid or handed-over orders stay on record: cancel them instead of deleting."
      : "A paid or handed-over order stays on record: cancel it instead of deleting.";
}
