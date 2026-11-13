/**
 * Where checkout stops (migration 20261207100000). A visit that opens checkout records how far into
 * it it went (`record_checkout_step`) and what still stood in the way, as one of these codes or the
 * database's own refusal (`product_unavailable`); the dashboard counts them. Nothing that names a
 * shopper is sent.
 */

/** The parts of checkout, in order: 4 is set when "place order" is pressed. */
export const CHECKOUT_PARTS = ["opened", "contact", "delivery", "ready", "pressed"] as const;
export type CheckoutPart = 0 | 1 | 2 | 3 | 4;

/** What the checkout's own rules ask for (`checkoutFormProblem`), and the delivery day. */
export const CHECKOUT_PROBLEMS = [
  "name_phone",
  "email",
  "terms",
  "address",
  "payment_method",
  "receipt",
  "branch",
  "digital_contact",
  "digital_email",
  "delivery_time",
  "order_failed",
] as const;
export type CheckoutProblem = (typeof CHECKOUT_PROBLEMS)[number];

/** The database's refusal as a code (`PRODUCT_UNAVAILABLE:<id>` is `product_unavailable`). */
export function problemFromFailure(message: string): string {
  const code = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/.exec(message)?.[1];
  return code ? code.toLowerCase().slice(0, 48) : "order_failed";
}

const WORDS: Record<string, [string, string]> = {
  name_phone: ["الاسم أو رقم الهاتف", "Name or phone"],
  email: ["بريد إلكتروني غير صحيح", "An email that did not work"],
  terms: ["الموافقة على الشروط", "Agreeing to the terms"],
  address: ["عنوان التوصيل", "The delivery address"],
  payment_method: ["اختيار طريقة الدفع", "Choosing how to pay"],
  receipt: ["إيصال التحويل", "The transfer receipt"],
  branch: ["اختيار الفرع", "Choosing a branch"],
  digital_contact: ["وسيلة الاستلام الرقمي", "Where to send a digital order"],
  digital_email: ["بريد الاستلام الرقمي", "The digital order's email"],
  delivery_time: ["يوم التوصيل ووقته", "The delivery day and time"],
  order_failed: ["تعذّر إرسال الطلب", "The order could not be sent"],
  product_unavailable: ["منتج لم يعد متاحاً", "A piece no longer available"],
  insufficient_stock: ["مخزون غير كافٍ", "Not enough stock"],
  made_to_order_sold_out: ["اكتمل عدد القطع حسب الطلب", "Made-to-order limit reached"],
  made_to_order_paused: ["الصنع حسب الطلب متوقف مؤقتاً", "Made to order paused"],
  orders_paused: ["الطلبات متوقفة مؤقتاً", "Orders paused"],
  store_closed: ["المتجر مغلق", "The store was closed"],
  payment_method_disabled: ["طريقة دفع غير متاحة", "A payment method turned off"],
  delivery_time_unavailable: ["الموعد لم يعد متاحاً", "The delivery time was taken"],
};

/** A problem in the merchant's words; a refusal not listed reads as its own code, spaced. */
export function problemLabel(code: string, isAr: boolean): string {
  const words = WORDS[code];
  if (words) return isAr ? words[0] : words[1];
  return isAr ? `رفض الطلب (${code.replace(/_/g, " ")})` : code.replace(/_/g, " ");
}
