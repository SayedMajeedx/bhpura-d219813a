import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Return requests. So far the dashboard's "waiting for action" count and the
 * order editor's linked returns read through here; the returns screens join
 * when their domain moves.
 */

export const returnsKeys = {
  all: (brandId: string) => ["returns", brandId] as const,
  pendingCount: (brandId: string) => [...returnsKeys.all(brandId), "pending-count"] as const,
  forOrder: (brandId: string, orderId: string) =>
    [...returnsKeys.all(brandId), "order", orderId] as const,
};

/** Statuses of a return that still needs the merchant (review, inspection, receipt). */
export const PENDING_RETURN_STATUSES = ["new", "under_review", "under_inspection", "received"];

/** How many of the brand's returns still need action. A failed count reads as zero. */
export async function fetchPendingReturnsCount(brandId: string): Promise<number> {
  const { count, error } = await supabase
    .from("return_requests")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .in("status", PENDING_RETURN_STATUSES);
  if (error) return 0;
  return count ?? 0;
}

/**
 * The returns linked to one order, newest first (order editor). A failure is
 * logged (unless it is an expired session, PGRST301) and reads as none.
 */
export async function fetchOrderReturns(brandId: string, orderId: string) {
  const { data, error } = await supabase
    .from("return_requests")
    .select("id, return_number, type, status, refund_status, net_refund_amount, reason, created_at")
    .eq("brand_id", brandId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) {
    if (error.code !== "PGRST301") {
      console.warn("Could not query return_requests for order:", error);
    }
    return [];
  }
  return data ?? [];
}

export const returnsQueries = {
  forOrder: (brandId: string, orderId: string) =>
    queryOptions({
      queryKey: returnsKeys.forOrder(brandId, orderId),
      queryFn: () => fetchOrderReturns(brandId, orderId),
      enabled: Boolean(brandId && orderId && orderId !== "new"),
    }),
  pendingCount: (brandId: string) =>
    queryOptions({
      queryKey: returnsKeys.pendingCount(brandId),
      queryFn: () => fetchPendingReturnsCount(brandId),
      enabled: Boolean(brandId),
      staleTime: 60_000,
    }),
};
