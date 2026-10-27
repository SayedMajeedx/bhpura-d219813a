import {
  getOrderWorkflow,
  type OrderNextAction,
  type OrderWorkflowInput,
} from "@/lib/order-workflow";

/**
 * The orders board: open orders in columns by where they stand, each card with the list's own
 * next-step button. A card may also be dragged (on a laptop), but only to the column its next step
 * takes it to; the drop presses that same button, so the board never moves an order in a way the
 * list could not. Where an order stands is `getOrderWorkflow`, the list's reading.
 */

export type BoardColumn =
  "to_confirm" | "preparing" | "workshop" | "ready" | "on_the_way" | "scheduled" | "done";

export const BOARD_COLUMNS: Array<{ id: BoardColumn; ar: string; en: string }> = [
  { id: "to_confirm", ar: "للتأكيد", en: "To confirm" },
  { id: "preparing", ar: "قيد التجهيز", en: "Preparing" },
  { id: "workshop", ar: "في الورشة", en: "At the workshop" },
  { id: "ready", ar: "جاهز", en: "Ready" },
  { id: "on_the_way", ar: "في الطريق", en: "On the way" },
  { id: "scheduled", ar: "مواعيد", en: "Appointments" },
  { id: "done", ar: "أُنجز اليوم", en: "Done today" },
];

type BoardOrder = OrderWorkflowInput & {
  completed_at?: string | null;
  delivered_at?: string | null;
  updated_at?: string | null;
};

/** The column an order sits in now; null when it is off the board (cancelled, failed, old). */
export function columnOf(
  order: BoardOrder,
  now: Date = new Date(),
  productionStages = false,
): BoardColumn | null {
  const flow = getOrderWorkflow(order, { productionStages });
  switch (flow.fulfillment) {
    case "pending":
    case "on_hold":
      return "to_confirm";
    case "needs_packing":
    case "packing":
    case "received_from_workshop":
    case "received_from_tailor":
      return "preparing";
    case "awaiting_tailor":
    case "sent_to_workshop":
    case "sent_to_tailor":
      return "workshop";
    case "assigned":
    case "ready_for_pickup":
      return "ready";
    case "out_for_delivery":
      return "on_the_way";
    case "scheduled":
      return "scheduled";
    case "completed": {
      const at = order.completed_at ?? order.delivered_at ?? order.updated_at;
      if (!at) return null;
      const done = new Date(at);
      const sameDay =
        done.getFullYear() === now.getFullYear() &&
        done.getMonth() === now.getMonth() &&
        done.getDate() === now.getDate();
      return sameDay ? "done" : null;
    }
    default:
      return null;
  }
}

/** Where an order's next step takes it on the board; null for a step that does not move it. */
export function columnAfter(action: OrderNextAction): BoardColumn | null {
  switch (action) {
    case "start_packing":
    case "receive_from_workshop":
    case "receive_from_tailor":
      return "preparing";
    case "send_to_workshop":
    case "send_to_tailor":
      return "workshop";
    case "mark_ready_pickup":
    case "prepare_pickup":
    case "confirm_pickup":
      return "ready";
    case "mark_shipped":
    case "pack_and_ship":
      return "on_the_way";
    case "mark_completed":
    case "hand_over_pickup":
    case "collect_and_hand_over":
    case "mark_delivered":
    case "collect_and_deliver":
    case "deliver_digital":
    case "complete_service":
    case "collect_and_complete_service":
      return "done";
    default:
      return null;
  }
}

/** Whether a card may be dropped on a column: only where its own next step takes it. */
export function canDrop(order: BoardOrder, column: BoardColumn, productionStages = false): boolean {
  const target = columnAfter(getOrderWorkflow(order, { productionStages }).nextAction);
  return (
    target !== null && target === column && columnOf(order, new Date(), productionStages) !== column
  );
}

/**
 * The board: each column with its orders (oldest first, as they wait), and the columns a store
 * shows (the workshop only with made-to-order pieces, appointments only for a store that books).
 */
export function boardColumns<T extends BoardOrder & { created_at?: string | null }>(
  orders: readonly T[],
  opts: { madeToOrder: boolean; bookings: boolean },
  now: Date = new Date(),
): Array<{ id: BoardColumn; ar: string; en: string; orders: T[] }> {
  const shown = BOARD_COLUMNS.filter(
    (c) => (c.id !== "workshop" || opts.madeToOrder) && (c.id !== "scheduled" || opts.bookings),
  );
  const byColumn = new Map<BoardColumn, T[]>(shown.map((c) => [c.id, []]));
  for (const order of orders) {
    const column = columnOf(order, now, opts.madeToOrder);
    if (column) byColumn.get(column)?.push(order);
  }
  const oldestFirst = (a: T, b: T) =>
    String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  return shown.map((c) => ({ ...c, orders: (byColumn.get(c.id) ?? []).sort(oldestFirst) }));
}
