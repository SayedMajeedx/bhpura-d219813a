import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { AbandonedCart, BrandAbandonedCartSettings } from "@/lib/abandoned-carts.types";

/**
 * The admin abandoned-carts screen: the brand's recovery settings and its carts, and the
 * settings write. The storefront side (cart activity, restore, coupons) goes through the
 * functions in `@/lib/abandoned-carts.functions`.
 *
 * Nothing here sends a message: a person opens WhatsApp from a cart. The tables of an
 * automatic sender (`abandoned_cart_sequences`, `abandoned_cart_dispatch_logs`) were never
 * written by anything and are not read.
 */

export const abandonedCartsKeys = {
  all: (brandId: string) => ["abandoned-carts", brandId] as const,
  settings: (brandId: string) => [...abandonedCartsKeys.all(brandId), "settings"] as const,
  carts: (brandId: string) => [...abandonedCartsKeys.all(brandId), "carts"] as const,
};

/** A cart with the name and contact of its customer, and the order it became, when it has them. */
export type AbandonedCartWithCustomer = AbandonedCart & {
  customers?: { name: string; email: string; phone: string } | null;
  orders?: { total: number; status: string | null; currency: string | null } | null;
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

/** The brand's latest 200 carts that still hold items, most recently active first. */
export async function fetchAbandonedCarts(brandId: string) {
  const { data, error } = await supabase
    .from("abandoned_carts")
    .select("*, customers(name, email, phone), orders(total, status, currency)")
    .eq("brand_id", brandId)
    .order("last_activity_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as unknown as AbandonedCartWithCustomer[]).filter(
    (cart) => Array.isArray(cart.cart_items) && cart.cart_items.length > 0,
  );
}

export const abandonedCartsQueries = {
  settings: (brandId: string) =>
    queryOptions({
      queryKey: abandonedCartsKeys.settings(brandId),
      queryFn: () => fetchAbandonedCartSettings(brandId),
      enabled: Boolean(brandId),
    }),
  carts: (brandId: string) =>
    queryOptions({
      queryKey: abandonedCartsKeys.carts(brandId),
      queryFn: () => fetchAbandonedCarts(brandId),
      enabled: Boolean(brandId),
    }),
};

export function invalidateAbandonedCartSettings(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: abandonedCartsKeys.settings(brandId) });
}

export function invalidateAbandonedCarts(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: abandonedCartsKeys.carts(brandId) });
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
