import { getFulfillmentStage, getOrderWorkflow } from "@/lib/order-workflow";
import { getOrderCustomerName } from "@/lib/order-customer-snapshot";
import { matchesPaymentMethodFilter, type PaymentMethodFilter } from "@/lib/payment-method";
import { resolvePaymentStatus } from "@/lib/payment-status";
import type { Order } from "@/features/orders/types";

/**
 * Pure rules for the orders list: stages, the quick tabs and their counts,
 * search and filters, and sorting.
 */

export function normalizedFulfillmentStage(order: any): string {
  return getFulfillmentStage(order);
}

export function orderNeedsOperatorAction(order: any, hasMadeToOrder?: boolean): boolean {
  return getOrderWorkflow(order, { productionStages: hasMadeToOrder }).needsAttention;
}

type Workflow = ReturnType<typeof getOrderWorkflow>;

/** "To prepare": still open, in a preparation stage, and paid or cash on delivery. */
export function isToPrepare(workflow: Workflow, hasMadeToOrder: boolean): boolean {
  return (
    !workflow.terminal &&
    [
      "pending",
      "packing",
      "on_hold",
      "needs_packing",
      ...(hasMadeToOrder
        ? ["received_from_workshop", "sent_to_workshop", "received_from_tailor", "sent_to_tailor"]
        : []),
    ].includes(workflow.fulfillment) &&
    (!workflow.awaitingPayment || workflow.isCod)
  );
}

/** Counts for the quick tabs; archived historical orders count only when shown. */
export function orderTabCounts(
  orders: Order[],
  { includeHistorical, hasMadeToOrder }: { includeHistorical: boolean; hasMadeToOrder: boolean },
) {
  let all = 0;
  let unpaid = 0;
  let action_required = 0;
  let to_prepare = 0;
  let shipped = 0;
  let completed = 0;

  for (const order of orders) {
    if (order.status === "archived_historical" && !includeHistorical) {
      continue;
    }

    const workflow = getOrderWorkflow(order, { productionStages: hasMadeToOrder });

    all++;
    if (workflow.awaitingPayment) unpaid++;
    if (workflow.needsAttention) action_required++;
    if (isToPrepare(workflow, hasMadeToOrder)) to_prepare++;
    if (workflow.withCourier) shipped++;
    if (workflow.fulfillment === "completed") completed++;
  }

  return { all, unpaid, action_required, to_prepare, shipped, completed };
}

export type OrderQueueFilters = {
  search: string;
  paymentFilter: string;
  fulfillmentStatusFilter: string;
  fulfillmentMethodFilter: string;
  gatewayFilter: PaymentMethodFilter;
  tabFilter: string;
  includeHistorical: boolean;
  hasMadeToOrder: boolean;
};

/**
 * Orders matching the search (invoice number, customer, status, payment method,
 * digital contact), the payment, stage, method and gateway filters, and the
 * quick tab. `search` is already trimmed and lower-cased.
 */
export function filterQueueOrders(orders: Order[], f: OrderQueueFilters): Order[] {
  return orders.filter((order) => {
    // Hide archived historical orders by default unless includeHistorical is toggled on
    if (order.status === "archived_historical" && !f.includeHistorical) {
      return false;
    }

    const matchesSearch =
      !f.search ||
      [
        order.invoice_number,
        getOrderCustomerName(order),
        order.status,
        order.payment_method,
        order.digital_delivery_contact,
      ].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(f.search),
      );

    if (!matchesSearch) return false;
    const paymentBadge = resolvePaymentStatus(
      order.payment_status,
      order.status,
      Number(order.total),
      Number(order.advance_paid ?? 0),
    );
    const ff = String(order.fulfillment_status || "").toUpperCase();
    const isPendingVerification =
      String(order.status ?? "").toLowerCase() === "pending_verification" &&
      paymentBadge === "unpaid" &&
      !["COMPLETED", "DELIVERED", "CANCELLED"].includes(ff);
    if (
      f.paymentFilter !== "all" &&
      (f.paymentFilter === "pending_verification"
        ? !isPendingVerification
        : paymentBadge !== f.paymentFilter || isPendingVerification)
    ) {
      return false;
    }
    if (
      f.fulfillmentStatusFilter !== "all" &&
      normalizedFulfillmentStage(order) !== f.fulfillmentStatusFilter
    ) {
      return false;
    }
    if (
      f.fulfillmentMethodFilter !== "all" &&
      order.fulfillment_method !== f.fulfillmentMethodFilter
    ) {
      return false;
    }
    if (!matchesPaymentMethodFilter(order.payment_method, f.gatewayFilter)) return false;

    // Quick tab routing
    if (f.tabFilter === "unpaid") {
      return getOrderWorkflow(order, { productionStages: f.hasMadeToOrder }).awaitingPayment;
    }
    if (f.tabFilter === "action_required") {
      return orderNeedsOperatorAction(order, f.hasMadeToOrder);
    }
    if (f.tabFilter === "to_prepare") {
      return isToPrepare(
        getOrderWorkflow(order, { productionStages: f.hasMadeToOrder }),
        f.hasMadeToOrder,
      );
    }
    if (f.tabFilter === "shipped") {
      return normalizedFulfillmentStage(order) === "out_for_delivery";
    }
    if (f.tabFilter === "completed") {
      return normalizedFulfillmentStage(order) === "completed";
    }

    return true; // tabFilter === "all"
  });
}

/**
 * Sorted copy. Invoice number, date and total sort numerically; customer and
 * status sort as lower-cased text.
 */
export function sortQueueOrders(
  orders: Order[],
  sortField: string,
  sortDirection: string,
): Order[] {
  const list = [...orders];
  list.sort((a, b) => {
    let valA: any = "";
    let valB: any = "";

    if (sortField === "invoice_number") {
      valA = a.invoice_number ?? 0;
      valB = b.invoice_number ?? 0;
      return sortDirection === "asc" ? valA - valB : valB - valA;
    } else if (sortField === "created_at") {
      valA = new Date(a.created_at ?? a.order_date).getTime();
      valB = new Date(b.created_at ?? b.order_date).getTime();
      return sortDirection === "asc" ? valA - valB : valB - valA;
    } else if (sortField === "customer") {
      valA = getOrderCustomerName(a);
      valB = getOrderCustomerName(b);
    } else if (sortField === "status") {
      valA = a.status ?? "";
      valB = b.status ?? "";
    } else if (sortField === "total") {
      valA = Number(a.total ?? 0);
      valB = Number(b.total ?? 0);
      return sortDirection === "asc" ? valA - valB : valB - valA;
    }

    valA = String(valA).toLowerCase();
    valB = String(valB).toLowerCase();

    if (valA < valB) return sortDirection === "asc" ? -1 : 1;
    if (valA > valB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });
  return list;
}
