import { getOrderWorkflow, type OrderWorkflowInput } from "@/lib/order-workflow";
import { linesToSend, type CustomerLine, type SendGroup } from "./customer-pieces";

/**
 * The pieces to make: customers' made-to-order pieces whose order is ready to go to the workshop
 * (the same reading as the order's own "Send to workshop" step) and that are not with a supplier
 * yet, one group per order, the order waiting longest first. Sent from here several at once.
 */

export type WaitingOrder = OrderWorkflowInput & {
  id: string;
  invoice_number?: number | string | null;
  created_at: string;
  customer_name_snapshot?: string | null;
  order_items?: CustomerLine[] | null;
};

export type PiecesGroup = SendGroup & {
  createdAt: string;
  /** For the staff's own list: who the pieces are for. Never sent to a supplier. */
  customerName: string | null;
};

export function piecesToMake(
  orders: readonly WaitingOrder[],
  alreadySent: ReadonlySet<string>,
): PiecesGroup[] {
  return orders
    .filter(
      (order) =>
        getOrderWorkflow(order, { productionStages: true }).nextAction === "send_to_tailor",
    )
    .map((order) => ({
      orderId: order.id,
      invoice: order.invoice_number ?? null,
      createdAt: order.created_at,
      customerName: order.customer_name_snapshot?.trim() || null,
      lines: linesToSend(order.order_items ?? [], alreadySent),
    }))
    .filter((group) => group.lines.length > 0)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/** Whole days an order has waited, on the reader's clock. */
export function daysWaiting(createdAt: string, now = Date.now()): number {
  const days = Math.floor((now - new Date(createdAt).getTime()) / 86_400_000);
  return Number.isFinite(days) ? Math.max(0, days) : 0;
}
