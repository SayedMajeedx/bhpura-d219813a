import { queryOptions } from "@tanstack/react-query";
import { publicSupabase, supabase } from "@/integrations/supabase/client";
import type { CampaignCounts, FunnelCounts, SourceCounts, VisitSource } from "@/lib/funnel";

/** A step of a visit, from the storefront (a visitor's call; it never fails the page). */
export async function recordFunnelStep(
  slug: string,
  session: string,
  step: number,
  source: string,
  campaign: string | null = null,
): Promise<void> {
  const { error } = await publicSupabase.rpc("record_storefront_step", {
    p_slug: slug,
    p_session: session,
    p_step: step,
    p_source: source,
    p_campaign: campaign,
  });
  if (error) throw error;
}

/** How far into checkout a visit went, and what stands in its way (a visitor's call). */
export async function recordCheckoutStep(
  slug: string,
  session: string,
  part: number,
  problem: string | null,
): Promise<void> {
  const { error } = await publicSupabase.rpc("record_checkout_step", {
    p_slug: slug,
    p_session: session,
    p_step: part,
    p_problem: problem,
  });
  if (error) throw error;
}

export type CheckoutProgressCounts = {
  opened: number;
  contact: number;
  delivery: number;
  ready: number;
  pressed: number;
  ordered: number;
};
export type CheckoutProblemCounts = { problem: string; visits: number };

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

/** Each source's visits and the orders placed in them. */
export async function fetchStorefrontFunnelSources(
  brandId: string,
  from: string,
  to: string,
): Promise<SourceCounts[]> {
  const { data, error } = await supabase.rpc("storefront_funnel_sources", {
    p_brand_id: brandId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    source: row.source as VisitSource,
    visits: Number(row.visits),
    orders: Number(row.orders),
  }));
}

export async function fetchCheckoutProgress(
  brandId: string,
  from: string,
  to: string,
): Promise<CheckoutProgressCounts> {
  const { data, error } = await supabase.rpc("storefront_checkout_progress", {
    p_brand_id: brandId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  return {
    opened: Number(row?.opened ?? 0),
    contact: Number(row?.contact ?? 0),
    delivery: Number(row?.delivery ?? 0),
    ready: Number(row?.ready ?? 0),
    pressed: Number(row?.pressed ?? 0),
    ordered: Number(row?.ordered ?? 0),
  };
}

export async function fetchCheckoutProblems(
  brandId: string,
  from: string,
  to: string,
): Promise<CheckoutProblemCounts[]> {
  const { data, error } = await supabase.rpc("storefront_checkout_problems", {
    p_brand_id: brandId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({ problem: row.problem, visits: Number(row.visits) }));
}

export async function fetchFunnelCampaigns(
  brandId: string,
  from: string,
  to: string,
): Promise<CampaignCounts[]> {
  const { data, error } = await supabase.rpc("storefront_funnel_campaigns", {
    p_brand_id: brandId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    campaign: row.campaign,
    visits: Number(row.visits),
    orders: Number(row.orders),
  }));
}

export const storefrontFunnelKeys = {
  period: (brandId: string, from: string, to: string) =>
    ["storefront-funnel", brandId, from, to] as const,
  sources: (brandId: string, from: string, to: string) =>
    ["storefront-funnel", "sources", brandId, from, to] as const,
  checkout: (brandId: string, from: string, to: string) =>
    ["storefront-funnel", "checkout", brandId, from, to] as const,
  campaigns: (brandId: string, from: string, to: string) =>
    ["storefront-funnel", "campaigns", brandId, from, to] as const,
};

export const storefrontFunnelQueries = {
  period: (brandId: string, from: string, to: string) =>
    queryOptions({
      queryKey: storefrontFunnelKeys.period(brandId, from, to),
      queryFn: () => fetchStorefrontFunnel(brandId, from, to),
      enabled: Boolean(brandId),
      staleTime: 5 * 60_000,
    }),
  sources: (brandId: string, from: string, to: string) =>
    queryOptions({
      queryKey: storefrontFunnelKeys.sources(brandId, from, to),
      queryFn: () => fetchStorefrontFunnelSources(brandId, from, to),
      enabled: Boolean(brandId),
      staleTime: 5 * 60_000,
    }),
  checkout: (brandId: string, from: string, to: string) =>
    queryOptions({
      queryKey: storefrontFunnelKeys.checkout(brandId, from, to),
      queryFn: async () => {
        const [progress, problems] = await Promise.all([
          fetchCheckoutProgress(brandId, from, to),
          fetchCheckoutProblems(brandId, from, to),
        ]);
        return { progress, problems };
      },
      enabled: Boolean(brandId),
      staleTime: 5 * 60_000,
    }),
  campaigns: (brandId: string, from: string, to: string) =>
    queryOptions({
      queryKey: storefrontFunnelKeys.campaigns(brandId, from, to),
      queryFn: () => fetchFunnelCampaigns(brandId, from, to),
      enabled: Boolean(brandId),
      staleTime: 5 * 60_000,
    }),
};
