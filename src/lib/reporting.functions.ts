import { supabase } from "@/integrations/supabase/client";
import { readAll } from "@/lib/data/read-all";
import { composeOverviewRows, type ComposedOverviewRow } from "@/lib/reporting-compose";

export type DateRange = {
  from: Date;
  to: Date;
};

export type ReportInterval = "day" | "week" | "month" | "year";

async function fetchIncubatorReporting(
  range: DateRange,
  tz: string,
  brandSlug?: string,
  interval: ReportInterval = "day",
) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_incubator_sales", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
    p_interval: interval,
    p_brand_slug: brandSlug || null,
  });
  if (error) {
    if (error.code === "PGRST202") return { summary: [], timeseries: [], products: [] };
    throw error;
  }
  return data || { summary: [], timeseries: [], products: [] };
}

// Overview metrics
export async function fetchReportingOverview(
  range: DateRange,
  tz: string,
  includeHistorical: boolean = false,
  brandSlug?: string,
) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_overview", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
    p_include_historical: includeHistorical,
    p_brand_slug: brandSlug || null,
  });
  if (error) {
    // Some early reporting deployments shipped the sales RPC before the overview
    // RPC. Keep the dashboard useful in that state without hiding real permission,
    // tenancy, or database errors.
    if (
      error.code === "PGRST202" ||
      /rpc_reporting_overview.*(not find|does not exist)/i.test(error.message || "")
    ) {
      const sales = (await fetchReportingSales(
        range,
        "day",
        tz,
        includeHistorical,
        brandSlug,
      )) as any;
      const series = Array.isArray(sales?.timeseries) ? sales.timeseries : [];
      const currency = series.find((row: any) => row.currency)?.currency || "BHD";
      return [
        {
          currency,
          paid_order_value: series.reduce((sum: number, row: any) => sum + Number(row.pov || 0), 0),
          net_merch_sales: series.reduce(
            (sum: number, row: any) => sum + Number(row.net_merch || 0),
            0,
          ),
          paid_order_count: series.reduce(
            (sum: number, row: any) => sum + Number(row.paid_order_count || row.order_count || 0),
            0,
          ),
          discounts: series.reduce((sum: number, row: any) => sum + Number(row.discounts || 0), 0),
          shipping_collected: series.reduce(
            (sum: number, row: any) => sum + Number(row.shipping_collected || 0),
            0,
          ),
          vat_collected: series.reduce(
            (sum: number, row: any) => sum + Number(row.vat_collected || 0),
            0,
          ),
          expenses: 0,
          partial_amount: 0,
          refunded_total: 0,
          free_completed_order_count: 0,
          known_cogs: 0,
          incubator_cogs: 0,
          missing_cost_item_count: 0,
          missing_cost_exposure: 0,
          overview_fallback: true,
        },
      ];
    }
    throw error;
  }
  const [incubator, refundsResponse, cogsResponse] = await Promise.all([
    fetchIncubatorReporting(range, tz, brandSlug),
    (supabase as any).rpc("rpc_reporting_processed_returns", {
      p_start_date: range.from.toISOString(),
      p_end_date: range.to.toISOString(),
      p_tz: tz,
      p_brand_slug: brandSlug || null,
    }),
    (supabase as any).rpc("rpc_reporting_order_cogs", {
      p_start_date: range.from.toISOString(),
      p_end_date: range.to.toISOString(),
      p_include_historical: includeHistorical,
      p_brand_slug: brandSlug || null,
    }),
  ]);
  if (refundsResponse.error && refundsResponse.error.code !== "PGRST202") {
    throw refundsResponse.error;
  }
  const refundRows = Array.isArray(refundsResponse.data) ? refundsResponse.data : [];
  if (cogsResponse.error && cogsResponse.error.code !== "PGRST202") {
    throw cogsResponse.error;
  }
  let feeRows: unknown = [];
  try {
    const { data: res, error: feeError } = await (supabase as any).rpc(
      "rpc_reporting_processing_fees",
      {
        p_start_date: range.from.toISOString(),
        p_end_date: range.to.toISOString(),
        p_include_historical: includeHistorical,
        p_brand_slug: brandSlug || null,
      },
    );
    if (!feeError && Array.isArray(res)) {
      feeRows = res;
    }
  } catch (e) {
    console.warn("rpc_reporting_processing_fees soft error:", e);
  }
  return composeOverviewRows({
    overview: data,
    returns: refundRows,
    cogs: cogsResponse.data,
    fees: feeRows,
    incubatorSummary: incubator.summary,
  });
}

