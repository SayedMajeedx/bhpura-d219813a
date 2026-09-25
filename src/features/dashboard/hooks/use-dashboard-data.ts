import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCatalogInquiriesReporting, fetchReportingOverview } from "@/lib/reporting.functions";
import { isCatalogMode } from "@/lib/storefront-mode";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";

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

  // 1. Fetch Business settings
  const businessSettings = useQuery({
    queryKey: ["dashboard-business-settings", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("business_settings")
        .select(
          "business_name, currency, card_processing_fee, benefit_processing_fee, bom_enabled, storefront_mode",
        )
        .eq("brand_id", brandId)
        .maybeSingle();
      if (error) throw error;
      return (
        data ?? {
          business_name: "",
          currency: "BHD",
          card_processing_fee: 0,
          benefit_processing_fee: 0,
          bom_enabled: true,
          storefront_mode: "shop",
        }
      );
    },
    staleTime: 60_000,
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

  // 2. Fetch all products
  const productsQ = useQuery({
    queryKey: ["dashboard-products", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select(
          "id, name, name_ar, name_en, category, image_url, media, is_active, direct_packaging_cost",
        )
        .eq("brand_id", brandId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // 3. Fetch all variants
  const variantsQ = useQuery({
    queryKey: ["dashboard-variants", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select(
          "id, product_id, size, color, selling_price, cost_price, stock_main, stock_incubator, created_at",
        )
        .eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const bomItemsQ = useQuery({
    queryKey: ["product-bom-items-all", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_bom_items")
        .select("product_id, packaging_material_id, quantity_per_unit")
        .eq("brand_id", brandId);
      if (error) return [];
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const packagingMaterialsQ = useQuery({
    queryKey: ["packaging-materials", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("packaging_materials")
        .select("*")
        .eq("brand_id", brandId);
      if (error) return [];
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // 4. Fetch all customers
  const customersQ = useQuery({
    queryKey: ["dashboard-customers", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // 5. Fetch all orders (and order items)
  const ordersQ = useQuery({
    queryKey: ["dashboard-orders-with-items", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, invoice_number, created_at, currency, total, status, fulfillment_status, payment_status, customer_id, customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot, customers(name), payment_method, order_items(id, description, product_id, variant_id, quantity, unit_price, unit_cost, line_total, packaging_cost_snapshot)",
        )
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // 6. Fetch recent 5 orders for operational feed
  const recentOrdersQ = useQuery({
    queryKey: ["dashboard-recent-orders", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, invoice_number, created_at, currency, total, status, fulfillment_status, fulfillment_method, payment_status, customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot, customers(name)",
        )
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // 7. Fetch all manual expenses
  const expensesQ = useQuery({
    queryKey: ["dashboard-expenses", brandId],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").eq("brand_id", brandId);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
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
      { table: "orders", brandId, queryKey: ["dashboard-orders-with-items", brandId] },
      { table: "orders", brandId, queryKey: ["dashboard-recent-orders", brandId] },
      { table: "orders", brandId, queryKey: ["dashboard-customers", brandId] },
      { table: "order_items", brandId, queryKey: ["dashboard-orders-with-items", brandId] },
      { table: "products", brandId, queryKey: ["dashboard-products", brandId] },
      { table: "product_variants", brandId, queryKey: ["dashboard-variants", brandId] },
      { table: "expenses", brandId, queryKey: ["dashboard-expenses", brandId] },
      { table: "return_requests", brandId, queryKey: ["dashboard-reporting-overview", slug] },
      { table: "product_bom_items", brandId, queryKey: ["dashboard-reporting-overview", slug] },
      { table: "packaging_materials", brandId, queryKey: ["dashboard-reporting-overview", slug] },
      { table: "business_settings", brandId, queryKey: ["dashboard-business-settings", brandId] },
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
