/**
 * How an order's journey reads to its shopper. A piece being made spends a week at the workshop,
 * so its order has steps of its own: it once sat on "confirmed" for all of them, with nothing to
 * say the piece was being worked on.
 */

export type TrackStep = { key: string; labelAr: string; labelEn: string };

export const READY_ORDER_STEPS: readonly TrackStep[] = [
  { key: "placed", labelAr: "تم الاستلام", labelEn: "Placed" },
  { key: "confirmed", labelAr: "تأكيد الطلب", labelEn: "Confirmed" },
  { key: "shipped", labelAr: "قيد الشحن", labelEn: "Shipped" },
  { key: "delivered", labelAr: "تم التوصيل", labelEn: "Delivered" },
];

export const TAILORED_ORDER_STEPS: readonly TrackStep[] = [
  { key: "confirmed", labelAr: "تأكيد الطلب", labelEn: "Confirmed" },
  { key: "making", labelAr: "قيد التجهيز", labelEn: "Being made" },
  { key: "ready", labelAr: "جاهزة", labelEn: "Ready" },
  { key: "shipped", labelAr: "في الطريق", labelEn: "On the way" },
  { key: "delivered", labelAr: "وصلت", labelEn: "Delivered" },
];

const ON_THE_WAY = new Set(["SHIPPED", "ASSIGNED", "OUT_FOR_DELIVERY"]);
const DONE = new Set(["COMPLETED", "DELIVERED", "PICKED_UP"]);
/** Back from the workshop. A paid order waits as NEEDS_PACKING before it goes, so that is not one. */
const MADE = new Set(["RECEIVED_FROM_TAILOR", "PACKING", "READY_FOR_PICKUP"]);
const PREPARING = new Set([
  "SENT_TO_TAILOR",
  "RECEIVED_FROM_TAILOR",
  "PACKING",
  "NEEDS_PACKING",
  "READY_FOR_PICKUP",
]);

/** The step an order is at, or -1 when it was cancelled or refunded. */
export function activeTrackStep({
  status,
  paymentStatus,
  fulfillmentStatus,
  tailored,
}: {
  status: string;
  paymentStatus: string | null;
  fulfillmentStatus: string | null;
  tailored: boolean;
}): number {
  const state = status.toLowerCase();
  const stage = String(fulfillmentStatus || "ON_HOLD").toUpperCase();
  if (state === "cancelled" || state === "refunded") return -1;
  const steps = tailored ? TAILORED_ORDER_STEPS : READY_ORDER_STEPS;
  if (DONE.has(stage) || state === "completed") return steps.length - 1;
  if (ON_THE_WAY.has(stage) || state === "shipped") return steps.length - 2;
  if (tailored) {
    if (MADE.has(stage)) return 2;
    return stage === "SENT_TO_TAILOR" ? 1 : 0;
  }
  const paid = String(paymentStatus || "unpaid").toLowerCase() === "paid";
  return PREPARING.has(stage) || state === "confirmed" || paid ? 1 : 0;
}

/** Stages before a piece goes to the workshop: until then a measurement can still be put right. */
const BEFORE_THE_WORKSHOP = new Set(["ON_HOLD", "NEEDS_PACKING", ""]);

export function measurementsStillOpen(
  status: string,
  fulfillmentStatus: string | null | undefined,
): boolean {
  if (["cancelled", "refunded"].includes(status.toLowerCase())) return false;
  return BEFORE_THE_WORKSHOP.has(String(fulfillmentStatus ?? "").toUpperCase());
}

/** Whether the order reached the shopper, when an alteration can be asked for. */
export function orderHandedOver(status: string, fulfillmentStatus: string | null | undefined) {
  return status.toLowerCase() === "completed" || DONE.has(String(fulfillmentStatus).toUpperCase());
}

/** A WhatsApp chat with the store, a message already written. */
export function storeChatLink(chat: string | null, message: string): string | null {
  return chat ? `${chat}?text=${encodeURIComponent(message)}` : null;
}
