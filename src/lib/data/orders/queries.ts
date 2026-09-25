import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ordersKeys } from "./keys";
import { ORDER_DETAIL_SELECT, ORDER_LIST_SELECT } from "./selects";
import type { OrderDetail, OrderListRow, OrderScope } from "./types";

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

/**
 * Ready-made `useQuery` options. Spread them and add screen-specific options;
 * never override `queryFn`.
 */
export const ordersQueries = {
  list: (brandId: string, scope: OrderScope) =>
    queryOptions({
      queryKey: ordersKeys.list(brandId, scope),
      queryFn: () => fetchOrderList(brandId, scope),
      staleTime: 30_000,
      ...pollingFor(scope),
    }),

  detail: (brandId: string, orderId: string, scope: OrderScope) =>
    queryOptions({
      queryKey: ordersKeys.detail(brandId, orderId, scope),
      queryFn: () => fetchOrderDetail(brandId, orderId, scope),
      ...pollingFor(scope),
    }),
};
