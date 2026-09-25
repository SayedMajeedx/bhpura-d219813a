import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCatalogInquiriesReporting } from "@/lib/reporting.functions";

/**
 * The dashboard's reporting reads: the accounting overview (same engine as
 * Reports, so KPIs cannot drift), incubator sales and catalog inquiries. The
 * key values are the ones existing invalidations already use (the packaging
 * tab and the dashboard's realtime refresh). The Reports pages keep their own
 * keys until the reporting domain moves.
 */

export const reportingKeys = {
  /** Every overview of the store, any period (prefix of `overview`). */
  overviews: (slug: string) => ["dashboard-reporting-overview", slug] as const,
  overview: (slug: string, from: string, to: string, timezone: string) =>
    [...reportingKeys.overviews(slug), from, to, timezone] as const,
  /** Every comparison-period overview of the store (prefix of `previousOverview`). */
  previousOverviews: (slug: string) => ["dashboard-reporting-overview-previous", slug] as const,
  previousOverview: (slug: string, from: string, to: string, timezone: string) =>
    [...reportingKeys.previousOverviews(slug), from, to, timezone] as const,
  incubatorSales: (brandId: string) => ["dashboard-incubator-sales", brandId] as const,
  catalogInquiries: (brandId: string) => ["dashboard-catalog-inquiries", brandId] as const,
};

/**
 * Daily incubator sales of the last `days` days in the viewer's time zone,
 * with the field names the dashboard charts use.
 */
export async function fetchIncubatorSales(
  slug: string,
  days: number,
  now = new Date(),
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  const { data, error } = await supabase.rpc("rpc_reporting_incubator_sales", {
    p_start_date: start.toISOString(),
    p_end_date: now.toISOString(),
    p_tz: timezone,
    p_interval: "day",
    p_brand_slug: slug,
  });
  if (error) throw error;
  const timeseries = (data as { timeseries?: IncubatorSalesBucket[] } | null)?.timeseries ?? [];
  return timeseries.map((row) => ({
    ...row,
    sold_at: row.time_bucket,
    gross_amount: row.gross_amount,
    quantity: row.sale_count,
  }));
}

/** One bucket of `rpc_reporting_incubator_sales`'s time series. */
export type IncubatorSalesBucket = {
  time_bucket: string;
  gross_amount: number;
  sale_count: number;
  [key: string]: unknown;
};

export const reportingQueries = {
  incubatorSales: (brandId: string, slug: string) =>
    queryOptions({
      queryKey: reportingKeys.incubatorSales(brandId),
      queryFn: () => fetchIncubatorSales(slug, 60),
      enabled: Boolean(brandId && slug),
      staleTime: 60_000,
    }),
  catalogInquiries: (brandId: string) =>
    queryOptions({
      queryKey: reportingKeys.catalogInquiries(brandId),
      queryFn: () => fetchCatalogInquiriesReporting(brandId),
      enabled: Boolean(brandId),
      staleTime: 60_000,
    }),
};
