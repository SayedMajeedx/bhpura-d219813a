import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ordersKeys } from "./keys";
import {
  ORDER_COGS_SELECT,
  ORDER_DETAIL_SELECT,
  ORDER_FINANCE_SELECT,
  ORDER_LIST_SELECT,
  ORDER_RECENT_SELECT,
  ORDER_RECONCILIATION_SELECT,
} from "./selects";
import type { OrderDetail, OrderListRow, OrderScope } from "./types";
import {
  fetchCustomerMetricOrders,
  fetchCustomerOrders,
  fetchOrderForStory,
  fetchOrderInvoiceNumber,
  fetchOrdersForExport,
  fetchPromoOrders,
  fetchVariantSales,
} from "./readers";

/**
 * Admin order reads. Every fetcher filters by `brand_id` on top of RLS. A
 * courier only gets deliveries assigned to them. Screens use
 * `ordersQueries.*` so a key is always filled by the same fetcher.
 */

/**
 * Orders change while staff work: poll as a fallback for realtime, faster
 * for couriers whose phones drop the realtime socket.
 */
const pollingFor = (scope: OrderScope) =>
  ({
    refetchInterval: scope === "assigned-courier" ? 10_000 : 30_000,
    refetchOnWindowFocus: true,
  }) as const;

async function currentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** The brand's orders, newest first; a courier gets only their assigned deliveries. */
export async function fetchOrderList(brandId: string, scope: OrderScope): Promise<OrderListRow[]> {
  let query = supabase.from("orders").select(ORDER_LIST_SELECT).eq("brand_id", brandId);
  if (scope === "assigned-courier") {
    const userId = await currentUserId();
    if (!userId) return [];
    query = query.eq("assigned_to", userId).eq("fulfillment_method", "delivery");
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** One order of the brand; a courier can only open deliveries assigned to them. */
export async function fetchOrderDetail(
  brandId: string,
  orderId: string,
  scope: OrderScope,
): Promise<OrderDetail> {
  let query = supabase
    .from("orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("id", orderId)
    .eq("brand_id", brandId);
  if (scope === "assigned-courier") {
    const userId = await currentUserId();
    if (!userId) throw new Error("Not authenticated");
    query = query.eq("assigned_to", userId).eq("fulfillment_method", "delivery");
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Order not found. It may have been deleted.");
  return data;
}

/** Every order of the brand for the finance views, newest first. */
export async function fetchFinanceOrders(brandId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_FINANCE_SELECT)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export type OrderFinanceRow = Awaited<ReturnType<typeof fetchFinanceOrders>>[number];

/** The brand's latest orders. */
export async function fetchRecentOrders(brandId: string, limit: number) {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_RECENT_SELECT)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
export type OrderRecentRow = Awaited<ReturnType<typeof fetchRecentOrders>>[number];

/** The brand's latest orders with their cash reconciliation status. */
export async function fetchReconciliationOrders(brandId: string, limit: number) {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_RECONCILIATION_SELECT)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
export type OrderReconciliationRow = Awaited<ReturnType<typeof fetchReconciliationOrders>>[number];

/** Statuses whose lines count as cost of goods sold. */
export const COGS_ORDER_STATUSES = [
  "confirmed",
  "paid",
  "shipped",
  "completed",
  "delivered",
  "ready_for_pickup",
  "picked_up",
];

/**
 * Orders whose lines count as COGS, created in `[from, to]` (whole days,
 * `YYYY-MM-DD`; an empty bound is open), newest first.
 */
export async function fetchCogsOrders(brandId: string, from: string, to: string) {
  let query = supabase
    .from("orders")
    .select(ORDER_COGS_SELECT)
    .eq("brand_id", brandId)
    .in("status", COGS_ORDER_STATUSES)
    .order("created_at", { ascending: false });
  if (from) query = query.gte("created_at", from);
  if (to) {
    // Include the whole last day
    const endDay = new Date(to);
    endDay.setDate(endDay.getDate() + 1);
    query = query.lt("created_at", endDay.toISOString().slice(0, 10));
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
export type OrderCogsRow = Awaited<ReturnType<typeof fetchCogsOrders>>[number];

/**
 * Ready-made `useQuery` options. Spread them and add screen-specific options;
 * never override `queryFn`.
 */
export const ordersQueries = {
  customerMetrics: (brandId: string) =>
    queryOptions({
      queryKey: ordersKeys.customerMetrics(brandId),
      queryFn: () => fetchCustomerMetricOrders(brandId),
      enabled: Boolean(brandId),
      staleTime: 30_000,
    }),
  customerOrders: (brandId: string, customerId: string) =>
    queryOptions({
      queryKey: ordersKeys.customerOrders(brandId, customerId),
      queryFn: () => fetchCustomerOrders(brandId, customerId),
      enabled: Boolean(brandId && customerId),
    }),
  promoOrders: (brandId: string) =>
    queryOptions({
      queryKey: ordersKeys.promoUsage(brandId),
      queryFn: () => fetchPromoOrders(brandId),
      enabled: Boolean(brandId),
    }),
  variantSales: (brandId: string, days: number) =>
    queryOptions({
      queryKey: ordersKeys.variantSales(brandId, days),
      queryFn: () => fetchVariantSales(brandId, days),
      enabled: Boolean(brandId),
      staleTime: 30_000,
    }),
  exportRows: (brandId: string) =>
    queryOptions({
      queryKey: ordersKeys.exportRows(brandId),
      queryFn: () => fetchOrdersForExport(brandId),
      enabled: Boolean(brandId),
    }),
  story: (brandId: string, orderId: string) =>
    queryOptions({
      queryKey: ordersKeys.story(brandId, orderId),
      queryFn: () => fetchOrderForStory(brandId, orderId),
      enabled: Boolean(brandId && orderId),
      staleTime: 60_000,
    }),
  invoiceNumber: (brandId: string, orderId: string) =>
    queryOptions({
      queryKey: ordersKeys.invoiceNumber(brandId, orderId),
      queryFn: () => fetchOrderInvoiceNumber(brandId, orderId),
      enabled: Boolean(brandId && orderId),
      staleTime: 5 * 60_000,
    }),
  list: (brandId: string, scope: OrderScope) =>
    queryOptions({
      queryKey: ordersKeys.list(brandId, scope),
      queryFn: () => fetchOrderList(brandId, scope),
      staleTime: 30_000,
      ...pollingFor(scope),
    }),

  finance: (brandId: string) =>
    queryOptions({
      queryKey: ordersKeys.finance(brandId),
      queryFn: () => fetchFinanceOrders(brandId),
      staleTime: 60_000,
    }),

  recent: (brandId: string, limit: number) =>
    queryOptions({
      queryKey: ordersKeys.recent(brandId, limit),
      queryFn: () => fetchRecentOrders(brandId, limit),
      staleTime: 60_000,
    }),

  reconciliation: (brandId: string, limit: number) =>
    queryOptions({
      queryKey: ordersKeys.reconciliation(brandId, limit),
      queryFn: () => fetchReconciliationOrders(brandId, limit),
    }),

  cogs: (brandId: string, from: string, to: string) =>
    queryOptions({
      queryKey: ordersKeys.cogs(brandId, from, to),
      queryFn: () => fetchCogsOrders(brandId, from, to),
    }),

  detail: (brandId: string, orderId: string, scope: OrderScope) =>
    queryOptions({
      queryKey: ordersKeys.detail(brandId, orderId, scope),
      queryFn: () => fetchOrderDetail(brandId, orderId, scope),
      ...pollingFor(scope),
    }),
};
