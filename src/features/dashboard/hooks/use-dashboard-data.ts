import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isCatalogMode } from "@/lib/storefront-mode";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { businessSettingsKeys, businessSettingsQueries } from "@/lib/data/business-settings";
import { expensesKeys, expensesQueries } from "@/lib/data/expenses";
import { ordersKeys, ordersQueries } from "@/lib/data/orders";
import { catalogKeys, catalogQueries } from "@/lib/data/catalog";
import { customersKeys, customersQueries } from "@/lib/data/customers";
import { reportingKeys, reportingQueries } from "@/lib/data/reporting";
import { returnsQueries } from "@/lib/data/returns";

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
      { table: "orders", brandId, queryKey: customersKeys.contacts(brandId) },
      { table: "order_items", brandId, queryKey: ordersKeys.all(brandId) },
      { table: "products", brandId, queryKey: catalogKeys.products(brandId) },
      { table: "product_variants", brandId, queryKey: catalogKeys.variants(brandId) },
      { table: "expenses", brandId, queryKey: expensesKeys.all(brandId) },
      { table: "return_requests", brandId, queryKey: reportingKeys.overviews(slug) },
      { table: "product_bom_items", brandId, queryKey: reportingKeys.overviews(slug) },
      { table: "packaging_materials", brandId, queryKey: reportingKeys.overviews(slug) },
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
