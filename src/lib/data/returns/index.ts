import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

/**
 * Return requests and the brand's return policy: the dashboard's "waiting for
 * action" count, the order editor's linked returns, the shopper's returns on
 * the account page, and the policy (its editor, the readiness checklist and the
 * shopper's return request). The admin returns list and detail still read
 * directly: their select asks for variant columns that do not exist (bug
 * backlog #22).
 */

export const returnsKeys = {
  all: (brandId: string) => ["returns", brandId] as const,
  pendingCount: (brandId: string) => [...returnsKeys.all(brandId), "pending-count"] as const,
  forOrder: (brandId: string, orderId: string) =>
    [...returnsKeys.all(brandId), "order", orderId] as const,
  /** The shopper's own returns on the account page. */
  customer: (brandId: string, customerId: string) =>
    [...returnsKeys.all(brandId), "customer", customerId] as const,
  policy: (brandId: string) => [...returnsKeys.all(brandId), "policy"] as const,
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

/** The shopper's returns with their order and items, newest first. */
export async function fetchCustomerReturns(brandId: string, customerId: string) {
  const { data, error } = await supabase
    .from("return_requests")
    .select(
      `
          id,
          return_number,
          status,
          type,
          created_at,
          net_refund_amount,
          reason,
          order:orders (
            invoice_number,
            total
          ),
          items:return_items (
            id,
            quantity,
            unit_price,
            product:products (name_ar, name_en)
          )
        `,
    )
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** The brand's return policy, or null when it has none yet. */
export async function fetchReturnPolicy(brandId: string) {
  const { data, error } = await supabase
    .from("brand_return_policies")
    .select("*")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export type ReturnPolicyRow = NonNullable<Awaited<ReturnType<typeof fetchReturnPolicy>>>;

export const returnsQueries = {
  customer: (brandId: string, customerId: string) =>
    queryOptions({
      queryKey: returnsKeys.customer(brandId, customerId),
      queryFn: () => fetchCustomerReturns(brandId, customerId),
      enabled: Boolean(brandId && customerId),
    }),
  policy: (brandId: string) =>
    queryOptions({
      queryKey: returnsKeys.policy(brandId),
      queryFn: () => fetchReturnPolicy(brandId),
      enabled: Boolean(brandId),
    }),
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

// ── Writes ──────────────────────────────────────────────────────────────────

/** Saves the brand's return policy, creating it when there is none (upsert on brand). */
export async function saveReturnPolicy(
  brandId: string,
  values: Omit<TablesInsert<"brand_return_policies">, "brand_id">,
) {
  const { error } = await supabase
    .from("brand_return_policies")
    .upsert({ ...values, brand_id: brandId }, { onConflict: "brand_id" });
  if (error) throw error;
}

/** Everything cached about the brand's returns and policy is stale after a write. */
export function invalidateReturns(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: returnsKeys.all(brandId) });
}
