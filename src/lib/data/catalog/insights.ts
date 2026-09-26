import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { catalogKeys } from "./keys";

/**
 * Smaller catalog reads around the product list: the inventory screen's
 * back-in-stock count and stock-movement history, the readiness checklist's
 * active-product count, the command palette's product search and the content
 * studio's product picker. Keys sit under the product list's prefix, so a
 * catalog write refreshes them.
 */

export const catalogInsightKeys = {
  backInStockCount: (brandId: string) =>
    [...catalogKeys.products(brandId), "back-in-stock-count"] as const,
  activeCount: (brandId: string) => [...catalogKeys.products(brandId), "active-count"] as const,
  contentStudio: (brandId: string) => [...catalogKeys.products(brandId), "content-studio"] as const,
};

/** Shoppers waiting to hear a variant is back. A failed read counts none. */
export async function countPendingBackInStock(brandId: string) {
  const { count, error } = await supabase
    .from("back_in_stock_requests")
    .select("*", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .is("notified_at", null);
  if (error) return 0;
  return count ?? 0;
}

/** The brand's active products. A failed read counts none. */
export async function countActiveProducts(brandId: string) {
  const { count, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .eq("is_active", true);
  if (error) return 0;
  return count ?? 0;
}

/** Up to six products whose English or Arabic name contains the text. A failed read finds none. */
export async function searchProducts(brandId: string, text: string) {
  const term = `%${text}%`;
  const { data } = await supabase
    .from("products")
    .select("id, name_en, name_ar, base_price, image_url, product_variants(selling_price)")
    .eq("brand_id", brandId)
    .or(`name_en.ilike.${term},name_ar.ilike.${term}`)
    .limit(6);
  return data ?? [];
}

/** The brand's active products for the content studio, most recently edited first. */
export async function fetchContentStudioProducts(brandId: string) {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id,name,name_ar,name_en,description,description_ar,image_url,media,base_price,fabric_type,occasion",
    )
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** One page of the brand's stock movements, newest first, with the total for paging. */
export async function fetchInventoryMovements(args: {
  brandId: string;
  variantId?: string | null;
  reason?: string;
  location?: string;
  page: number;
  pageSize: number;
}) {
  let query = supabase
    .from("inventory_movements")
    .select("*", { count: "exact" })
    .eq("brand_id", args.brandId)
    .order("created_at", { ascending: false });
  if (args.variantId) query = query.eq("variant_id", args.variantId);
  if (args.reason && args.reason !== "all") query = query.eq("reason", args.reason);
  if (args.location && args.location !== "all") query = query.eq("location", args.location);
  const from = args.page * args.pageSize;
  const { data, count, error } = await query.range(from, from + args.pageSize - 1);
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
}

/** One stock movement; `actor_id` is who made it (null for system runs such as reconciliation). */
export type InventoryMovementRow = Awaited<
  ReturnType<typeof fetchInventoryMovements>
>["rows"][number];

export const catalogInsightQueries = {
  backInStockCount: (brandId: string) =>
    queryOptions({
      queryKey: catalogInsightKeys.backInStockCount(brandId),
      queryFn: () => countPendingBackInStock(brandId),
      enabled: Boolean(brandId),
      staleTime: 60_000,
    }),
  activeCount: (brandId: string) =>
    queryOptions({
      queryKey: catalogInsightKeys.activeCount(brandId),
      queryFn: () => countActiveProducts(brandId),
      enabled: Boolean(brandId),
    }),
  contentStudio: (brandId: string) =>
    queryOptions({
      queryKey: catalogInsightKeys.contentStudio(brandId),
      queryFn: () => fetchContentStudioProducts(brandId),
      enabled: Boolean(brandId),
    }),
};
