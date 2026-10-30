import { queryOptions } from "@tanstack/react-query";
import { publicSupabase, supabase } from "@/integrations/supabase/client";
import type { FunnelCounts } from "@/lib/funnel";

/** A step of a visit, from the storefront (a visitor's call; it never fails the page). */
export async function recordFunnelStep(slug: string, session: string, step: number): Promise<void> {
  const { error } = await publicSupabase.rpc("record_storefront_step", {
    p_slug: slug,
    p_session: session,
    p_step: step,
  });
  if (error) throw error;
}

/** The store's funnel for a period, read by its staff. */
export async function fetchStorefrontFunnel(
  brandId: string,
  from: string,
  to: string,
): Promise<FunnelCounts> {
  const { data, error } = await supabase.rpc("storefront_funnel", {
    p_brand_id: brandId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  return {
    visits: Number(row?.visits ?? 0),
    product_views: Number(row?.product_views ?? 0),
    carts: Number(row?.carts ?? 0),
    checkouts: Number(row?.checkouts ?? 0),
    orders: Number(row?.orders ?? 0),
  };
}

export const storefrontFunnelKeys = {
  period: (brandId: string, from: string, to: string) =>
    ["storefront-funnel", brandId, from, to] as const,
};

export const storefrontFunnelQueries = {
  period: (brandId: string, from: string, to: string) =>
    queryOptions({
      queryKey: storefrontFunnelKeys.period(brandId, from, to),
      queryFn: () => fetchStorefrontFunnel(brandId, from, to),
      enabled: Boolean(brandId),
      staleTime: 5 * 60_000,
    }),
};
