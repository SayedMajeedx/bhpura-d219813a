import { roundCost } from "./landed-cost";
import {
  isLate,
  isOpen,
  paymentOf,
  piecesLabel,
  piecesOf,
  type SupplierOrder,
} from "./order-state";

/**
 * Money to suppliers and what to ask them: a payment the database would take, what is owed to
 * each supplier, and the message a person sends to a supplier whose order is late.
 */

/** What stops a payment: the amount (above zero, to the fils, up to what is owed) or its day. */
export function paymentProblem({
  amount,
  paidOn,
  owed,
  today,
}: {
  amount: string;
  paidOn: string;
  owed: number;
  today: string;
}): "amount" | "date" | null {
  const text = amount.trim();
  const value = Number(text);
  if (
    text === "" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    roundCost(value) !== value ||
    value > owed
  ) {
    return "amount";
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > today) return "date";
  return null;
}

export type SupplierBalance = {
  vendorId: string;
  name: string;
  phone: string | null;
  owed: number;
  openOrders: number;
  lateOrders: number;
};

/**
 * Each supplier the store owes money or awaits goods from, most owed first. A draft is not an
 * order yet and counts for nothing.
 */
export function supplierBalances(
  orders: readonly SupplierOrder[],
  today: string,
): SupplierBalance[] {
  const map = new Map<string, SupplierBalance>();
  for (const order of orders) {
    if (order.status === "draft") continue;
    const owed = paymentOf(order).owed;
    const open = isOpen(order);
    if (owed === 0 && !open) continue;
    const row = map.get(order.vendor_id) ?? {
      vendorId: order.vendor_id,
      name: order.vendor_name,
      phone: order.vendor_phone,
      owed: 0,
      openOrders: 0,
      lateOrders: 0,
    };
    row.owed = roundCost(row.owed + owed);
    if (open) row.openOrders += 1;
    if (isLate(order, today)) row.lateOrders += 1;
    map.set(order.vendor_id, row);
  }
  return [...map.values()].sort(
    (a, b) => b.owed - a.owed || b.lateOrders - a.lateOrders || a.name.localeCompare(b.name),
  );
}

/** "25/10/2026": a date as a message to a supplier writes it, in Western digits. */
function messageDate(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

/**
 * The message a person sends a supplier whose order is late, asking when it will come. Written
 * for the store, in the reader's language; nothing is sent by itself.
 */
export function lateOrderMessage(
  order: Pick<SupplierOrder, "po_number" | "vendor_name" | "expected_at" | "items">,
  storeName: string,
  lang: "ar" | "en",
): string {
  const remaining = piecesOf(order).remaining;
  const due = order.expected_at ? messageDate(order.expected_at) : null;
  if (lang === "ar") {
    return [
      `السلام عليكم ${order.vendor_name}،`,
      `بخصوص طلبية ${storeName} رقم ${order.po_number}` +
        (remaining > 0 ? ` (باقي ${piecesLabel(remaining, "ar")})` : "") +
        (due ? `، وكان موعد التسليم ${due}.` : "."),
      "متى نتوقع وصولها؟ شكراً لك.",
    ].join("\n");
  }
  return [
    `Hello ${order.vendor_name},`,
    `About ${storeName}'s order ${order.po_number}` +
      (remaining > 0 ? ` (${piecesLabel(remaining, "en")} to come)` : "") +
      (due ? `, due on ${due}.` : "."),
    "When can we expect it? Thank you.",
  ].join("\n");
}

/** The dashboard's line: orders late, and what is owed to suppliers. Null when there is neither. */
export function supplierDashboardLine(orders: readonly SupplierOrder[], today: string) {
  let late = 0;
  let owed = 0;
  for (const order of orders) {
    if (isLate(order, today)) late += 1;
    if (order.status !== "draft") owed += paymentOf(order).owed;
  }
  owed = roundCost(owed);
  return late === 0 && owed === 0 ? null : { late, owed };
}
