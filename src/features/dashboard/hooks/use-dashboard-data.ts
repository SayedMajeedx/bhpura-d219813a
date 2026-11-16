import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isCatalogMode } from "@/lib/storefront-mode";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { businessSettingsKeys, businessSettingsQueries } from "@/lib/data/business-settings";
import { ordersKeys, ordersQueries } from "@/lib/data/orders";
import { catalogKeys, catalogQueries } from "@/lib/data/catalog";
import { reportingKeys, reportingQueries } from "@/lib/data/reporting";
import { returnsQueries } from "@/lib/data/returns";

/**
 * Everything the dashboard reads: settings, the Reports accounting rows and daily sales for the
 * last 30 days (and the overview of the 30 before), catalog inquiries, products and variants
 * (shared with the inventory), the orders of the last 45 days with every order still open, how
 * many orders the store has had, the latest orders, pending returns and partner sales, kept fresh
 * by realtime invalidation. Each part of the page draws as its own read arrives: nothing waits
 * for everything. It once read every order the store ever had and every customer on each visit.
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
    // The orders read reaches 45 days back: the stock pace looks at 45 days of sales.
    const ordersSince = new Date(start);
    ordersSince.setDate(ordersSince.getDate() - 15);
    return { start, end, previousStart, previousEnd, ordersSince: ordersSince.toISOString() };
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
    ...reportingQueries.catalogInquiries(brandId),
    enabled: Boolean(brandId) && isCatalog,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const currency = businessSettings.data?.currency ?? "BHD";

  // Use the exact same accounting engine as Reports so dashboard KPIs cannot drift.
  const reportingOverviewQ = useQuery({
    ...reportingQueries.overview(
      slug,
      { from: dashboardPeriods.start, to: dashboardPeriods.end },
      reportingTimezone,
      false,
    ),
    staleTime: 60_000,
    enabled: Boolean(canViewFinancials && slug),
    refetchOnWindowFocus: false,
  });
  const previousReportingOverviewQ = useQuery({
    ...reportingQueries.overview(
      slug,
      { from: dashboardPeriods.previousStart, to: dashboardPeriods.previousEnd },
      reportingTimezone,
      false,
    ),
    staleTime: 60_000,
    enabled: Boolean(canViewFinancials && slug),
    refetchOnWindowFocus: false,
  });

  // The thirty days' net sales day by day (the Reports sales page's own series).
  const salesSeriesQ = useQuery({
    ...reportingQueries.sales(
      slug,
      { from: dashboardPeriods.start, to: dashboardPeriods.end },
      "day",
      reportingTimezone,
      false,
    ),
    staleTime: 60_000,
    enabled: Boolean(canViewFinancials && slug),
    refetchOnWindowFocus: false,
  });

  // 2-3. The catalog (shared with inventory, orders and expenses)
  const productsQ = useQuery({ ...catalogQueries.products(brandId), refetchOnWindowFocus: false });

  const variantsQ = useQuery({ ...catalogQueries.variants(brandId), refetchOnWindowFocus: false });

  // The orders of the last 45 days and every open one, with their lines; and how many in all.
  const ordersQ = useQuery({
    ...ordersQueries.dashboard(brandId, dashboardPeriods.ordersSince),
    refetchOnWindowFocus: false,
  });
  const orderCountQ = useQuery({ ...ordersQueries.count(brandId), refetchOnWindowFocus: false });

  // 6. Recent 5 orders for the operational feed
  const recentOrdersQ = useQuery({
    ...ordersQueries.recent(brandId, 5),
    refetchOnWindowFocus: false,
  });

  // Pending returns requiring inspection/action
  const pendingReturnsQ = useQuery({
    ...returnsQueries.pendingCount(brandId),
    refetchOnWindowFocus: false,
  });

  const incubatorSalesQ = useQuery({
    ...reportingQueries.incubatorSales(brandId, slug),
    refetchOnWindowFocus: false,
  });

  useRealtimeInvalidate(
    [
      { table: "orders", brandId, queryKey: ordersKeys.all(brandId) },
      { table: "order_items", brandId, queryKey: ordersKeys.all(brandId) },
      { table: "products", brandId, queryKey: catalogKeys.products(brandId) },
      { table: "product_variants", brandId, queryKey: catalogKeys.variants(brandId) },
      // A new order, expense or return moves the Reports figures the cards read.
      { table: "orders", brandId, queryKey: reportingKeys.all(slug) },
      { table: "expenses", brandId, queryKey: reportingKeys.overviews(slug) },
      { table: "return_requests", brandId, queryKey: reportingKeys.overviews(slug) },
      { table: "product_bom_items", brandId, queryKey: reportingKeys.overviews(slug) },
      { table: "packaging_materials", brandId, queryKey: reportingKeys.overviews(slug) },
      { table: "business_settings", brandId, queryKey: businessSettingsKeys.detail(brandId) },
    ],
    `dashboard-realtime:${brandId}`,
  );

  const figuresLoading = canViewFinancials
    ? reportingOverviewQ.isPending || previousReportingOverviewQ.isPending
    : false;
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
    ordersQ,
    orderCountQ,
    recentOrdersQ,
    pendingReturnsQ,
    incubatorSalesQ,
    figuresLoading,
    accountingRow,
    previousAccountingRow,
    salesSeriesQ,
    periodStart: dashboardPeriods.start,
  };
}

export type DashboardData = ReturnType<typeof useDashboardData>;
