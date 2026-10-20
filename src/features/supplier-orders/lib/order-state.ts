import { arCount } from "@/features/outreach/lib/outreach-messages";
import { roundCost } from "./landed-cost";

/**
 * A supplier's order as the screens read it: where the goods are (written by the database:
 * ordered, partly received, received) and, apart from it, what is still owed.
 */

export type SupplierOrderStatus =
  "draft" | "ordered" | "partially_received" | "received" | "cancelled";

export type SupplierOrderLine = {
  id: string;
  variant_id: string | null;
  product_id: string | null;
  description: string;
  quantity: number;
  received_quantity: number;
  unit_cost: number;
  line_total: number;
  sort_order: number;
  /** The customer's order line this piece is made for, when it is a customer's piece. */
  order_item_id?: string | null;
  /** That customer's order, to link to it (staff who cannot read orders see none). */
  customer_order?: {
    id: string;
    invoice_number: number | string | null;
    /** Cancelled, refunded, voided or failed: the piece waits for the store's choice. */
    cancelled?: boolean;
  } | null;
  /** Made (the default), back to be fixed, or altered: a customer's piece only. */
  purpose?: "make" | "fix" | "alteration";
  /** What to fix or change. */
  work_note?: string | null;
  /** A cancelled customer's piece kept for sale: whose it was. */
  released_order_item_id?: string | null;
};

/** A line that is a piece: a size of the store's, or a customer's piece. */
export const isPieceLine = (line: Pick<SupplierOrderLine, "variant_id" | "order_item_id">) =>
  Boolean(line.variant_id || line.order_item_id);

export type SupplierOrder = {
  id: string;
  po_number: string;
  status: SupplierOrderStatus;
  vendor_id: string;
  vendor_name: string;
  vendor_phone: string | null;
  total_amount: number;
  paid_amount: number;
  expected_at: string | null;
  received_at: string | null;
  created_at: string;
  notes: string | null;
  items: SupplierOrderLine[];
};

/** The orders whose goods are still to come. */
export const OPEN_STATUSES: readonly SupplierOrderStatus[] = ["ordered", "partially_received"];

export function isOpen(order: Pick<SupplierOrder, "status">): boolean {
  return OPEN_STATUSES.includes(order.status);
}

/** Pieces ordered, arrived and still to come (lines that are a cost of the order are not pieces). */
export function piecesOf(order: Pick<SupplierOrder, "items">) {
  let ordered = 0;
  let received = 0;
  for (const line of order.items) {
    if (!isPieceLine(line)) continue;
    ordered += line.quantity;
    received += line.received_quantity;
  }
  return { ordered, received, remaining: Math.max(0, ordered - received) };
}

export type PaymentState = "paid" | "part" | "unpaid" | "nothing";

/**
 * What the order costs, what was paid and what is still owed to the supplier; `credit` is what
 * was paid beyond the order's value (a cancelled order paid for, or one lowered after a payment).
 */
export function paymentOf(order: Pick<SupplierOrder, "total_amount" | "paid_amount" | "status">) {
  const total = order.status === "cancelled" ? 0 : roundCost(Number(order.total_amount) || 0);
  const paid = roundCost(Number(order.paid_amount) || 0);
  const owed = Math.max(0, roundCost(total - paid));
  const credit = Math.max(0, roundCost(paid - total));
  const state: PaymentState =
    total === 0 ? "nothing" : owed === 0 ? "paid" : paid > 0 ? "part" : "unpaid";
  return { total, paid, owed, credit, state };
}

/** Today on the reader's own calendar, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Goods still to come after the day the supplier promised them. */
export function isLate(order: Pick<SupplierOrder, "status" | "expected_at">, today: string) {
  return isOpen(order) && Boolean(order.expected_at) && (order.expected_at as string) < today;
}

export function statusLabel(status: SupplierOrderStatus, isAr: boolean): string {
  const labels: Record<SupplierOrderStatus, [string, string]> = {
    draft: ["مسودة", "Draft"],
    ordered: ["بانتظار الاستلام", "Awaiting delivery"],
    partially_received: ["وصل جزء منها", "Partly received"],
    received: ["تم الاستلام", "Received"],
    cancelled: ["ملغاة", "Cancelled"],
  };
  return labels[status][isAr ? 0 : 1];
}

export type SupplierOrdersTab = "open" | "done" | "all";

export function ordersInTab(orders: readonly SupplierOrder[], tab: SupplierOrdersTab) {
  if (tab === "all") return [...orders];
  if (tab === "open") return orders.filter((o) => isOpen(o) || o.status === "draft");
  return orders.filter((o) => o.status === "received" || o.status === "cancelled");
}

/**
 * The order a list reads in: what is late first, then what is still to come by the promised day
 * (an order with no day after them), then the rest, newest first.
 */
export function sortOrders(orders: readonly SupplierOrder[], today: string): SupplierOrder[] {
  const rank = (o: SupplierOrder) =>
    isLate(o, today) ? 0 : isOpen(o) ? 1 : o.status === "draft" ? 2 : 3;
  return [...orders].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    if (rank(a) <= 1) {
      const da = a.expected_at ?? "9999-12-31";
      const dbb = b.expected_at ?? "9999-12-31";
      if (da !== dbb) return da < dbb ? -1 : 1;
    }
    return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
  });
}

/** The figures above the list. */
export function ordersSummary(orders: readonly SupplierOrder[], today: string) {
  let open = 0;
  let late = 0;
  let awaited = 0;
  let owed = 0;
  for (const order of orders) {
    if (isOpen(order)) {
      open += 1;
      awaited += piecesOf(order).remaining;
      if (isLate(order, today)) late += 1;
    }
    if (order.status !== "draft") owed += paymentOf(order).owed;
  }
  return { open, late, awaited, owed: roundCost(owed) };
}

/** "6 قطع", "قطعتان", "1 piece": a count of pieces as each language says it. */
export function piecesLabel(n: number, lang: "ar" | "en"): string {
  if (lang === "ar")
    return arCount(n, { one: "قطعة واحدة", two: "قطعتان", few: "قطع", many: "قطعة" });
  return `${n} ${n === 1 ? "piece" : "pieces"}`;
}

/** "3 طلبيات", "1 order": a count of orders as each language says it. */
export function ordersLabel(n: number, lang: "ar" | "en"): string {
  if (lang === "ar") {
    return arCount(n, { one: "طلبية واحدة", two: "طلبيتان", few: "طلبيات", many: "طلبية" });
  }
  return `${n} ${n === 1 ? "order" : "orders"}`;
}
