import { resolvePaymentStatus, type PaymentBadge } from "./payment-status";
import { detectOrderType, type OrderType } from "./order-type-detector";

export type OrderWorkflowInput = {
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  fulfillment_status?: string | null;
  fulfillment_method?: string | null;
  total?: number | string | null;
  advance_paid?: number | string | null;
  paid_amount?: number | string | null;
  order_type?: OrderType | string | null;
  order_items?: any[] | null;
  items?: any[] | null;
};

export type FulfillmentStage =
  | "pending"
  | "on_hold"
  | "needs_packing"
  | "packing"
  | "sent_to_tailor"
  | "received_from_tailor"
  | "assigned"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "completed"
  | "cancelled"
  | "failed"
  | "returned";

export type OrderNextAction =
  | "validate_payment"
  | "start_packing"
  | "send_to_tailor"
  | "receive_from_tailor"
  | "mark_ready_pickup"
  | "mark_shipped"
  | "mark_completed"
  | "prepare_pickup"
  | "pack_and_ship"
  | "confirm_pickup"
  | "hand_over_pickup"
  | "collect_and_hand_over"
  | "mark_delivered"
  | "collect_and_deliver"
  | "deliver_digital"
  | "resolve_delivery_failure"
  | "review_order"
  | "none";

export type OrderWorkflow = {
  payment: PaymentBadge;
  fulfillment: FulfillmentStage;
  nextAction: OrderNextAction;
  needsAttention: boolean;
  awaitingPayment: boolean;
  withCourier: boolean;
  terminal: boolean;
  isCod: boolean;
  isManualBenefit: boolean;
  outstanding: number;
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export function getFulfillmentStage(order: OrderWorkflowInput): FulfillmentStage {
  const fulfillment = normalize(order.fulfillment_status);
  const status = normalize(order.status);

  if (
    ["completed", "delivered", "picked_up"].includes(fulfillment) ||
    ["completed", "delivered"].includes(status)
  ) {
    return "completed";
  }
  if (
    ["cancelled", "canceled"].includes(fulfillment) ||
    ["cancelled", "canceled"].includes(status)
  ) {
    return "cancelled";
  }
  if (fulfillment === "returned" || status === "returned") return "returned";
  if (["delivery_failed", "failed"].includes(fulfillment) || status === "failed") return "failed";

  if (
    ["shipped", "out_for_delivery", "ready_for_delivery"].includes(fulfillment) ||
    status === "shipped"
  ) {
    return "out_for_delivery";
  }
  if (fulfillment === "assigned") {
    return "assigned";
  }
  if (fulfillment === "ready_for_pickup" || status === "ready_for_pickup") {
    return "ready_for_pickup";
  }
  if (fulfillment === "sent_to_tailor" || status === "sent_to_tailor") {
    return "sent_to_tailor";
  }
  if (fulfillment === "received_from_tailor" || status === "received_from_tailor") {
    return "received_from_tailor";
  }
  if (fulfillment === "on_hold" || status === "on_hold") {
    return "on_hold";
  }
  if (fulfillment === "packing" || status === "packing" || fulfillment === "needs_packing") {
    return "packing";
  }
  return "pending";
}

export function getOrderWorkflow(order: OrderWorkflowInput): OrderWorkflow {
  const total = Number(order.total ?? 0);
  const rawPaid = Number(order.advance_paid ?? order.paid_amount ?? 0);
  const pStatus = normalize(order.payment_status);
  const paid = pStatus === "paid" ? Math.max(total, rawPaid) : rawPaid;

  const payment = resolvePaymentStatus(order.payment_status, order.status, total, paid);
  const fulfillment = getFulfillmentStage(order);
  const method = normalize(order.payment_method);
  const fulfillmentMethod = normalize(order.fulfillment_method) || "delivery";
  const items = order.order_items ?? order.items ?? [];
  const detectedType = detectOrderType(items, order.order_type);
  const isTailoring =
    detectedType === "tailoring" ||
    detectedType === "mixed" ||
    fulfillment === "sent_to_tailor" ||
    fulfillment === "received_from_tailor";

  const isCod = ["cod", "cash", "cash_on_delivery", "cash on delivery"].includes(method);
  const isManualBenefit = ["benefit", "benefitpay", "benefit_pay", "bank_transfer"].includes(
    method,
  );
  const terminal =
    ["completed", "delivered", "picked_up", "cancelled", "returned"].includes(fulfillment) ||
    payment === "refunded";
  const outstanding = Math.max(0, Number((total - paid).toFixed(3)));

  // If the order is already marked as paid or has 0 outstanding balance, no cash collection is required
  const isFullyPaid = payment === "paid" || (total > 0 && outstanding <= 0);
  const requiresCollection = !isFullyPaid && (isCod || outstanding > 0);

  let nextAction: OrderNextAction = "none";

  if (!terminal) {
    if (fulfillment === "failed") {
      nextAction = "resolve_delivery_failure";
    } else if (isManualBenefit && payment !== "paid") {
      nextAction = "validate_payment";
    } else if (isTailoring) {
      if (["pending", "on_hold", "needs_packing"].includes(fulfillment)) {
        nextAction = "send_to_tailor";
      } else if (fulfillment === "sent_to_tailor") {
        nextAction = "receive_from_tailor";
      } else if (fulfillment === "received_from_tailor") {
        nextAction = "start_packing";
      } else if (fulfillment === "packing") {
        nextAction = fulfillmentMethod === "pickup" ? "mark_ready_pickup" : "mark_shipped";
      } else if (fulfillment === "ready_for_pickup") {
        nextAction = requiresCollection ? "collect_and_hand_over" : "hand_over_pickup";
      } else if (fulfillment === "out_for_delivery" || fulfillment === "assigned") {
        nextAction = requiresCollection ? "collect_and_deliver" : "mark_completed";
      }
    } else {
      // Ready Stock
      if (fulfillmentMethod === "pickup") {
        if (["pending", "on_hold", "needs_packing"].includes(fulfillment)) {
          nextAction = "prepare_pickup";
        } else if (fulfillment === "packing") {
          nextAction = "mark_ready_pickup";
        } else if (fulfillment === "ready_for_pickup") {
          nextAction = requiresCollection ? "collect_and_hand_over" : "hand_over_pickup";
        }
      } else if (fulfillmentMethod === "digital") {
        if (payment === "paid") nextAction = "deliver_digital";
      } else {
        // Delivery
        if (["pending", "on_hold", "needs_packing"].includes(fulfillment)) {
          nextAction = isCod && !isFullyPaid ? "pack_and_ship" : "start_packing";
        } else if (fulfillment === "packing") {
          nextAction = "mark_shipped";
        } else if (fulfillment === "assigned") {
          nextAction = "confirm_pickup";
        } else if (fulfillment === "out_for_delivery") {
          nextAction = requiresCollection ? "collect_and_deliver" : "mark_delivered";
        } else if (!method) {
          nextAction = "review_order";
        }
      }
    }
  }

  const awaitingPayment = !terminal && !isCod && payment !== "paid";

  return {
    payment,
    fulfillment,
    nextAction,
    needsAttention: nextAction !== "none",
    awaitingPayment,
    withCourier: fulfillment === "out_for_delivery",
    terminal,
    isCod,
    isManualBenefit,
    outstanding,
  };
}