/**
 * The overview's figures for several periods in one request (`rpc_reporting_periods`, at most
 * 36), each put together by the overview's own rule: the monthly statement.
 */
export async function fetchReportingPeriods(
  ranges: DateRange[],
  tz: string,
  includeHistorical: boolean = false,
  brandSlug?: string,
): Promise<ComposedOverviewRow[][]> {
  const { data, error } = await supabase.rpc("rpc_reporting_periods", {
    p_periods: ranges.map((r) => ({ from: r.from.toISOString(), to: r.to.toISOString() })),
    p_tz: tz,
    p_include_historical: includeHistorical,
    p_brand_slug: brandSlug || undefined,
  });
  if (error) throw error;
  const periods = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
  return periods.map((period) =>
    composeOverviewRows({
      overview: period.overview,
      returns: period.returns,
      cogs: period.cogs,
      fees: period.fees,
      incubatorSummary: period.incubator_summary,
    }),
  );
}

/**
 * Margin by product for a period (`rpc_reporting_margins`): units, gross sales, discounts,
 * returns and cost of goods per product and currency, adding up to the statement's figures.
 */
export async function fetchReportingMargins(
  range: DateRange,
  includeHistorical: boolean = false,
  brandSlug?: string,
): Promise<unknown> {
  const { data, error } = await supabase.rpc("rpc_reporting_margins", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_include_historical: includeHistorical,
    p_brand_slug: brandSlug || undefined,
  });
  if (error) throw error;
  return data ?? [];
}

// Sales metrics
export async function fetchReportingSales(
  range: DateRange,
  interval: ReportInterval,
  tz: string,
  includeHistorical: boolean = false,
  brandSlug?: string,
) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_sales", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_interval: interval,
    p_tz: tz,
    p_include_historical: includeHistorical,
    p_brand_slug: brandSlug || null,
  });
  if (error) throw error;
  const incubator = await fetchIncubatorReporting(range, tz, brandSlug, interval);
  const result = data || { timeseries: [], payment: [], fulfillment: [] };
  const series = [...(result.timeseries || [])];
  for (const row of incubator.timeseries || []) {
    const existing = series.find(
      (item: any) =>
        item.currency === row.currency &&
        new Date(item.time_bucket).getTime() === new Date(row.time_bucket).getTime(),
    );
    if (existing) {
      existing.pov = Number(existing.pov || 0) + Number(row.gross_amount || 0);
      existing.net_merch = Number(existing.net_merch || 0) + Number(row.gross_amount || 0);
      existing.paid_order_count =
        Number(existing.paid_order_count || 0) + Number(row.sale_count || 0);
      existing.collected = Number(existing.collected || 0) + Number(row.paid_amount || 0);
    } else {
      series.push({
        time_bucket: row.time_bucket,
        currency: row.currency,
        pov: row.gross_amount,
        net_merch: row.gross_amount,
        paid_order_count: row.sale_count,
        collected: row.paid_amount,
      });
    }
  }
  const summary = incubator.summary || [];
  return {
    ...result,
    timeseries: series,
    payment: [
      ...(result.payment || []),
      ...summary.map((row: any) => ({
        payment_method: "incubator_receivable",
        currency: row.currency,
        order_count: row.sale_count,
        pov: row.gross_amount,
      })),
    ],
    fulfillment: [
      ...(result.fulfillment || []),
      ...summary.map((row: any) => ({
        fulfillment_method: "incubator",
        currency: row.currency,
        order_count: row.sale_count,
        pov: row.gross_amount,
      })),
    ],
  };
}

