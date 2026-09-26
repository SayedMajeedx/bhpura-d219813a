import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

/**
 * The activity log: the order and inventory history lists (ActivityLogList),
 * a return's order history, and the rows the order screens write.
 *
 * Every list sits under `["activity_logs"]`, the prefix the order screens
 * refresh after each change (`invalidateActivityLogs`).
 */

export type ActivityLogFilter = {
  orderId?: string;
  productId?: string;
  variantIds?: string[];
  scope?: "order" | "product" | "inventory";
  limit?: number;
  brandId?: string;
};

export const activityLogsKeys = {
  all: () => ["activity_logs"] as const,
  list: (filter: ActivityLogFilter) => [...activityLogsKeys.all(), filter] as const,
  forOrder: (brandId: string, orderId: string) =>
    [...activityLogsKeys.all(), "order", brandId, orderId] as const,
};

/** The actions the inventory history shows. */
export const INVENTORY_ACTIONS = [
  "stock_change",
  "stock_manual",
  "variant_create",
  "variant_delete",
  "product_create",
  "product_update",
  "product_delete",
];

/**
 * The newest entries (50 by default) of the brand (when given), for an order,
 * else a product, else the inventory actions.
 */
export async function fetchActivityLogs({
  orderId,
  productId,
  scope = "order",
  limit = 50,
  brandId,
}: ActivityLogFilter) {
  let query = supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (brandId) query = query.eq("brand_id", brandId);
  if (orderId) query = query.eq("order_id", orderId);
  else if (productId) query = query.eq("product_id", productId);
  else if (scope === "inventory") query = query.in("action", INVENTORY_ACTIONS);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Every entry of one order of the brand, newest first (a return's history). */
export async function fetchOrderActivityLogs(brandId: string, orderId: string) {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("brand_id", brandId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const activityLogsQueries = {
  list: (filter: ActivityLogFilter) =>
    queryOptions({
      queryKey: activityLogsKeys.list(filter),
      queryFn: () => fetchActivityLogs(filter),
    }),
  forOrder: (brandId: string, orderId: string) =>
    queryOptions({
      queryKey: activityLogsKeys.forOrder(brandId, orderId),
      queryFn: () => fetchOrderActivityLogs(brandId, orderId),
      enabled: Boolean(brandId && orderId),
    }),
};

/** Every activity list is stale after an order or stock change. */
export function invalidateActivityLogs(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: activityLogsKeys.all() });
}

/**
 * An entry to write. `brand_id` may be left out: the `default_brand_id`
 * trigger fills it from the writer's profile.
 */
export type NewActivityLog = Omit<TablesInsert<"activity_logs">, "brand_id"> & {
  brand_id?: string | null;
};

/** Writes entries, best-effort: a failed write is ignored, as the screens always have. */
export async function insertActivityLogs(rows: NewActivityLog[]) {
  if (rows.length === 0) return;
  await supabase.from("activity_logs").insert(rows as TablesInsert<"activity_logs">[]);
}
