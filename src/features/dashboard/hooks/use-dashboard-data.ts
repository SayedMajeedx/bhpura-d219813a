import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCatalogInquiriesReporting, fetchReportingOverview } from "@/lib/reporting.functions";
import { isCatalogMode } from "@/lib/storefront-mode";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { businessSettingsKeys, businessSettingsQueries } from "@/lib/data/business-settings";
import { expensesKeys, expensesQueries } from "@/lib/data/expenses";
import { ordersKeys, ordersQueries } from "@/lib/data/orders";
import { catalogKeys, catalogQueries } from "@/lib/data/catalog";
import { customersKeys, customersQueries } from "@/lib/data/customers";

/**
 * Everything the dashboard reads: settings, the Reports accounting rows for
 * the last 30 days and the 30 before, catalog inquiries, products, variants,
 * packaging, customers, orders, expenses, pending returns and incubator
 * sales, kept fresh by realtime invalidation.
 */
export function useDashboardData({
  brandId,
  slug,
  canViewFinancials,
}: {
  brandId: string;
  slug: string;
  canViewFinancials: boolean;
}) {
  const dashboardPeriods = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const periodDurationMs = end.getTime() - start.getTime();
    const previousEnd = new Date(start.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - periodDurationMs);
    return { start, end, previousStart, previousEnd };
  }, []);
  const reportingTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // 1. Business settings (the whole row; null when the brand has none yet)
  const businessSettings = useQuery({
    ...businessSettingsQueries.detail(brandId),
    refetchOnWindowFocus: false,
  });

  const isCatalog = isCatalogMode(businessSettings.data);

  // Fetch catalog inquiries metrics when store is in catalog mode
  const catalogInquiriesQ = useQuery({
    queryKey: ["dashboard-catalog-inquiries", brandId],
    enabled: Boolean(brandId) && isCatalog,
    queryFn: () => fetchCatalogInquiriesReporting(brandId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const currency = businessSettings.data?.currency ?? "BHD";

  // Use the exact same accounting engine as Reports so dashboard KPIs cannot drift.
  const reportingOverviewQ = useQuery({
    queryKey: [
      "dashboard-reporting-overview",
      slug,
      dashboardPeriods.start.toISOString(),
      dashboardPeriods.end.toISOString(),
      reportingTimezone,
    ],
    queryFn: () =>
      fetchReportingOverview(
        { from: dashboardPeriods.start, to: dashboardPeriods.end },
        reportingTimezone,
        false,
        slug,
      ),
    staleTime: 60_000,
    enabled: Boolean(canViewFinancials && slug),
    refetchOnWindowFocus: false,
  });
  const previousReportingOverviewQ = useQuery({
    queryKey: [
      "dashboard-reporting-overview-previous",
      slug,
      dashboardPeriods.previousStart.toISOString(),
      dashboardPeriods.previousEnd.toISOString(),
      reportingTimezone,
    ],
    queryFn: () =>
      fetchReportingOverview(
        { from: dashboardPeriods.previousStart, to: dashboardPeriods.previousEnd },
        reportingTimezone,
        false,
        slug,
      ),
    staleTime: 60_000,
    enabled: Boolean(canViewFinancials && slug),
    refetchOnWindowFocus: false,
  });

  // 2-3. The catalog (shared with inventory, orders and expenses)
  const productsQ = useQuery({ ...catalogQueries.products(brandId), refetchOnWindowFocus: false });

  const variantsQ = useQuery({ ...catalogQueries.variants(brandId), refetchOnWindowFocus: false });

  const bomItemsQ = useQuery({ ...catalogQueries.bomItems(brandId), refetchOnWindowFocus: false });

  const packagingMaterialsQ = useQuery({
    ...catalogQueries.packagingMaterials(brandId),
    refetchOnWindowFocus: false,
  });

  // 4. Fetch all customers
  const customersQ = useQuery({
    ...customersQueries.contacts(brandId),
    refetchOnWindowFocus: false,
  });

  // 5. Every order with its lines (shared with the finance reports)
  const ordersQ = useQuery({ ...ordersQueries.finance(brandId), refetchOnWindowFocus: false });

  // 6. Recent 5 orders for the operational feed
  const recentOrdersQ = useQuery({
    ...ordersQueries.recent(brandId, 5),
    refetchOnWindowFocus: false,
  });

  // 7. Manual expenses (shared with the expenses page and reports)
  const expensesQ = useQuery({
    ...expensesQueries.list(brandId),
    enabled: Boolean(canViewFinancials && brandId),
    refetchOnWindowFocus: false,
  });

  // Pending returns requiring inspection/action
  const pendingReturnsQ = useQuery({
    queryKey: ["dashboard-pending-returns", brandId],
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("return_requests")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", brandId)
        .in("status", ["new", "under_review", "under_inspection", "received"]);
      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const incubatorSalesQ = useQuery({
    queryKey: ["dashboard-incubator-sales", brandId],
    queryFn: async () => {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - 60);
      const { data, error } = await (supabase as any).rpc("rpc_reporting_incubator_sales", {
        p_start_date: start.toISOString(),
        p_end_date: end.toISOString(),
        p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        p_interval: "day",
        p_brand_slug: slug,
      });
      if (error) throw error;
      return ((data?.timeseries ?? []) as any[]).map((row) => ({
        ...row,
        sold_at: row.time_bucket,
        gross_amount: row.gross_amount,
        quantity: row.sale_count,
      }));
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useRealtimeInvalidate(
    [
      { table: "orders", brandId, queryKey: ordersKeys.all(brandId) },
      { table: "orders", brandId, queryKey: customersKeys.contacts(brandId) },
      { table: "order_items", brandId, queryKey: ordersKeys.all(brandId) },
      { table: "products", brandId, queryKey: catalogKeys.products(brandId) },
      { table: "product_variants", brandId, queryKey: catalogKeys.variants(brandId) },
      { table: "expenses", brandId, queryKey: expensesKeys.all(brandId) },
      { table: "return_requests", brandId, queryKey: ["dashboard-reporting-overview", slug] },
      { table: "product_bom_items", brandId, queryKey: ["dashboard-reporting-overview", slug] },
      { table: "packaging_materials", brandId, queryKey: ["dashboard-reporting-overview", slug] },
      { table: "business_settings", brandId, queryKey: businessSettingsKeys.detail(brandId) },
    ],
    `dashboard-realtime:${brandId}`,
  );

  const isLoading =
    businessSettings.isLoading ||
    productsQ.isLoading ||
    variantsQ.isLoading ||
    customersQ.isLoading ||
    ordersQ.isLoading ||
    recentOrdersQ.isLoading ||
    incubatorSalesQ.isLoading ||
    (canViewFinancials
      ? expensesQ.isLoading || reportingOverviewQ.isLoading || previousReportingOverviewQ.isLoading
      : false);
  const accountingRows = Array.isArray(reportingOverviewQ.data) ? reportingOverviewQ.data : [];
  const accountingRow: any =
    accountingRows.find((row: any) => row.currency === currency) ?? accountingRows[0];
  const previousAccountingRows = Array.isArray(previousReportingOverviewQ.data)
    ? previousReportingOverviewQ.data
    : [];
  const previousAccountingRow: any =
    previousAccountingRows.find(
      (row: any) => row.currency === (accountingRow?.currency || currency),
    ) ?? previousAccountingRows[0];

  return {
    businessSettings,
    isCatalog,
    catalogInquiriesQ,
    currency,
    reportingOverviewQ,
    productsQ,
    variantsQ,
    bomItemsQ,
    packagingMaterialsQ,
    customersQ,
    ordersQ,
    recentOrdersQ,
    expensesQ,
    pendingReturnsQ,
    incubatorSalesQ,
    isLoading,
    accountingRow,
    previousAccountingRow,
  };
}

export type DashboardData = ReturnType<typeof useDashboardData>;
