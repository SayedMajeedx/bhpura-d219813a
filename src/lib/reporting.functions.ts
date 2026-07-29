import { supabase } from "@/integrations/supabase/client";

export type DateRange = {
  from: Date;
  to: Date;
};

export type ReportInterval = "day" | "week" | "month" | "year";

// Overview metrics
export async function fetchReportingOverview(range: DateRange, tz: string, includeHistorical: boolean = false) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_overview", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
    p_include_historical: includeHistorical,
  });
  if (error) throw error;
  return data;
}

// Sales metrics
export async function fetchReportingSales(range: DateRange, interval: ReportInterval, tz: string, includeHistorical: boolean = false) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_sales", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_interval: interval,
    p_tz: tz,
    p_include_historical: includeHistorical,
  });
  if (error) throw error;
  return data;
}

// Products & Inventory metrics
export async function fetchReportingProducts(range: DateRange, tz: string, includeHistorical: boolean = false, limit: number = 50, offset: number = 0, sortBy: string = 'units_sold_desc') {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_products_inventory", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
    p_include_historical: includeHistorical,
    p_limit: limit,
    p_offset: offset,
    p_sort_by: sortBy
  });
  if (error) throw error;
  return data;
}

// Customers metrics
export async function fetchReportingCustomers(range: DateRange, tz: string, includeHistorical: boolean = false, limit: number = 50, offset: number = 0) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_customers", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
    p_include_historical: includeHistorical,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return data;
}

// Expenses metrics
export async function fetchReportingExpenses(range: DateRange, tz: string) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_expenses", {
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
  });
  if (error) throw error;
  return data;
}

// Export function
export async function exportReportData(reportType: "sales" | "products" | "customers", range: DateRange, tz: string) {
  const { data, error } = await (supabase as any).rpc("rpc_reporting_export", {
    p_report_type: reportType,
    p_start_date: range.from.toISOString(),
    p_end_date: range.to.toISOString(),
    p_tz: tz,
  });
  if (error) throw error;
  return data;
}
