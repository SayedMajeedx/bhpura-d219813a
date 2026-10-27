import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Whether a store takes orders (migration 20261027110000): its busy pause
 * (`business_settings.orders_paused_until`) and its opening hours, as the dashboard's
 * `StoreStatusCard` reads them and sets the pause. The hours are saved with the store's settings.
 */

export const storeStatusKeys = {
  detail: (brandId: string) => ["store-status", brandId] as const,
};

export type StoreStatus = { orders_paused_until: string | null; opening_hours: unknown };

export async function fetchStoreStatus(brandId: string): Promise<StoreStatus> {
  const { data, error } = await supabase
    .from("business_settings")
    .select("orders_paused_until, opening_hours")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  return {
    orders_paused_until: data?.orders_paused_until ?? null,
    opening_hours: data?.opening_hours ?? {},
  };
}

/**
 * Pauses new orders until a moment ("infinity": until reopened), or lifts the pause (null).
 * Fails on a write that changed nothing (a member who may not change the store's settings).
 */
export async function setOrdersPause(brandId: string, until: string | null) {
  const { data, error } = await supabase
    .from("business_settings")
    .update({ orders_paused_until: until })
    .eq("brand_id", brandId)
    .select("brand_id");
  if (error) throw error;
  if (!data?.length) throw new Error("SETTINGS_NOT_SAVED");
}

export function invalidateStoreStatus(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: storeStatusKeys.detail(brandId) });
}

export const storeStatusQueries = {
  detail: (brandId: string) =>
    queryOptions({
      queryKey: storeStatusKeys.detail(brandId),
      queryFn: () => fetchStoreStatus(brandId),
      enabled: Boolean(brandId),
    }),
};
