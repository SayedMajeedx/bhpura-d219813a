import { formatMoney } from "./format";
import { formatAddressLine, type StructuredAddress } from "./bahrain-regions";

export type OrderStatusType =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled"
  | "returned"
  | "failed";

export type PaymentStatusType =
  "pending" | "paid" | "partially_paid" | "failed" | "refunded" | "cod_pending";

export type FulfillmentStatusType =
  | "pending"
  | "packing"
  | "sent_to_tailor"
  | "received_from_tailor"
  | "assigned"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "completed"
  | "cancelled"
  | "returned"
  | "failed";

export const ORDER_STATUS_MAP: Record<
  string,
  { label: string; tone: "warning" | "info" | "success" | "danger" | "neutral" }
> = {
  pending: { label: "قيد الانتظار", tone: "warning" },
  confirmed: { label: "مؤكد", tone: "info" },
  processing: { label: "قيد التجهيز", tone: "info" },
  shipped: { label: "جاري التوصيل", tone: "info" },
  delivered: { label: "تم التسليم", tone: "success" },
  completed: { label: "مكتمل", tone: "success" },
  cancelled: { label: "ملغي", tone: "danger" },
  canceled: { label: "ملغي", tone: "danger" },
  returned: { label: "مسترجع", tone: "danger" },
  failed: { label: "فشل التسليم", tone: "danger" },
};

export const PAYMENT_STATUS_MAP: Record<
  string,
  { label: string; tone: "warning" | "info" | "success" | "danger" | "neutral" }
> = {
  pending: { label: "في انتظار الدفع", tone: "warning" },
  paid: { label: "مدفوع بالكامل", tone: "success" },
  partially_paid: { label: "مدفوع جزئياً", tone: "info" },
  failed: { label: "فشل الدفع", tone: "danger" },
  refunded: { label: "مسترجع", tone: "neutral" },
  cod_pending: { label: "الدفع عند الاستلام", tone: "warning" },
};

export const FULFILLMENT_STATUS_MAP: Record<
  string,
  { label: string; tone: "warning" | "info" | "success" | "danger" | "neutral" }
> = {
  pending: { label: "في انتظار التجهيز", tone: "warning" },
  packing: { label: "جاري التجهيز والتغليف", tone: "info" },
  sent_to_tailor: { label: "عند الخياط", tone: "info" },
  received_from_tailor: { label: "مستلم من الخياط", tone: "info" },
  assigned: { label: "مُعيّن لمندوب", tone: "info" },
  ready_for_pickup: { label: "جاهز للاستلام", tone: "info" },
  out_for_delivery: { label: "خرج للتوصيل", tone: "info" },
  completed: { label: "تم التنفيذ", tone: "success" },
  delivered: { label: "تم التسليم", tone: "success" },
  cancelled: { label: "ملغي", tone: "danger" },
  returned: { label: "مرتجع", tone: "danger" },
};

export function getOrderStatusInfo(status: string | null | undefined) {
  const s = (status || "pending").toLowerCase();
  return ORDER_STATUS_MAP[s] || { label: status || "—", tone: "neutral" as const };
}

export function getPaymentStatusInfo(status: string | null | undefined) {
  const s = (status || "pending").toLowerCase();
  return PAYMENT_STATUS_MAP[s] || { label: status || "—", tone: "neutral" as const };
}

export function getFulfillmentStatusInfo(status: string | null | undefined) {
  const s = (status || "pending").toLowerCase();
  return FULFILLMENT_STATUS_MAP[s] || { label: status || "—", tone: "neutral" as const };
}

export function generateCourierDispatchText(options: {
  storeName: string;
  invoiceNumber: number | string;
  customerName: string;
  customerPhone: string;
  address: StructuredAddress | string | null;
  collectAmount: number;
  currency?: string;
  notes?: string | null;
}) {
  const {
    storeName,
    invoiceNumber,
    customerName,
    customerPhone,
    address,
    collectAmount,
    currency = "BHD",
    notes,
  } = options;
  const addressStr = typeof address === "string" ? address : formatAddressLine(address);
  const collectStr =
    collectAmount > 0 ? formatMoney(collectAmount, currency) : "مدفوع مسبقاً (لا يوجد تحصيل)";

  return [
    `*طلب توصيل جديد من ${storeName}* 📦`,
    `--------------------------`,
    `*رقم الطلب:* #${invoiceNumber}`,
    `*العميل:* ${customerName || "عميل"}`,
    `*الهاتف:* ${customerPhone || "—"}`,
    `*العنوان:* ${addressStr || "—"}`,
    `*المبلغ المطلوب تحصيله:* ${collectStr}`,
    notes ? `*ملاحظات:* ${notes}` : null,
    `--------------------------`,
    `يرجى تأكيد الاستلام والتوصيل. شكراً لك!`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function generateCustomerUpdateText(options: {
  type: "confirmed" | "out_for_delivery" | "ready_for_pickup";
  storeName: string;
  invoiceNumber: number | string;
  customerName: string;
  total: number;
  currency?: string;
}) {
  const { type, storeName, invoiceNumber, customerName, total, currency = "BHD" } = options;
  const name = customerName || "عزيزنا العميل";

  if (type === "confirmed") {
    return `مرحباً ${name} 👋\nتم تأكيد طلبك رقم #${invoiceNumber} من متجر ${storeName}.\nإجمالي الطلب: ${formatMoney(total, currency)}.\nجاري تجهيز طلبك بكل عناية وسنوافيك بالتحديثات قريباً! ✨`;
  }
  if (type === "out_for_delivery") {
    return `مرحباً ${name} 🚚\nطلبك رقم #${invoiceNumber} من متجر ${storeName} في طريقه إليك الآن مع المندوب.\nيرجى التواجد واستلام الشحنة.\nشكراً لتسوقك معنا! ❤️`;
  }
  if (type === "ready_for_pickup") {
    return `مرحباً ${name} 🛍️\nطلبك رقم #${invoiceNumber} من متجر ${storeName} أصبح جاهزاً للاستلام الآن من الفرع.\nأهلاً بك في أي وقت! ✨`;
  }
  return "";
}
