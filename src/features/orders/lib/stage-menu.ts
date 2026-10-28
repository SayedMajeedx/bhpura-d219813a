/**
 * The stages a member of staff may move an order to by hand (the order page's stage menu), and
 * what to tell them before a change that touches money.
 *
 * The next step of an order is its own button; this menu is for the cases outside the usual path,
 * so it offers only what the order's way of reaching the customer can do: a parcel is shipped, a
 * pickup is made ready, a digital order is delivered, an appointment is done. It never offers a
 * step another kind of order owns ("ready for pickup" on a delivery).
 */

export type StageKey =
  | "workshop_sent"
  | "workshop_received"
  | "packing"
  | "ready_pickup"
  | "shipped"
  | "complete"
  | "hold"
  | "cancel";

export type StageEntry = { key: StageKey; status: string; fulfillmentStatus: string };

const ENTRY: Record<StageKey, StageEntry> = {
  workshop_sent: {
    key: "workshop_sent",
    status: "sent_to_tailor",
    fulfillmentStatus: "SENT_TO_TAILOR",
  },
  workshop_received: {
    key: "workshop_received",
    status: "received_from_tailor",
    fulfillmentStatus: "RECEIVED_FROM_TAILOR",
  },
  packing: { key: "packing", status: "packing", fulfillmentStatus: "PACKING" },
  ready_pickup: {
    key: "ready_pickup",
    status: "ready_for_pickup",
    fulfillmentStatus: "READY_FOR_PICKUP",
  },
  shipped: { key: "shipped", status: "shipped", fulfillmentStatus: "SHIPPED" },
  complete: { key: "complete", status: "completed", fulfillmentStatus: "COMPLETED" },
  hold: { key: "hold", status: "pending", fulfillmentStatus: "ON_HOLD" },
  cancel: { key: "cancel", status: "cancelled", fulfillmentStatus: "CANCELLED" },
};

/** The entries of the menu for an order, in the order they are shown. */
export function stageMenuEntries(
  order: { fulfillment_method?: string | null; fulfillment_status?: string | null },
  options: { workshop: boolean },
): StageEntry[] {
  const method = String(order.fulfillment_method ?? "delivery").toLowerCase();
  const stage = String(order.fulfillment_status ?? "").toUpperCase();
  if (method === "appointment") return [ENTRY.complete, ENTRY.cancel];
  const keys: StageKey[] = [];
  const workshopStage = stage === "SENT_TO_TAILOR" || stage === "RECEIVED_FROM_TAILOR";
  if (method !== "digital" && (options.workshop || workshopStage)) {
    keys.push("workshop_sent", "workshop_received");
  }
  if (method !== "digital") keys.push("packing");
  if (method === "pickup") keys.push("ready_pickup");
  if (method === "delivery") keys.push("shipped");
  keys.push("complete", "hold", "cancel");
  return keys.map((key) => ENTRY[key]);
}

type Lang = "ar" | "en";

/**
 * A line to read before the change is confirmed, or null. Completing an order that still owes
 * money records no payment; cancelling one that was paid does not return the money.
 */
export function stageChangeWarning(
  order: {
    total?: unknown;
    advance_paid?: unknown;
    payment_status?: unknown;
    fulfillment_method?: string | null;
  },
  targetFulfillmentStatus: string,
  lang: Lang,
  money: (amount: number) => string,
): string | null {
  const ar = lang === "ar";
  const total = Number(order.total) || 0;
  const paid =
    String(order.payment_status ?? "").toLowerCase() === "paid"
      ? total
      : Math.min(total, Number(order.advance_paid) || 0);
  const owed = Math.max(0, Math.round((total - paid) * 1000) / 1000);
  const appointment = String(order.fulfillment_method ?? "").toLowerCase() === "appointment";

  if (targetFulfillmentStatus === "CANCELLED") {
    const parts: string[] = [];
    if (paid > 0) {
      parts.push(
        ar
          ? `تم تحصيل ${money(paid)} من العميل. الإلغاء لا يُرجع المبلغ: أعده للعميل بنفسك.`
          : `${money(paid)} was already collected. Cancelling does not return it: refund the customer yourself.`,
      );
    }
    parts.push(
      appointment
        ? ar
          ? "يُلغى الحجز أيضًا ويُفرج عن موعده."
          : "The booking is cancelled too and its day is released."
        : ar
          ? "يعود المخزون المحجوز إلى الرف."
          : "Reserved stock goes back to the shelf.",
    );
    return parts.join(" ");
  }
  if (targetFulfillmentStatus === "COMPLETED" && owed > 0) {
    return ar
      ? `ما زال ${money(owed)} غير مدفوع. الإتمام لا يسجّل أي دفعة: حصّله أولًا بخطوة الطلب نفسها أو سجّل الدفع.`
      : `${money(owed)} is still unpaid. Completing records no payment: collect it first with the order's own step, or record the payment.`;
  }
  return null;
}
