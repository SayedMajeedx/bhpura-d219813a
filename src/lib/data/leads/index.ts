import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { catalogInsightKeys } from "@/lib/data/catalog";
import { readAll } from "../read-all";

/**
 * What shoppers left for the store on its storefront: a request to be told when a product is
 * back in stock, and a newsletter sign-up. Both are written by the storefront's own server
 * functions (`src/lib/storefront-leads.functions.ts`); the brand's staff read and manage them
 * here. Until this module they were written and never read: the admin showed a count of the
 * first and nothing of the second.
 */

export const leadsKeys = {
  all: (brandId: string) => ["leads", brandId] as const,
  backInStock: (brandId: string) => [...leadsKeys.all(brandId), "back-in-stock"] as const,
  newsletter: (brandId: string) => [...leadsKeys.all(brandId), "newsletter"] as const,
};

/** Every back-in-stock request of the brand, newest first: waiting and already told. */
export async function fetchBackInStockRequests(brandId: string) {
  return readAll((from, to) =>
    supabase
      .from("back_in_stock_requests")
      .select("id, product_id, variant_id, channel, contact, lang, notified_at, created_at", {
        count: "exact",
      })
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
}
export type BackInStockRequest = Awaited<ReturnType<typeof fetchBackInStockRequests>>[number];

/** Every newsletter sign-up of the brand, newest first. */
export async function fetchNewsletterSubscribers(brandId: string) {
  return readAll((from, to) =>
    supabase
      .from("newsletter_subscribers")
      .select("id, channel, contact, lang, source, created_at", { count: "exact" })
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
}
export type NewsletterSubscriber = Awaited<ReturnType<typeof fetchNewsletterSubscribers>>[number];

/**
 * Marks requests as told (or as waiting again, with `told: false`). Returns how many rows were
 * changed: a write that matched none (another store's row, a removed one) is an error.
 */
export async function setBackInStockTold(brandId: string, ids: readonly string[], told = true) {
  if (ids.length === 0) return 0;
  const { data, error } = await supabase
    .from("back_in_stock_requests")
    .update({ notified_at: told ? new Date().toISOString() : null })
    .eq("brand_id", brandId)
    .in("id", [...ids])
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("REQUESTS_NOT_FOUND");
  return data.length;
}

export async function deleteBackInStockRequests(brandId: string, ids: readonly string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("back_in_stock_requests")
    .delete()
    .eq("brand_id", brandId)
    .in("id", [...ids]);
  if (error) throw error;
}

/** Removes a sign-up (the person asked to be taken off the list). */
export async function deleteNewsletterSubscriber(brandId: string, id: string) {
  const { error } = await supabase
    .from("newsletter_subscribers")
    .delete()
    .eq("brand_id", brandId)
    .eq("id", id);
  if (error) throw error;
}

/** After a change: the lists, and the inventory header's count of people waiting. */
export function invalidateLeads(qc: QueryClient, brandId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: leadsKeys.all(brandId) }),
    qc.invalidateQueries({ queryKey: catalogInsightKeys.backInStockCount(brandId) }),
  ]);
}

export const leadsQueries = {
  backInStock: (brandId: string) =>
    queryOptions({
      queryKey: leadsKeys.backInStock(brandId),
      queryFn: () => fetchBackInStockRequests(brandId),
      enabled: Boolean(brandId),
      staleTime: 30_000,
    }),
  newsletter: (brandId: string) =>
    queryOptions({
      queryKey: leadsKeys.newsletter(brandId),
      queryFn: () => fetchNewsletterSubscribers(brandId),
      enabled: Boolean(brandId),
      staleTime: 30_000,
    }),
};
