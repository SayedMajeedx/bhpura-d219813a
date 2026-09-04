import { supabase } from "@/integrations/supabase/client";

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
  const cogsRows = Array.isArray(cogsResponse.data) ? cogsResponse.data : [];
  const incubatorByCurrency = new Map(
    (incubator.summary || []).map((row: any) => [row.currency, row]),
  );
  const baseRows = Array.isArray(data) ? data : [];
  for (const row of incubator.summary || []) {
    if (!baseRows.some((base: any) => base.currency === row.currency)) {
      baseRows.push({ currency: row.currency });
    }
  }
  for (const row of refundRows) {
    if (!baseRows.some((base: any) => base.currency === row.currency)) {
      baseRows.push({ currency: row.currency });
    }
  }
  for (const row of cogsRows) {
    if (!baseRows.some((base: any) => base.currency === row.currency)) {
      baseRows.push({ currency: row.currency });
    }
  }
  let feeRows: any[] = [];
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
  const feesByCurrency = new Map(
    (Array.isArray(feeRows) ? feeRows : []).map((row: any) => [
      row.currency,
      Number(row.processing_fees || 0),
    ]),
  );
  const refundsByCurrency = new Map(refundRows.map((row: any) => [row.currency, row]));
  const cogsByCurrency = new Map(cogsRows.map((row: any) => [row.currency, row]));
  return baseRows.map((row: any) => {
    const consignment: any = incubatorByCurrency.get(row.currency) || {};
    const processingFees = feesByCurrency.get(row.currency) ?? 0;
    const manualExpenses = Number(row.expenses || 0);
    const incubatorCommissions = Number(consignment.commission_amount || 0);
    const refunds: any = refundsByCurrency.get(row.currency) || {};
    const orderCogs: any = cogsByCurrency.get(row.currency) || {};
    const paidOrderValue = Number(row.paid_order_value || 0) + Number(consignment.gross_amount || 0);
    const netMerchandise = Number(row.net_merch_sales || 0) + Number(consignment.gross_amount || 0);
    return {
      ...row,
      paid_order_value: paidOrderValue,
      gross_merch_sales: Number(row.gross_merch_sales || 0) + Number(consignment.gross_amount || 0),
      net_merch_sales: netMerchandise,
      refunded_total: Number(refunds.refunded_total ?? row.refunded_total ?? 0),
      refunded_merchandise: Number(refunds.refunded_merchandise || 0),
      net_revenue: paidOrderValue - Number(refunds.revenue_deduction || 0),
      net_merchandise_after_returns: netMerchandise - Number(refunds.merchandise_deduction || 0),
      paid_order_count: Number(row.paid_order_count || 0) + Number(consignment.sale_count || 0),
      product_cogs: Number(orderCogs.product_cogs || 0),
      packaging_cogs: Number(orderCogs.packaging_cogs || 0),
      missing_product_link_count: Number(orderCogs.missing_product_link_count || 0),
      zero_packaging_item_count: Number(orderCogs.zero_packaging_item_count || 0),
      known_cogs: Number(orderCogs.known_cogs ?? row.known_cogs ?? 0) + Number(consignment.cogs || 0),
      known_cogs_after_returns: Math.max(
        0,
        Number(orderCogs.known_cogs ?? row.known_cogs ?? 0) + Number(consignment.cogs || 0) - Number(refunds.returned_cogs_reversal || 0),
      ),
      returned_cogs_reversal: Number(refunds.returned_cogs_reversal || 0),
      manual_expenses: manualExpenses,
      processing_fees: processingFees,
      incubator_commissions: incubatorCommissions,
      incubator_sales: Number(consignment.gross_amount || 0),
      incubator_receivables: Number(consignment.receivables || 0),
      incubator_collected: Number(consignment.collected || 0),
      expenses: manualExpenses + processingFees + incubatorCommissions,
    };
  });
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
    } else {
      series.push({
        time_bucket: row.time_bucket,
        currency: row.currency,
        pov: row.gross_amount,
        net_merch: row.gross_amount,
        paid_order_count: row.sale_count,
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
      rows.push({
        ...sale,
        is_missing_cost: false,
        is_out_of_stock: Number(sale.current_stock || 0) <= 0,
        is_low_stock: Number(sale.current_stock || 0) > 0 && Number(sale.current_stock || 0) <= 5,
      });
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
