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

export type CustomerSegmentType = "vip" | "repeat" | "new" | "churn" | "lead";

export interface CustomerSegmentBadgeDetails {
  segment: CustomerSegmentType;
  label: { ar: string; en: string };
  classes: string;
  iconName: "crown" | "repeat" | "user-plus" | "alert-triangle" | "user";
}

export function resolveCustomerSegmentBadge(params: {
  totalOrders: number;
  lifetimeSpend: number;
  lastOrderDate?: string | null;
  currency?: string;
  nowMs?: number;
}): CustomerSegmentBadgeDetails {
  const { totalOrders, lifetimeSpend, lastOrderDate, currency = "BHD", nowMs = Date.now() } = params;
  const vipThreshold = getVipThreshold(currency);
  const lastOrderMs = lastOrderDate ? Date.parse(lastOrderDate) : 0;
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

  // 1. VIP: Lifetime spend meets threshold OR placed 3+ orders with substantial value
  if (lifetimeSpend >= vipThreshold || (totalOrders >= 3 && lifetimeSpend >= 100)) {
    return {
      segment: "vip",
      label: { ar: "عميل مميز (VIP)", en: "VIP Customer" },
      classes:
        "bg-amber-100 text-amber-900 border border-amber-300/80 font-bold dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      iconName: "crown",
    };
  }

  // 2. Churn Risk: Has multiple orders but no activity in the last 60 days
  if (totalOrders > 1 && lastOrderMs > 0 && nowMs - lastOrderMs > sixtyDaysMs) {
    return {
      segment: "churn",
      label: { ar: "عميل راكد (+60 يوم)", en: "Churn Risk (+60d)" },
      classes:
        "bg-rose-100 text-rose-900 border border-rose-300/80 font-bold dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
      iconName: "alert-triangle",
    };
  }

  // 3. Repeat Buyer: Has MORE THAN ONE order (>= 2 orders) and is active
  if (totalOrders > 1) {
    return {
      segment: "repeat",
      label: { ar: "عميل متكرر", en: "Repeat Buyer" },
      classes:
        "bg-emerald-100 text-emerald-900 border border-emerald-300/80 font-bold dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
      iconName: "repeat",
    };
  }

  // 4. New Customer: EXACTLY ONE order
  if (totalOrders === 1) {
    return {
      segment: "new",
      label: { ar: "عميل جديد", en: "New Customer" },
      classes:
        "bg-blue-100 text-blue-900 border border-blue-300/80 font-bold dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
      iconName: "user-plus",
    };
  }

  // 5. Lead / Prospective: 0 orders
  return {
    segment: "lead",
    label: { ar: "بدون طلبات", en: "No Orders Yet" },
    classes: "bg-muted text-muted-foreground border border-border font-medium",
    iconName: "user",
  };
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
    if (lifetimeSpend >= vipThreshold || (totalOrders >= 3 && lifetimeSpend >= 100)) badge = "VIP";
    else if (totalOrders > 1 && lastOrderMs > 0 && nowMs - lastOrderMs > sixtyDaysMs) badge = "Churn Risk";
    else if (totalOrders === 1) badge = "New Buyer";
    else if (totalOrders > 1) badge = "Regular";
    result.set(customerId, { totalOrders, lifetimeSpend, lastOrderDate, badge });
  });
  return result;
}
