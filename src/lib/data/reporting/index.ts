import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCatalogInquiriesReporting,
  fetchReportingCustomers,
  fetchReportingOverview,
  fetchReportingProducts,
  fetchReportingSales,
  type ReportInterval,
} from "@/lib/reporting.functions";

/**
 * Reporting reads: the accounting overview, sales, products and customers
 * reports (the Reports pages, and the dashboard's KPIs, which use the same
 * overview so they cannot drift), incubator sales and catalog inquiries.
 *
 * Every report of a store sits under `["reports", slug]` with every argument
 * that changes the result in the key. A "previous period" is just another
 * date range of the same overview, so the dashboard and the Reports page share
 * cache entries when they ask for the same period. Before, the same overview
 * was cached under four hand-built keys and nothing refreshed the Reports
 * pages' keys.
 */

type DateRange = { from: Date; to: Date };
const iso = (range: DateRange) => [range.from.toISOString(), range.to.toISOString()] as const;

export const reportingKeys = {
  all: (slug: string) => ["reports", slug] as const,
  /** Every overview of the store, any period (prefix; invalidate after a sale or cost change). */
  overviews: (slug: string) => [...reportingKeys.all(slug), "overview"] as const,
  overview: (slug: string, range: DateRange, timezone: string, includeHistorical: boolean) =>
    [...reportingKeys.overviews(slug), ...iso(range), timezone, includeHistorical] as const,
  sales: (
    slug: string,
    range: DateRange,
    interval: string,
    timezone: string,
    includeHistorical: boolean,
  ) =>
    [
      ...reportingKeys.all(slug),
      "sales",
      ...iso(range),
      interval,
      timezone,
      includeHistorical,
    ] as const,
  products: (
    slug: string,
    range: DateRange,
    timezone: string,
    includeHistorical: boolean,
    sortBy: string,
  ) =>
    [
      ...reportingKeys.all(slug),
      "products",
      ...iso(range),
      timezone,
      includeHistorical,
      sortBy,
    ] as const,
  customers: (slug: string, range: DateRange, timezone: string, includeHistorical: boolean) =>
    [...reportingKeys.all(slug), "customers", ...iso(range), timezone, includeHistorical] as const,
  incubatorSales: (slug: string) => [...reportingKeys.all(slug), "incubator-sales"] as const,
  /** Catalog inquiries by brand, optionally within a date range (ISO strings). */
  catalogInquiries: (brandId: string, from?: string, to?: string) =>
    ["catalog-inquiries", brandId, from ?? null, to ?? null] as const,
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
  /** Waits for a range; screens add their own `retry`, `staleTime` and `enabled`. */
  overview: (
    slug: string,
    range: DateRange | undefined,
    timezone: string,
    includeHistorical: boolean,
  ) =>
    queryOptions({
      queryKey: range
        ? reportingKeys.overview(slug, range, timezone, includeHistorical)
        : [...reportingKeys.overviews(slug), "pending"],
      queryFn: () => fetchReportingOverview(range!, timezone, includeHistorical, slug),
      enabled: Boolean(slug && range),
    }),
  sales: (
    slug: string,
    range: DateRange | undefined,
    interval: ReportInterval,
    timezone: string,
    includeHistorical: boolean,
  ) =>
    queryOptions({
      queryKey: range
        ? reportingKeys.sales(slug, range, interval, timezone, includeHistorical)
        : [...reportingKeys.all(slug), "sales", "pending"],
      queryFn: () => fetchReportingSales(range!, interval, timezone, includeHistorical, slug),
      enabled: Boolean(slug && range),
    }),
  /** The top 200 products of the range. */
  products: (
    slug: string,
    range: DateRange | undefined,
    timezone: string,
    includeHistorical: boolean,
    sortBy: string,
  ) =>
    queryOptions({
      queryKey: range
        ? reportingKeys.products(slug, range, timezone, includeHistorical, sortBy)
        : [...reportingKeys.all(slug), "products", "pending"],
      queryFn: () =>
        range
          ? fetchReportingProducts(range, timezone, includeHistorical, 200, 0, sortBy, slug)
          : null,
      enabled: Boolean(slug && range),
    }),
  /** The top 200 customers of the range. */
  customers: (
    slug: string,
    range: DateRange | undefined,
    timezone: string,
    includeHistorical: boolean,
  ) =>
    queryOptions({
      queryKey: range
        ? reportingKeys.customers(slug, range, timezone, includeHistorical)
        : [...reportingKeys.all(slug), "customers", "pending"],
      queryFn: () =>
        range ? fetchReportingCustomers(range, timezone, includeHistorical, 200, 0, slug) : null,
      enabled: Boolean(slug && range),
    }),
  incubatorSales: (brandId: string, slug: string) =>
    queryOptions({
      queryKey: reportingKeys.incubatorSales(slug),
      queryFn: () => fetchIncubatorSales(slug, 60),
      enabled: Boolean(brandId && slug),
      staleTime: 60_000,
    }),
  /** Inquiries of the last 30 days, or of the range when one is given. */
  catalogInquiries: (brandId: string, from?: string, to?: string) =>
    queryOptions({
      queryKey: reportingKeys.catalogInquiries(brandId, from, to),
      queryFn: () => fetchCatalogInquiriesReporting(brandId, from, to),
      enabled: Boolean(brandId),
    }),
};
