export type CustomerMetricOrder = {
  customer_id: string | null;
  total: number | string | null;
  created_at: string;
  status?: string | null;
  payment_status?: string | null;
  fulfillment_status?: string | null;
};

export type CustomerCrmStats = {
  totalOrders: number;
  lifetimeSpend: number;
  lastOrderDate: string | null;
  badge: "VIP" | "Churn Risk" | "New Buyer" | "Regular" | null;
};

const normalized = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export function isRecognizedPaidSale(order: CustomerMetricOrder) {
  return (
    normalized(order.payment_status) === "paid" &&
    !["cancelled", "canceled", "refunded"].includes(normalized(order.status)) &&
    !["cancelled", "canceled", "refunded"].includes(normalized(order.fulfillment_status))
  );
}

export function isActiveCustomerOrder(order: CustomerMetricOrder) {
  return (
    !["cancelled", "canceled", "refunded"].includes(normalized(order.status)) &&
    !["cancelled", "canceled", "refunded"].includes(normalized(order.fulfillment_status))
  );
}

export const DEFAULT_VIP_THRESHOLDS: Record<string, number> = {
  BHD: 250,
  KWD: 200,
  OMR: 250,
  SAR: 2500,
  AED: 2500,
  QAR: 2500,
  USD: 700,
  EUR: 650,
  GBP: 550,
};

export function getVipThreshold(currency?: string): number {
  if (!currency) return 250;
  const normalizedKey = currency.toUpperCase().trim();
  return DEFAULT_VIP_THRESHOLDS[normalizedKey] ?? 250;
}

export function buildCustomerCrmStats(
  orders: CustomerMetricOrder[],
  nowMs = Date.now(),
  currency = "BHD",
) {
  const vipThreshold = getVipThreshold(currency);
  const grouped = new Map<string, CustomerMetricOrder[]>();
  orders.filter(isActiveCustomerOrder).forEach((order) => {
    if (!order.customer_id) return;
    grouped.set(order.customer_id, [...(grouped.get(order.customer_id) ?? []), order]);
  });

  const result = new Map<string, CustomerCrmStats>();
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
  grouped.forEach((customerOrders, customerId) => {
    const totalOrders = customerOrders.length;
    const lifetimeSpend = customerOrders
      .filter(isRecognizedPaidSale)
      .reduce((sum, order) => sum + Number(order.total || 0), 0);
    const latest = customerOrders.reduce<CustomerMetricOrder | null>(
      (current, order) =>
        !current || Date.parse(order.created_at) > Date.parse(current.created_at) ? order : current,
      null,
    );
    const lastOrderDate = latest?.created_at ?? null;
    const lastOrderMs = lastOrderDate ? Date.parse(lastOrderDate) : 0;
    let badge: CustomerCrmStats["badge"] = null;
    if (lifetimeSpend >= vipThreshold) badge = "VIP";
    else if (totalOrders > 1 && lastOrderMs > 0 && nowMs - lastOrderMs > sixtyDaysMs) badge = "Churn Risk";
    else if (totalOrders === 1) badge = "New Buyer";
    else if (totalOrders > 1) badge = "Regular";
    result.set(customerId, { totalOrders, lifetimeSpend, lastOrderDate, badge });
  });
  return result;
}
