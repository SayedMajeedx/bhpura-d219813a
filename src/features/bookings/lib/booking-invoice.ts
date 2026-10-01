import { formatMoney } from "@/lib/format";

/**
 * A booking's invoice is its order (create_booking_order): what the card
 * shows of it, the public link, and the message that sends it to the customer.
 */

export type BookingInvoice = {
  orderId: string;
  number: number;
  token: string;
  status: string;
  paymentStatus: string;
  total: number;
  paid: number;
  currency: string;
};

type EmbeddedOrder = {
  id: string;
  invoice_number: number;
  public_invoice_token: string;
  status: string;
  payment_status: string;
  total: number | string;
  advance_paid: number | string;
  currency: string;
};

/** The order a booking was loaded with (one row, or a list of one), or null when it has none. */
export function bookingInvoiceOf(booking: {
  orders?: EmbeddedOrder | EmbeddedOrder[] | null;
}): BookingInvoice | null {
  const order = Array.isArray(booking.orders) ? booking.orders[0] : booking.orders;
  if (!order) return null;
  return {
    orderId: order.id,
    number: order.invoice_number,
    token: order.public_invoice_token,
    status: order.status,
    paymentStatus: String(order.payment_status ?? "unpaid").toLowerCase(),
    total: Number(order.total ?? 0),
    paid: Number(order.advance_paid ?? 0),
    currency: order.currency || "BHD",
  };
}

/** The customer's public invoice page. */
export function invoiceLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/invoice/${token}`;
}

/** How far it is paid, as a short label and a tone for its badge. */
export function paymentBadge(
  invoice: Pick<BookingInvoice, "paymentStatus" | "paid" | "total">,
  isAr: boolean,
): { text: string; tone: "success" | "warning" | "muted" } {
  const status = invoice.paymentStatus;
  if (status === "paid") return { text: isAr ? "مدفوع" : "Paid", tone: "success" };
  if (status === "refunded") return { text: isAr ? "مسترجع" : "Refunded", tone: "muted" };
  if (status === "partially_paid" || status === "partial" || invoice.paid > 0) {
    return { text: isAr ? "مدفوع جزئياً" : "Part paid", tone: "warning" };
  }
  return { text: isAr ? "غير مدفوع" : "Unpaid", tone: "warning" };
}

/** The WhatsApp message that sends the invoice. */
export function invoiceMessage({
  isAr,
  brandName,
  customerName,
  reference,
  dayLabel,
  invoice,
  link,
}: {
  isAr: boolean;
  brandName: string;
  customerName?: string | null;
  reference: string;
  dayLabel: string;
  invoice: BookingInvoice;
  link: string;
}): string {
  const total = formatMoney(invoice.total, invoice.currency);
  const greeting = customerName
    ? isAr
      ? `مرحباً ${customerName}،`
      : `Hello ${customerName},`
    : "";
  const body = isAr
    ? `فاتورة حجزك (${reference}) لدى ${brandName}\nالموعد: ${dayLabel}\nالمبلغ: ${total}\n${link}`
    : `Your ${brandName} booking invoice (${reference})\nDate: ${dayLabel}\nAmount: ${total}\n${link}`;
  return [greeting, body].filter(Boolean).join("\n");
}

/** wa.me link to a customer's number, with the message ready. Null when there is no usable number. */
export function whatsAppToCustomer(phone: string | null | undefined, text: string): string | null {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8) digits = `973${digits}`;
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
