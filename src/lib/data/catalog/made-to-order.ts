import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { catalogKeys } from "./keys";

/**
 * The record of a product's made-to-order limit: every time staff set it, paused or resumed it,
 * and every order that took a piece or gave one back (`made_to_order_movements`, written only by
 * the database). The key sits under the product list's prefix, so a catalog write refreshes it.
 */

export const madeToOrderKeys = {
  history: (brandId: string, productId: string) =>
    [...catalogKeys.products(brandId), "made-to-order-history", productId] as const,
};

const HISTORY_COLUMNS =
  "id, reason, available_before, available_after, created_at, orders(invoice_number)" as const;

/** The product's latest limit changes, newest first. */
export async function fetchMadeToOrderHistory(brandId: string, productId: string, limit = 8) {
  const { data, error } = await supabase
    .from("made_to_order_movements")
    .select(HISTORY_COLUMNS)
    .eq("brand_id", brandId)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export type MadeToOrderMovementRow = Awaited<ReturnType<typeof fetchMadeToOrderHistory>>[number];

export const madeToOrderQueries = {
  history: (brandId: string, productId: string | null) =>
    queryOptions({
      queryKey: madeToOrderKeys.history(brandId, productId ?? ""),
      queryFn: () => fetchMadeToOrderHistory(brandId, productId as string),
      enabled: Boolean(brandId && productId),
      staleTime: 30_000,
    }),
};
