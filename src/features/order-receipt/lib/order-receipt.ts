import type { NamedOrderLine } from "@/lib/order-line-name";
import { orderNumberQuery, type OrderNumberFormat } from "@/lib/order-number";

/**
 * What a shopper is shown of an order they placed: on the thank-you page right after placing
 * it, and on the order tracking page from its number and the phone it was placed with. Both are
 * read by the server (`order-receipt.functions.ts`), which applies these rules.
 */

/**
 * How long after it was placed the thank-you page can show an order from its id alone. The page
 * is opened at once (or on the card gateway's return); an order id that travels later (a payment
 * provider's records, a forwarded link) shows nothing.
 */
export const RECEIPT_WINDOW_MS = 6 * 60 * 60 * 1000;

/** Digits a typed phone must share with the order's, from the end (a local number's length). */
export const PHONE_DIGITS_COMPARED = 8;

export type ReceiptLine = NamedOrderLine & {
  quantity: number;
  line_total: number;
};

export type OrderReceipt = {
  invoiceNumber: number | null;
  numberFormat: OrderNumberFormat;
  createdAt: string;
  currency: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  /** What was collected (an advance, or the whole). */
  paid: number;
  paymentMethod: string | null;
  paymentStatus: string | null;
  status: string;
  fulfillmentStatus: string | null;
  fulfillmentMethod: string | null;
  /** Opens the order's invoice; null when the order has none yet. */
  invoiceToken: string | null;
  lines: ReceiptLine[];
};

/** The thank-you page shows a storefront order from its id only while it is fresh. */
export function receiptOpen(
  order: { created_at: string | null; channel: string | null },
  now: number,
): boolean {
  if (order.channel !== "storefront" || !order.created_at) return false;
  const age = now - new Date(order.created_at).getTime();
  return age >= -60_000 && age <= RECEIPT_WINDOW_MS;
}

const digitsOf = (value: string | null | undefined) => String(value ?? "").replace(/\D/g, "");

/**
 * A phone typed on the tracking page is the order's when their last eight digits agree, so the
 * country code or a leading zero can be left out or typed differently.
 */
export function phoneMatches(stored: string | null | undefined, typed: string): boolean {
  const a = digitsOf(stored);
  const b = digitsOf(typed);
  if (a.length < PHONE_DIGITS_COMPARED || b.length < PHONE_DIGITS_COMPARED) return false;
  return a.slice(-PHONE_DIGITS_COMPARED) === b.slice(-PHONE_DIGITS_COMPARED);
}

/** The order's number as typed ("PL-01042", "#1042", "1042"), or null when it is not one. */
export function typedOrderNumber(text: string, format?: OrderNumberFormat | null): number | null {
  const query = orderNumberQuery(text, format);
  if (!/^\d{1,9}$/.test(query)) return null;
  const number = Number(query);
  return number > 0 ? number : null;
}

/** What a shopper is told about paying, after placing the order. */
export function paymentNote(
  receipt: Pick<OrderReceipt, "paymentMethod" | "paymentStatus" | "paid" | "total">,
  lang: "ar" | "en",
): string | null {
  const ar = lang === "ar";
  const status = String(receipt.paymentStatus ?? "").toLowerCase();
  if (status === "paid") return ar ? "تم الدفع" : "Paid";
  if (status === "partially_paid" && receipt.paid > 0) {
    return ar ? "تم دفع العربون، والباقي عند الاستلام" : "Deposit paid, the rest on delivery";
  }
  switch (receipt.paymentMethod) {
    case "cod":
      return ar ? "الدفع عند الاستلام" : "Pay on delivery";
    case "benefit":
      return ar
        ? "سنؤكد الدفع بعد مراجعة تحويلك"
        : "We will confirm the payment once your transfer is checked";
    case "card":
      return ar ? "بانتظار تأكيد الدفع بالبطاقة" : "Waiting for the card payment to be confirmed";
    default:
      return null;
  }
}
