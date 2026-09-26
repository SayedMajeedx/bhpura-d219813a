import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import {
  DEFAULT_ABANDONED_SEQUENCES,
  type AbandonedCart,
  type AbandonedCartDispatchLog,
  type AbandonedCartSequence,
  type BrandAbandonedCartSettings,
} from "@/lib/abandoned-carts.types";

/**
 * The admin abandoned-carts screen: the brand's recovery settings, its
 * recovery steps, the carts and the send log, and the settings and step
 * writes. The storefront side (cart activity, restore, coupons) goes through
 * the server functions in `@/lib/abandoned-carts.functions`.
 *
 * Rows come back as the domain types of `@/lib/abandoned-carts.types`, which
 * narrow the text columns (status, channel) and the cart's JSON lines.
 */

export const abandonedCartsKeys = {
  all: (brandId: string) => ["abandoned-carts", brandId] as const,
  settings: (brandId: string) => [...abandonedCartsKeys.all(brandId), "settings"] as const,
  sequences: (brandId: string) => [...abandonedCartsKeys.all(brandId), "sequences"] as const,
  carts: (brandId: string) => [...abandonedCartsKeys.all(brandId), "carts"] as const,
  dispatchLogs: (brandId: string) => [...abandonedCartsKeys.all(brandId), "dispatch-logs"] as const,
};

/** A cart with the name and contact of its customer, when it has one. */
export type AbandonedCartWithCustomer = AbandonedCart & {
  customers?: { name: string; email: string; phone: string } | null;
};

/** The brand's recovery settings, or null before the first save. */
export async function fetchAbandonedCartSettings(brandId: string) {
  const { data, error } = await supabase
    .from("brand_abandoned_cart_settings")
    .select("*")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  return data as BrandAbandonedCartSettings | null;
}

/** The brand's recovery steps, in order. */
export async function fetchRecoverySequences(brandId: string) {
  const { data, error } = await supabase
    .from("abandoned_cart_sequences")
    .select("*")
    .eq("brand_id", brandId)
    .order("step_number", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AbandonedCartSequence[];
}

/** The brand's latest 200 carts that still hold items, most recently active first. */
export async function fetchAbandonedCarts(brandId: string) {
  const { data, error } = await supabase
    .from("abandoned_carts")
    .select("*, customers(name, email, phone)")
    .eq("brand_id", brandId)
    .order("last_activity_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as AbandonedCartWithCustomer[]).filter(
    (cart) => Array.isArray(cart.cart_items) && cart.cart_items.length > 0,
  );
}

/** The brand's latest 100 recovery messages, newest first. */
export async function fetchDispatchLogs(brandId: string) {
  const { data, error } = await supabase
    .from("abandoned_cart_dispatch_logs")
    .select("*")
    .eq("brand_id", brandId)
    .order("sent_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as AbandonedCartDispatchLog[];
}

export const abandonedCartsQueries = {
  settings: (brandId: string) =>
    queryOptions({
      queryKey: abandonedCartsKeys.settings(brandId),
      queryFn: () => fetchAbandonedCartSettings(brandId),
      enabled: Boolean(brandId),
    }),
  sequences: (brandId: string) =>
    queryOptions({
      queryKey: abandonedCartsKeys.sequences(brandId),
      queryFn: () => fetchRecoverySequences(brandId),
      enabled: Boolean(brandId),
    }),
  carts: (brandId: string) =>
    queryOptions({
      queryKey: abandonedCartsKeys.carts(brandId),
      queryFn: () => fetchAbandonedCarts(brandId),
      enabled: Boolean(brandId),
    }),
  dispatchLogs: (brandId: string) =>
    queryOptions({
      queryKey: abandonedCartsKeys.dispatchLogs(brandId),
      queryFn: () => fetchDispatchLogs(brandId),
      enabled: Boolean(brandId),
    }),
};

export function invalidateAbandonedCartSettings(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: abandonedCartsKeys.settings(brandId) });
}

export function invalidateRecoverySequences(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: abandonedCartsKeys.sequences(brandId) });
}

/** Creates or updates the brand's recovery settings. */
export async function saveAbandonedCartSettings(
  brandId: string,
  settings: Partial<BrandAbandonedCartSettings>,
) {
  const row: TablesInsert<"brand_abandoned_cart_settings"> = {
    ...settings,
    brand_id: brandId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("brand_abandoned_cart_settings")
    .upsert(row, { onConflict: "brand_id" });
  if (error) throw error;
}

/** Gives the brand the default recovery steps (existing step numbers are overwritten). */
export async function createDefaultRecoverySequences(brandId: string) {
  const rows: TablesInsert<"abandoned_cart_sequences">[] = DEFAULT_ABANDONED_SEQUENCES.map(
    (step) => ({ ...step, brand_id: brandId }),
  );
  const { error } = await supabase
    .from("abandoned_cart_sequences")
    .upsert(rows, { onConflict: "brand_id,step_number" });
  if (error) throw error;
}

/** Saves one recovery step of the brand (matched by its step number). */
export async function saveRecoverySequence(brandId: string, step: AbandonedCartSequence) {
  const row: TablesInsert<"abandoned_cart_sequences"> = {
    ...step,
    brand_id: brandId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("abandoned_cart_sequences")
    .upsert(row, { onConflict: "brand_id,step_number" });
  if (error) throw error;
}