// Products & Inventory metrics
export async function fetchReportingProducts(
  range: DateRange,
  tz: string,
  includeHistorical: boolean = false,
  limit: number = 50,
  offset: number = 0,
  sortBy: string = "units_sold_desc",
  brandSlug?: string,
) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_products_inventory", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
    p_include_historical: includeHistorical,
    p_limit: limit,
    p_offset: offset,
    p_sort_by: sortBy,
    p_brand_slug: brandSlug || null,
  });
  if (error) throw error;
  const incubator = await fetchIncubatorReporting(range, tz, brandSlug);
  const rows = [...(data || [])];
  for (const sale of incubator.products || []) {
    const existing = rows.find(
      (row: any) => row.variant_id === sale.variant_id && row.currency === sale.currency,
    );
    if (existing) {
      existing.units_sold = Number(existing.units_sold || 0) + Number(sale.units_sold || 0);
      existing.net_merch_sales =
        Number(existing.net_merch_sales || 0) + Number(sale.net_merch_sales || 0);
      existing.known_cogs = Number(existing.known_cogs || 0) + Number(sale.known_cogs || 0);
    } else {
      // A size sold only through partners: its stock is read by the screen's availability rule.
      rows.push({ ...sale, is_missing_cost: false });
    }
  }
  return rows.sort((a: any, b: any) =>
    sortBy === "net_merch_desc"
      ? Number(b.net_merch_sales || 0) - Number(a.net_merch_sales || 0)
      : Number(b.units_sold || 0) - Number(a.units_sold || 0),
  );
}

// Customers metrics
export async function fetchReportingCustomers(
  range: DateRange,
  tz: string,
  includeHistorical: boolean = false,
  limit: number = 50,
  offset: number = 0,
  brandSlug?: string,
) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_customers", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
    p_include_historical: includeHistorical,
    p_limit: limit,
    p_offset: offset,
    p_brand_slug: brandSlug || null,
  });
  if (error) throw error;
  return data;
}

// Expenses metrics
export async function fetchReportingExpenses(range: DateRange, tz: string, brandSlug?: string) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_expenses", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
    p_brand_slug: brandSlug || null,
  });
  if (error) throw error;
  return data;
}

// Export function
export async function exportReportData(
  reportType: "sales" | "products" | "customers",
  range: DateRange,
  tz: string,
  brandSlug?: string,
) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_export", {
    p_report_type: reportType,
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
    p_brand_slug: brandSlug || null,
  });
  if (error) throw error;
  return data;
}

// Catalog Inquiries Reporting
export type CatalogInquirySummary = {
  totalInquiries: number;
  totalViews: number;
  totalClicks: number;
  inquiryRate: number;
  productInquiries: Array<{
    productId: string;
    productName: string;
    inquiries: number;
    views: number;
    clicks: number;
  }>;
};

export async function fetchCatalogInquiriesReporting(
  brandId: string,
  startDate?: string,
  endDate?: string,
): Promise<CatalogInquirySummary> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const start = startDate || thirtyDaysAgo.toISOString().slice(0, 10);

  // One row per product per day: thirty days of forty products is already past the API's limit.
  const data = await readAll<unknown>((from, to) => {
    let query = (supabase as any)
      .from("product_engagement_daily")
      .select("product_id, inquiry_count, view_count, click_count, event_date, products(name)", {
        count: "exact",
      })
      .eq("brand_id", brandId)
      .gte("event_date", start);
    if (endDate) query = query.lte("event_date", endDate);
    return query.order("event_date").order("product_id").range(from, to);
  });

  const rows = data as Array<{
    product_id: string;
    inquiry_count: number | null;
    view_count: number | null;
    click_count: number | null;
    products?: { name: string } | null;
  }>;

  let totalInquiries = 0;
  let totalViews = 0;
  let totalClicks = 0;
  const productMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      inquiries: number;
      views: number;
      clicks: number;
    }
  >();

  for (const row of rows) {
    const inq = Number(row.inquiry_count || 0);
    // An inquiry implies a product view; ensure views are never less than inquiries
    const views = Math.max(Number(row.view_count || 0), inq);
    const clicks = Number(row.click_count || 0);

    totalInquiries += inq;
    totalViews += views;
    totalClicks += clicks;

    const existing = productMap.get(row.product_id) || {
      productId: row.product_id,
      productName: row.products?.name || "",
      inquiries: 0,
      views: 0,
      clicks: 0,
    };
    existing.inquiries += inq;
    existing.views += views;
    existing.clicks += clicks;
    if (!existing.productName && row.products?.name) {
      existing.productName = row.products.name;
    }
    productMap.set(row.product_id, existing);
  }

  const productInquiries = Array.from(productMap.values()).sort(
    (a, b) => b.inquiries - a.inquiries || b.views - a.views,
  );

  const effectiveViews = Math.max(totalViews, totalInquiries);
  const inquiryRate =
    effectiveViews > 0 ? Math.min(100, (totalInquiries / effectiveViews) * 100) : 0;

  return {
    totalInquiries,
    totalViews,
    totalClicks,
    inquiryRate,
    productInquiries,
  };
}
