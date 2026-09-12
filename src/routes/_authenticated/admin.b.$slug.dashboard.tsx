import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Package,
  Users,
  ReceiptText,
  TrendingUp,
  CalendarDays,
  Wallet,
  PiggyBank,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Copy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { formatDate, formatMoney } from "@/lib/format";
import { getItemPackagingCost } from "@/lib/bom-calculator";
import { fetchReportingOverview } from "@/lib/reporting.functions";
import { useI18n, useT } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";
import { useBrand } from "@/lib/brand-context";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { useMemo, useState } from "react";
import { getOrderCustomerName } from "@/lib/order-customer-snapshot";
import { getOrderWorkflow } from "@/lib/order-workflow";
import { isLowStock } from "@/lib/inventory-health";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { getStorefrontUrl } from "@/lib/storefront-url";

import { DashboardCommandHeader } from "@/components/dashboard/DashboardCommandHeader";
import {
  DashboardScopeSwitcher,
  type DashboardViewScope,
} from "@/components/dashboard/DashboardScopeSwitcher";
import { DashboardActivityQueue } from "@/components/dashboard/DashboardActivityQueue";
import { ReviewRequestQueue } from "@/components/dashboard/ReviewRequestQueue";
import { ReviewInsightsSummary } from "@/components/dashboard/ReviewInsightsSummary";
import { DashboardActionStrip } from "@/components/dashboard/DashboardActionStrip";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { canViewFinancials } = useProfile();
  const { slug } = Route.useParams();
  const brand = useBrand();
  const brandId = brand.id;
  const locale = lang === "ar" ? "ar-BH-u-nu-latn" : "en-US";
  const reportingPeriodLabel = isAr ? "آخر 30 يومًا" : "the last 30 days";
  const dashboardPeriods = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const previousEnd = new Date(start.getTime() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - 29);
    previousStart.setHours(0, 0, 0, 0);
    return { start, end, previousStart, previousEnd };
  }, []);
  const reportingTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const isMounted = typeof window !== "undefined";
  const [activeScope, setActiveScope] = useState<DashboardViewScope>("financials");

  // Guided Onboarding Milestones State (Per-brand persistent tracking)
  const [isPreviewed, setIsPreviewed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(`boutq_onboarding_previewed_${brandId}`) === "true";
    } catch {
      return false;
    }
  });

  const [isManualSaleCompleted, setIsManualSaleCompleted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(`boutq_onboarding_sale_done_${brandId}`) === "true";
    } catch {
      return false;
    }
  });

  const [isOnboardingDismissed, setIsOnboardingDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(`boutq_onboarding_dismissed_${brandId}`) === "true";
    } catch {
      return false;
    }
  });

  const handleCopyStoreLink = async () => {
    const url = getStorefrontUrl(brand);
    try {
      await navigator.clipboard.writeText(url);
      if (!isPreviewed) {
        setIsPreviewed(true);
        try {
          localStorage.setItem(`boutq_onboarding_previewed_${brandId}`, "true");
        } catch {
          // localStorage can be unavailable (private mode, quota) — onboarding state just won't persist.
        }
      }
      toast.success(
        isAr
          ? "تم نسخ رابط المتجر بنجاح واكتمال خطوة المعاينة والمشاركة!"
          : "Store link copied! Sharing milestone completed.",
      );
    } catch {
      toast.error(isAr ? "تعذر نسخ الرابط" : "Failed to copy link");
    }
  };

  const handlePreviewStorefront = () => {
    if (!isPreviewed) {
      setIsPreviewed(true);
      try {
        localStorage.setItem(`boutq_onboarding_previewed_${brandId}`, "true");
      } catch {
        // localStorage can be unavailable (private mode, quota) — onboarding state just won't persist.
      }
    }
    toast.success(
      isAr
        ? "تم تسجيل معاينة المتجر واكتمال الخطوة بنجاح!"
        : "Storefront previewed! Milestone marked as completed.",
    );
  };

  const togglePreviewMilestone = (completed: boolean) => {
    setIsPreviewed(completed);
    try {
      localStorage.setItem(`boutq_onboarding_previewed_${brandId}`, String(completed));
    } catch {
      // localStorage can be unavailable (private mode, quota) — onboarding state just won't persist.
    }
    toast.success(
      completed
        ? isAr
          ? "تم تحديد معاينة المتجر كمكتملة!"
          : "Storefront preview marked as complete!"
        : isAr
          ? "تم التراجع عن إكمال الخطوة"
          : "Milestone marked as incomplete",
    );
  };

  const toggleSaleMilestone = (completed: boolean) => {
    setIsManualSaleCompleted(completed);
    try {
      localStorage.setItem(`boutq_onboarding_sale_done_${brandId}`, String(completed));
    } catch {
      // localStorage can be unavailable (private mode, quota) — onboarding state just won't persist.
    }
    toast.success(
      completed
        ? isAr
          ? "تم تحديد تسجيل أول عملية بيع كمكتملة!"
          : "First sale milestone marked as complete!"
        : isAr
          ? "تم التراجع عن إكمال الخطوة"
          : "Milestone marked as incomplete",
    );
  };

  const handleDismissOnboarding = () => {
    setIsOnboardingDismissed(true);
    try {
      localStorage.setItem(`boutq_onboarding_dismissed_${brandId}`, "true");
    } catch {
      // localStorage can be unavailable (private mode, quota) — onboarding state just won't persist.
    }
    toast.success(isAr ? "تم إخفاء لوحة الإطلاق بنجاح" : "Onboarding checklist dismissed");
  };

  const handleRestoreOnboarding = () => {
    setIsOnboardingDismissed(false);
    try {
      localStorage.removeItem(`boutq_onboarding_dismissed_${brandId}`);
    } catch {
      // localStorage can be unavailable (private mode, quota) — onboarding state just won't persist.
    }
  };

  // 1. Fetch Business settings
  const businessSettings = useQuery({
    queryKey: ["dashboard-business-settings", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("business_settings")
        .select("business_name, currency, card_processing_fee, benefit_processing_fee, bom_enabled")
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
        }
      );
    },
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
    expensesQ.isLoading ||
    incubatorSalesQ.isLoading ||
    reportingOverviewQ.isLoading ||
    previousReportingOverviewQ.isLoading;
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

  // Filter confirmed/completed orders for revenue reporting
  const validRevenueOrders = useMemo(() => {
    return (ordersQ.data ?? []).filter((o) => {
      const status = String(o.status || "").toLowerCase();
      const fulfillment = String(o.fulfillment_status || "").toLowerCase();
      return (
        String(o.payment_status || "").toLowerCase() === "paid" &&
        !["cancelled", "canceled", "refunded", "archived_historical"].includes(status) &&
        !["cancelled", "canceled", "refunded"].includes(fulfillment)
      );
    });
  }, [ordersQ.data]);

  // Operational Actionable Orders (Orders needing triage/action)
  const actionNeededOrders = useMemo(() => {
    return (ordersQ.data ?? [])
      .filter((o) => {
        const wf = getOrderWorkflow(o);
        return wf.needsAttention && !wf.terminal;
      })
      .slice(0, 5);
  }, [ordersQ.data]);

  // Financial intelligence aggregations
  const financials = useMemo(() => {
    const allOrders = validRevenueOrders;
    const now = new Date();
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - 29);
    currentStart.setHours(0, 0, 0, 0);
    const priorStart = new Date(currentStart);
    priorStart.setDate(priorStart.getDate() - 30);
    const orders = allOrders.filter((o) => {
      const timestamp = Date.parse(o.created_at);
      return (
        Number.isFinite(timestamp) &&
        timestamp >= currentStart.getTime() &&
        timestamp <= now.getTime()
      );
    });
    const expenses = (expensesQ.data ?? []).filter((expense: any) => {
      const rawDate = expense.expense_date || expense.created_at;
      const timestamp = rawDate ? Date.parse(rawDate) : NaN;
      return (
        Number.isFinite(timestamp) &&
        timestamp >= currentStart.getTime() &&
        timestamp <= now.getTime()
      );
    });
    const allIncubatorSales = incubatorSalesQ.data ?? [];
    const incubatorSales = allIncubatorSales.filter((sale: any) => {
      const timestamp = Date.parse(sale.sold_at);
      return (
        Number.isFinite(timestamp) &&
        timestamp >= currentStart.getTime() &&
        timestamp <= now.getTime()
      );
    });
    const variants = variantsQ.data ?? [];

    const variantCostMap = new Map<string, number>();
    variants.forEach((v) => {
      variantCostMap.set(v.id, Number(v.cost_price || 0));
    });

    const orderRevenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const incubatorRevenue = incubatorSales.reduce(
      (sum: number, sale: any) => sum + Number(sale.gross_amount || 0),
      0,
    );
    const revenue = orderRevenue + incubatorRevenue;

    let productCogs = 0;
    let packagingBomCogs = 0;
    const prods = productsQ.data ?? [];
    const boms = bomItemsQ.data ?? [];
    const mats = packagingMaterialsQ.data ?? [];

    orders.forEach((order) => {
      const isFulfilled = ["fulfilled", "delivered", "completed", "shipped", "picked_up"].includes(
        String(order.fulfillment_status || order.status || "").toLowerCase(),
      );
      (order.order_items ?? []).forEach((item: any) => {
        const itemCost =
          item.unit_cost != null && !isNaN(Number(item.unit_cost))
            ? Number(item.unit_cost)
            : (variantCostMap.get(item.variant_id) ?? 0);
        const qty = Number(item.quantity || 0);

        productCogs += itemCost * qty;
        if (isFulfilled && (businessSettings.data as any)?.bom_enabled !== false) {
          const pkgCost = getItemPackagingCost(item, prods, variants, boms, mats);
          packagingBomCogs += pkgCost * qty;
        }
      });
    });

    const incubatorCogs = incubatorSales.reduce(
      (sum: number, sale: any) =>
        sum + Number(sale.product_cost_snapshot || 0) + Number(sale.packaging_cost_snapshot || 0),
      0,
    );
    const cogs = productCogs + packagingBomCogs + incubatorCogs;

    const cardFeePercent = Number((businessSettings.data as any)?.card_processing_fee ?? 0);
    const benefitFeePercent = Number((businessSettings.data as any)?.benefit_processing_fee ?? 0);

    let paymentProcessingFees = 0;
    orders.forEach((o) => {
      const totalVal = Number(o.total || 0);
      if (o.payment_method === "card") {
        paymentProcessingFees += totalVal * (cardFeePercent / 100);
      } else if (o.payment_method === "benefit") {
        paymentProcessingFees += totalVal * (benefitFeePercent / 100);
      }
    });

    // OpEx excludes bulk packaging asset purchases (expense_type === 'cogs')
    const manualOpex = expenses
      .filter((e: any) => (e.expense_type || "opex") === "opex")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const incubatorCommissions = incubatorSales.reduce(
      (sum: number, sale: any) => sum + Number(sale.commission_amount || 0),
      0,
    );
    const opex = manualOpex + paymentProcessingFees + incubatorCommissions;
    const reportRevenue = Number(accountingRow?.net_revenue ?? revenue);
    const reportCogs = Number(
      accountingRow?.known_cogs_after_returns ?? accountingRow?.known_cogs ?? cogs,
    );
    const reportOpex = Number(accountingRow?.expenses ?? opex);
    const netProfit = reportRevenue - reportCogs - reportOpex;
    const grossMarginPercent =
      reportRevenue > 0 ? ((reportRevenue - reportCogs) / reportRevenue) * 100 : 0;
    const current30Orders = orders;
    const prior30Orders = allOrders.filter((o) => {
      const timestamp = Date.parse(o.created_at);
      return (
        Number.isFinite(timestamp) &&
        timestamp >= priorStart.getTime() &&
        timestamp < currentStart.getTime()
      );
    });
    const priorIncubatorSales = allIncubatorSales.filter((sale: any) => {
      const timestamp = Date.parse(sale.sold_at);
      return (
        Number.isFinite(timestamp) &&
        timestamp >= priorStart.getTime() &&
        timestamp < currentStart.getTime()
      );
    });
    const revenueWithIncubators = reportRevenue;
    const revenuePrior = Number(
      previousAccountingRow?.net_revenue ??
        prior30Orders.reduce((sum, o) => sum + Number(o.total || 0), 0) +
          priorIncubatorSales.reduce(
            (sum: number, sale: any) => sum + Number(sale.gross_amount || 0),
            0,
          ),
    );
    const revenueDeltaPct =
      revenuePrior > 0 ? ((revenueWithIncubators - revenuePrior) / revenuePrior) * 100 : null;

    const ordersCurrent =
      current30Orders.length +
      incubatorSales.reduce((sum: number, sale: any) => sum + Number(sale.quantity || 0), 0);
    const ordersPrior =
      prior30Orders.length +
      priorIncubatorSales.reduce((sum: number, sale: any) => sum + Number(sale.quantity || 0), 0);
    const ordersDeltaPct =
      ordersPrior > 0 ? ((ordersCurrent - ordersPrior) / ordersPrior) * 100 : null;

    const aovCurrent = ordersCurrent > 0 ? revenueWithIncubators / ordersCurrent : 0;
    const aovPrior = ordersPrior > 0 ? revenuePrior / ordersPrior : 0;
    const aovDeltaPct = aovPrior > 0 ? ((aovCurrent - aovPrior) / aovPrior) * 100 : null;

    // 30-Day Daily Sales Time Series Chart Data
    const chartDataMap = new Map<string, { date: string; sales: number; orders: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(currentStart);
      d.setDate(currentStart.getDate() + (29 - i));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const label = d.toLocaleDateString(locale, { day: "numeric", month: "short" });
      chartDataMap.set(key, { date: label, sales: 0, orders: 0 });
    }

    orders.forEach((o) => {
      if (!o.created_at) return;
      const d = new Date(o.created_at);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (chartDataMap.has(key)) {
        const item = chartDataMap.get(key)!;
        item.sales += Number(o.total || 0);
        item.orders += 1;
      }
    });
    incubatorSales.forEach((sale: any) => {
      const d = new Date(sale.sold_at);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const item = chartDataMap.get(key);
      if (item) {
        item.sales += Number(sale.gross_amount || 0);
        item.orders += Number(sale.quantity || 0);
      }
    });

    const dailyChartSeries = Array.from(chartDataMap.values());

    return {
      revenue: reportRevenue,
      storeRevenue: orderRevenue,
      incubatorRevenue,
      cogs: reportCogs,
      opex: reportOpex,
      totalExpenses: reportCogs + reportOpex,
      netProfit,
      grossMarginPercent,
      revenueCurrent: revenueWithIncubators,
      revenueDeltaPct,
      ordersCurrent,
      ordersDeltaPct,
      aovCurrent,
      aovDeltaPct,
      dailyChartSeries,
    };
  }, [
    validRevenueOrders,
    expensesQ.data,
    incubatorSalesQ.data,
    variantsQ.data,
    productsQ.data,
    bomItemsQ.data,
    packagingMaterialsQ.data,
    businessSettings.data,
    accountingRow,
    previousAccountingRow,
    locale,
  ]);

  // CRM segmentation distribution
  const crmStats = useMemo(() => {
    const orders = validRevenueOrders;
    const customers = customersQ.data ?? [];

    const nowMs = new Date().getTime();
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;

    const ordersByCustomer = new Map<string, typeof orders>();
    orders.forEach((o) => {
      if (o.customer_id) {
        if (!ordersByCustomer.has(o.customer_id)) {
          ordersByCustomer.set(o.customer_id, []);
        }
        ordersByCustomer.get(o.customer_id)!.push(o);
      }
    });

    let vipCount = 0;
    let churnRiskCount = 0;
    const churnRiskVips: Array<{ id: string; name: string }> = [];

    customers.forEach((c) => {
      const custOrders = ordersByCustomer.get(c.id) ?? [];
      const lifetimeSpend = custOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

      let lastOrderMs = 0;
      custOrders.forEach((o) => {
        const ms = new Date(o.created_at).getTime();
        if (ms > lastOrderMs) lastOrderMs = ms;
      });

      const isVip = lifetimeSpend > 250;
      const isIdle60 = lastOrderMs > 0 && nowMs - lastOrderMs > sixtyDaysMs;

      if (isVip) {
        vipCount++;
        if (isIdle60) {
          churnRiskVips.push({ id: c.id, name: c.name });
        }
      }

      if (isIdle60) {
        churnRiskCount++;
      }
    });

    return {
      vipCount,
      churnRiskCount,
      churnRiskVips,
    };
  }, [validRevenueOrders, customersQ.data]);

  // Inventory velocity & stock depletion calculations
  const inventoryIntel = useMemo(() => {
    const products = productsQ.data ?? [];
    const variants = variantsQ.data ?? [];
    const orders = validRevenueOrders;

    const past45Days = new Date();
    past45Days.setDate(past45Days.getDate() - 45);
    const past45DaysMs = past45Days.getTime();

    const salesByVariant = new Map<string, number>();

    orders.forEach((order) => {
      const orderTime = new Date(order.created_at).getTime();
      if (orderTime >= past45DaysMs) {
        (order.order_items ?? []).forEach((item: any) => {
          if (item.variant_id) {
            salesByVariant.set(
              item.variant_id,
              (salesByVariant.get(item.variant_id) ?? 0) + Number(item.quantity || 0),
            );
          }
        });
      }
    });

    const getVariantStock = (v: any) => Number(v.stock_main || 0) + Number(v.stock_incubator || 0);

    const getVariantDailyVelocity = (v: any) => {
      const qtySold = salesByVariant.get(v.id) || 0;
      const variantCreatedAt = v.created_at ? new Date(v.created_at) : null;
      const daysElapsed = variantCreatedAt
        ? Math.max(
            1,
            Math.min(
              45,
              Math.ceil(
                (new Date().getTime() - variantCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
              ),
            ),
          )
        : 45;
      return qtySold / daysElapsed;
    };

    let deadStockCount = 0;
    variants.forEach((v) => {
      const qtySold = salesByVariant.get(v.id) || 0;
      if (qtySold === 0) {
        deadStockCount++;
      }
    });

    const productStockMap = new Map<string, number>();
    const productWeeklySalesMap = new Map<string, number>();

    products.forEach((product) => {
      const pVariants = variants.filter((v) => v.product_id === product.id);
      const stock = pVariants.reduce((sum, v) => sum + getVariantStock(v), 0);
      productStockMap.set(product.id, stock);

      const productDailyVelocity = pVariants.reduce(
        (sum, v) => sum + getVariantDailyVelocity(v),
        0,
      );
      productWeeklySalesMap.set(product.id, productDailyVelocity * 7);
    });

    let lowStockCount = 0;
    products.forEach((product) => {
      const stock = productStockMap.get(product.id) ?? 0;
      const weeklySales = productWeeklySalesMap.get(product.id) ?? 0;
      if (isLowStock(stock, weeklySales)) {
        lowStockCount++;
      }
    });

    const availableWithoutImages = products
      .filter((product) => {
        if (!product.is_active || (productStockMap.get(product.id) ?? 0) <= 0) return false;
        const media = Array.isArray(product.media) ? product.media : [];
        const hasMedia = media.some((item: any) =>
          typeof item === "string" ? Boolean(item.trim()) : Boolean(item?.url || item?.src),
        );
        return !product.image_url && !hasMedia;
      })
      .map((product) => ({
        id: product.id,
        name: lang === "ar" ? product.name_ar || product.name : product.name_en || product.name,
        stock: productStockMap.get(product.id) ?? 0,
      }));

    const lowStockVariants: Array<{
      id: string;
      name: string;
      stock: number;
      daysLeft: number;
    }> = [];

    variants.forEach((v) => {
      const product = products.find((p) => p.id === v.product_id);
      if (!product) return;

      const stock = getVariantStock(v);
      const dailyVelocity = getVariantDailyVelocity(v);
      if (dailyVelocity > 0) {
        const daysLeft = Math.ceil(stock / dailyVelocity);
        if (daysLeft <= 14) {
          const sizeText = v.size ? ` (${v.size})` : "";
          const colorText = v.color ? ` - ${v.color}` : "";
          const pName =
            lang === "ar" ? product.name_ar || product.name : product.name_en || product.name;
          lowStockVariants.push({
            id: v.id,
            name: `${pName}${sizeText}${colorText}`,
            stock,
            daysLeft,
          });
        }
      } else if (stock === 0) {
        const sizeText = v.size ? ` (${v.size})` : "";
        const colorText = v.color ? ` - ${v.color}` : "";
        const pName =
          lang === "ar" ? product.name_ar || product.name : product.name_en || product.name;
        lowStockVariants.push({
          id: v.id,
          name: `${pName}${sizeText}${colorText}`,
          stock: 0,
          daysLeft: 0,
        });
      }
    });

    return {
      deadStockCount,
      lowStockCount,
      outOfStockVariantCount: lowStockVariants.filter((item) => item.stock === 0).length,
      lowStockVariants: lowStockVariants.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5),
      availableWithoutImages,
    };
  }, [productsQ.data, variantsQ.data, validRevenueOrders, lang]);

  // Orders awaiting merchant preparation & fulfillment (synchronized with orders page to_prepare tab)
  const unfulfilledOrdersCount = useMemo(() => {
    return (ordersQ.data ?? []).filter((o: any) => {
      const workflow = getOrderWorkflow(o);
      return (
        !workflow.terminal &&
        [
          "pending",
          "packing",
          "on_hold",
          "needs_packing",
          "received_from_tailor",
          "sent_to_tailor",
        ].includes(workflow.fulfillment) &&
        (!workflow.awaitingPayment || workflow.isCod)
      );
    }).length;
  }, [ordersQ.data]);

  // Loading skeleton placeholder
  if (isLoading) {
    return <RoutePendingSkeleton />;
  }

  if (reportingOverviewQ.error) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <Card className="border-rose-200 bg-rose-50/70 p-8 text-center">
          <AlertCircle className="mx-auto h-9 w-9 text-rose-600" />
          <h2 className="mt-4 text-lg font-semibold">
            {isAr
              ? "تعذر تحميل الأرقام المالية الموحّدة"
              : "Unified financial figures could not be loaded"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isAr
              ? "لن نعرض أرقاماً تقديرية قد تتعارض مع التقارير. أعد المحاولة بعد التحقق من الاتصال."
              : "We will not show fallback estimates that may conflict with Reports. Check the connection and try again."}
          </p>
          <button
            type="button"
            className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            onClick={() => reportingOverviewQ.refetch()}
          >
            {isAr ? "إعادة المحاولة" : "Try again"}
          </button>
        </Card>
      </div>
    );
  }

  // Sales & Product status for guided onboarding milestones
  const totalOrdersCount = ordersQ.data?.length ?? 0;
  const hasRealSales =
    totalOrdersCount > 0 || financials.ordersCurrent > 0 || validRevenueOrders.length > 0;
  const hasSales = hasRealSales;
  const hasProducts = (productsQ.data?.length ?? 0) > 0;

  const step1Done = hasProducts;
  const step2Done = isPreviewed;
  const step3Done = hasRealSales || isManualSaleCompleted;

  const completedStepsCount = (step1Done ? 1 : 0) + (step2Done ? 1 : 0) + (step3Done ? 1 : 0);
  const isAllStepsCompleted = completedStepsCount === 3;

  // Primary Financial KPIs
  const primaryKpis = [
    ...(canViewFinancials
      ? [
          {
            label: isAr ? "الإيرادات وصافي الربح" : "Revenue & Net Profit",
            value: formatMoney(financials.revenue, currency, locale),
            subValue: `${isAr ? "صافي الربح" : "Net Profit"}: ${formatMoney(financials.netProfit, currency, locale)}`,
            breakdown:
              financials.incubatorRevenue > 0
                ? isAr
                  ? `(متجر: ${formatMoney(financials.storeRevenue, currency, locale)} | حاضنات: ${formatMoney(financials.incubatorRevenue, currency, locale)})`
                  : `(Store: ${formatMoney(financials.storeRevenue, currency, locale)} | Incubators: ${formatMoney(financials.incubatorRevenue, currency, locale)})`
                : null,
            deltaPct: financials.revenueDeltaPct,
            icon: TrendingUp,
            color: "text-emerald-500",
            border: "hover:border-emerald-500/20",
          },
          {
            label: isAr ? "متوسط قيمة الطلب" : "Average Order Value (AOV)",
            value: formatMoney(financials.aovCurrent, currency, locale),
            subValue: `${isAr ? "إجمالي الطلبات" : "Total Orders"}: ${financials.ordersCurrent}`,
            deltaPct: financials.aovDeltaPct,
            icon: Wallet,
            color: "text-sky-500",
            border: "hover:border-sky-500/20",
          },
          {
            label: isAr ? "نسبة هامش الربح الإجمالي" : "Gross Margin %",
            value: `${financials.grossMarginPercent.toFixed(1)}%`,
            subValue: `${isAr ? "تكلفة المبيعات" : "COGS"}: ${formatMoney(financials.cogs, currency, locale)}`,
            icon: PiggyBank,
            color: "text-blue-500",
            border: "hover:border-blue-500/20",
          },
        ]
      : []),
    {
      label: isAr ? "إجمالي عمليات البيع" : "Total Sales Transactions",
      value: `${financials.ordersCurrent}`,
      subValue: isAr ? "خلال الثلاثين يومًا الماضية" : "Over the last 30 days",
      deltaPct: financials.ordersDeltaPct,
      icon: ReceiptText,
      color: "text-indigo-500",
      border: "hover:border-indigo-500/20",
    },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-3.5 p-1 sm:p-2">
      {/* 1. Integrated Command Header */}
      <DashboardCommandHeader
        lang={isAr ? "ar" : "en"}
        slug={slug}
        brandName={(isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug}
        salesTransactionCount={financials.ordersCurrent}
        periodLabel={reportingPeriodLabel}
      />

      {/* 1.5 Merchant Action Strip: What Needs Attention Today */}
      <DashboardActionStrip
        slug={slug}
        isAr={isAr}
        unfulfilledOrdersCount={unfulfilledOrdersCount}
        lowStockCount={inventoryIntel.lowStockCount}
        pendingReturnsCount={pendingReturnsQ.data ?? 0}
      />

      <ReviewRequestQueue
        brandId={brandId}
        brandName={(isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug}
        isAr={isAr}
      />

      <ReviewInsightsSummary brandId={brandId} slug={slug} isAr={isAr} />

      {/* 2. Scope Switcher Toolbar */}
      <DashboardScopeSwitcher
        lang={isAr ? "ar" : "en"}
        activeScope={activeScope}
        onScopeChange={(scope) => setActiveScope(scope)}
        lowStockCount={inventoryIntel.lowStockCount}
      />

      {/* Dynamic View 1: Financial Telemetry (Default / "financials") */}
      {activeScope === "financials" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Guided Onboarding Checklist with Real State & Interactive Completion */}
          {!isOnboardingDismissed && (
            <Card
              className={`p-5 sm:p-6 border-2 transition-all duration-300 rounded-3xl shadow-xs space-y-4 animate-in fade-in slide-in-from-top-2 ${
                isAllStepsCompleted
                  ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-background to-secondary/15"
                  : "border-primary/25 bg-gradient-to-br from-primary/5 via-background to-secondary/15"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-xs transition-colors ${
                      isAllStepsCompleted
                        ? "bg-emerald-600 text-white"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {isAllStepsCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Sparkles className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-heading font-extrabold text-base sm:text-lg text-foreground flex items-center gap-2">
                      <span>
                        {isAllStepsCompleted
                          ? isAr
                            ? "🎉 مبروك! اكتمل إعداد المتجر بنجاح"
                            : "🎉 Store Launch Checklist Complete!"
                          : isAr
                            ? "ابدأ هنا — 3 خطوات لإطلاق متجرك بنجاح"
                            : "Start Here — 3 Steps to Launch Your Store"}
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isAllStepsCompleted
                        ? isAr
                          ? "أنجزت جميع خطوات الإطلاق الأساسية. متجرك الآن يعمل وجاهز لاستقبال عملائك ومبيعاتك."
                          : "All essential launch milestones are complete. Your store is ready to serve customers."
                        : isAr
                          ? "أكمل هذه الخطوات البسيطة لبدء استقبال الطلبات ومتابعة أرباحك مباشرة"
                          : "Complete these simple steps to start receiving orders and tracking your live profits"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAllStepsCompleted ? (
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      {isAr ? "مكتمل 3 من 3" : "3 of 3 Done"}
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {isAr
                        ? `مكتمل ${completedStepsCount} من 3`
                        : `${completedStepsCount} of 3 Done`}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDismissOnboarding}
                    title={isAr ? "إخفاء لوحة البداية" : "Dismiss checklist"}
                    className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-xl"
                  >
                    <X className="h-3.5 w-3.5 me-1" />
                    {isAr ? "إخفاء" : "Dismiss"}
                  </Button>
                </div>
              </div>

              {/* Real Progress Bar */}
              <div className="w-full h-1.5 bg-muted/60 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    isAllStepsCompleted ? "bg-emerald-500" : "bg-primary"
                  }`}
                  style={{ width: `${Math.max(6, (completedStepsCount / 3) * 100)}%` }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                {/* Step 1: Add First Product */}
                <div
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                    step1Done
                      ? "bg-emerald-500/5 border-emerald-500/20 text-foreground"
                      : "bg-card border-border shadow-2xs hover:border-primary/40"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {isAr ? "الخطوة 1" : "Step 1"}
                      </span>
                      {step1Done ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {isAr ? "تمت الإضافة" : "Completed"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
                          <Clock className="h-3.5 w-3.5" />
                          {isAr ? "بانتظارك" : "Pending"}
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm text-foreground">
                      {isAr ? "إضافة أول منتج" : "Add Your First Product"}
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {step1Done
                        ? isAr
                          ? `لديك الآن ${productsQ.data?.length ?? 1} منتج جاهز للبيع في المتجر.`
                          : `You have ${productsQ.data?.length ?? 1} products ready to sell.`
                        : isAr
                          ? "أدخل اسم وسعر وصورة أول منتج لعرضه فوراً أمام عملائك."
                          : "Add name, price, and photo of your first item to display."}
                    </p>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant={step1Done ? "outline" : "default"}
                    className={`w-full font-bold text-xs rounded-xl ${
                      !step1Done ? "bg-primary text-primary-foreground shadow-xs" : ""
                    }`}
                  >
                    <Link to="/admin/b/$slug/inventory" params={{ slug }}>
                      <Package className="h-3.5 w-3.5 me-1.5" />
                      {step1Done
                        ? isAr
                          ? "إدارة المنتجات"
                          : "Manage Products"
                        : isAr
                          ? "أضف منتجك الأول الآن"
                          : "Add Product Now"}
                    </Link>
                  </Button>
                </div>

                {/* Step 2: Preview & Share Storefront */}
                <div
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                    step2Done
                      ? "bg-emerald-500/5 border-emerald-500/20 text-foreground"
                      : "bg-card border-border shadow-2xs hover:border-primary/40"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {isAr ? "الخطوة 2" : "Step 2"}
                      </span>
                      {step2Done ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {isAr ? "تمت المعاينة" : "Completed"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          {isAr ? "جاهز للمعاينة" : "Ready"}
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm text-foreground">
                      {isAr ? "معاينة ومشاركة المتجر" : "Preview & Share Store"}
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {step2Done
                        ? isAr
                          ? "تم التحقق من ظهور المتجر بنجاح. يمكنك معاينته مجدداً أو نسخ الرابط لمشاركته."
                          : "Storefront previewed. Link is ready to share with your customers."
                        : isAr
                          ? "شاهد كيف يبدو متجرك لعملائك على الجوال، وشارك الرابط مع جمهورك."
                          : "See how your store looks to mobile buyers, and share the link with your audience."}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Button
                        asChild
                        size="sm"
                        variant={step2Done ? "outline" : "default"}
                        className={`flex-1 font-bold text-xs rounded-xl ${
                          !step2Done
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "border-border hover:bg-secondary"
                        }`}
                      >
                        <a
                          href={getStorefrontUrl(brand)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={handlePreviewStorefront}
                        >
                          <ExternalLink className="h-3.5 w-3.5 me-1.5 text-current" />
                          {isAr ? "معاينة المتجر ↗" : "Preview Store ↗"}
                        </a>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCopyStoreLink}
                        title={isAr ? "نسخ رابط المتجر" : "Copy store link"}
                        className="font-bold text-xs rounded-xl border-border hover:bg-secondary px-3"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => togglePreviewMilestone(!step2Done)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted"
                      >
                        {step2Done
                          ? isAr
                            ? "تحديد كغير مكتمل"
                            : "Mark incomplete"
                          : isAr
                            ? "تحديد كمكتمل يدويًا ✓"
                            : "Mark as done ✓"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 3: First Sale */}
                <div
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                    step3Done
                      ? "bg-emerald-500/5 border-emerald-500/20 text-foreground"
                      : "bg-card border-border shadow-2xs hover:border-primary/40"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {isAr ? "الخطوة 3" : "Step 3"}
                      </span>
                      {step3Done ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {isAr ? "تم التسجيل" : "Completed"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {isAr ? "الخطوة القادمة" : "Next Milestone"}
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-sm text-foreground">
                      {isAr ? "تسجيل أول عملية بيع" : "Record Your First Sale"}
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {step3Done
                        ? totalOrdersCount > 0
                          ? isAr
                            ? `تم تسجيل ${totalOrdersCount} طلب بنجاح. لوحة المبيعات والتقارير المالية تعمل بكامل طاقتها.`
                            : `${totalOrdersCount} orders recorded successfully. Sales telemetry is active.`
                          : isAr
                            ? "تم تأكيد تسجيل المبيعات بنجاح. لوحة التحكم والتقارير جاهزة للاستخدام."
                            : "First sale milestone verified. Financial reports are active."
                        : isAr
                          ? "استقبل أول طلب من متجرك الإلكتروني، أو سجّل طلباً يدوياً لتشغيل لوحة الأرباح والمخزون."
                          : "Receive your first online order or create a manual order to activate financial metrics."}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Button
                      asChild
                      size="sm"
                      variant={step3Done ? "outline" : "secondary"}
                      className="w-full font-bold text-xs rounded-xl hover:bg-secondary/80"
                    >
                      <Link to="/admin/b/$slug/orders" params={{ slug }}>
                        <ReceiptText className="h-3.5 w-3.5 me-1.5 text-primary" />
                        {step3Done
                          ? isAr
                            ? "إدارة الطلبات والفواتير"
                            : "Manage Orders & Invoices"
                          : isAr
                            ? "الطلبات والفواتير"
                            : "Orders & Invoices"}
                      </Link>
                    </Button>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => toggleSaleMilestone(!step3Done)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors underline decoration-dotted"
                      >
                        {step3Done
                          ? isAr
                            ? "تحديد كغير مكتمل"
                            : "Mark incomplete"
                          : isAr
                            ? "تحديد كمكتمل يدويًا ✓"
                            : "Mark as done ✓"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Dismissed indicator if merchant wants to reopen */}
          {isOnboardingDismissed && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleRestoreOnboarding}
                className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg hover:bg-muted/50"
              >
                <Sparkles className="h-3 w-3 text-primary" />
                {isAr
                  ? `عرض خطوات إطلاق المتجر (${completedStepsCount} من 3)`
                  : `Show launch checklist (${completedStepsCount} of 3)`}
              </button>
            </div>
          )}

          {/* Primary Financial KPIs (Top Row) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {primaryKpis.map((k) => {
              const Icon = k.icon;
              const hasDelta = typeof (k as any).deltaPct === "number";
              const delta = (k as any).deltaPct ?? 0;
              const isPositive = delta >= 0;

              return (
                <Card
                  key={k.label}
                  className={`relative overflow-hidden p-4 transition-all duration-300 hover:shadow-md border border-border rounded-2xl bg-card ${k.border}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground leading-tight line-clamp-2">
                        {k.label}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasDelta ? (
                          <span
                            title={
                              isAr
                                ? "مقارنة بـ 30 يومًا السابقة"
                                : "Compared to previous 30-day period"
                            }
                            className={`inline-flex items-center text-xs font-bold px-1.5 py-0.5 rounded-full border ${
                              isPositive
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400"
                                : "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-400"
                            }`}
                          >
                            {isPositive ? (
                              <ArrowUpRight className="h-3 w-3 me-0.5" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3 me-0.5" />
                            )}
                            {Math.abs(delta).toFixed(1)}%
                          </span>
                        ) : (
                          <span
                            title={
                              isAr
                                ? "لا توجد بيانات للفترة السابقة للمقارنة"
                                : "No prior baseline available for comparison"
                            }
                            className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border border-border bg-muted/40 text-muted-foreground"
                          >
                            {isAr ? "لا توجد مقارنة" : "No baseline"}
                          </span>
                        )}
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-xl bg-background/80 shadow-2xs border border-border-subtle ${k.color}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-baseline">
                      <p className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-foreground tabular-nums truncate">
                        {k.value}
                      </p>
                    </div>
                    <p className="mt-1 text-xs font-medium leading-snug text-muted-foreground line-clamp-1">
                      {k.subValue}
                    </p>
                    {(k as any).breakdown && (
                      <p className="mt-1 text-xs text-muted-foreground font-medium">
                        {(k as any).breakdown}
                      </p>
                    )}
                    {!hasDelta && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {isAr
                          ? "لا توجد بيانات للفترة السابقة للمقارنة"
                          : "No prior period data for comparison"}
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Middle Multi-Column Grid: Sales Trajectory & Action Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
            {canViewFinancials &&
              (!hasSales ? (
                <Card className="min-w-0 overflow-hidden lg:col-span-3 p-6 border border-dashed border-border rounded-2xl bg-card flex flex-col items-center justify-center text-center space-y-3 h-full min-h-[260px]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <div className="max-w-md space-y-1.5">
                    <h3 className="text-base font-bold text-foreground font-heading">
                      {isAr
                        ? "مخطط المبيعات اليومية بانتظار أول طلب"
                        : "Sales Trajectory Awaiting First Order"}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {isAr
                        ? "بمجرد إتمام أول طلب، ستظهر هنا تلقائياً تحليلات المبيعات اليومية، ومنحنى الأرباح، ومعدل نمو متجرك بصورة تفاعلية."
                        : "Once your first order is placed, daily revenue trends, profit curves, and store growth will appear here interactively."}
                    </p>
                  </div>
                </Card>
              ) : (
                <Card className="min-w-0 overflow-hidden lg:col-span-3 p-5 border border-border shadow-xs rounded-2xl bg-card flex flex-col justify-between space-y-3 h-full">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold font-heading flex items-center gap-2">
                        <TrendingUp className="h-4.5 w-4.5 text-emerald-500" />
                        {isAr
                          ? "اتجاه المبيعات اليومية (آخر 30 يومًا)"
                          : "Daily Sales Performance (30 Days)"}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {isAr
                          ? "المبيعات خلال آخر 30 يومًا"
                          : "Daily revenue trajectory and completed volume trends."}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-primary font-mono bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20 w-fit">
                      {formatMoney(financials.revenueCurrent, currency, locale)}
                      {isAr ? " (إجمالي 30 يوم)" : " (30-Day Total)"}
                    </span>
                  </div>

                  <div className="h-56 min-w-0 w-full overflow-hidden pt-1">
                    {isMounted ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={financials.dailyChartSeries}
                          margin={{ top: 15, right: 15, left: -10, bottom: 5 }}
                        >
                          <defs>
                            <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10 }}
                            stroke="#888888"
                            tickLine={false}
                          />
                          <YAxis tick={{ fontSize: 10 }} stroke="#888888" tickLine={false} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="rounded-xl border bg-popover/95 p-2.5 shadow-xl backdrop-blur-md text-xs space-y-1">
                                    <p className="font-bold text-foreground">{data.date}</p>
                                    <p className="text-emerald-500 font-mono font-bold">
                                      {formatMoney(Number(data.sales), currency, locale)}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                      {data.orders} {isAr ? "عمليات بيع" : "sales transactions"}
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="sales"
                            stroke="#10b981"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#salesGrad)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full w-full animate-pulse bg-muted rounded-xl" />
                    )}
                  </div>
                </Card>
              ))}

            {/* Action Needed Feed */}
            <Card
              className={
                canViewFinancials
                  ? "lg:col-span-2 p-5 border border-border shadow-xs rounded-2xl bg-card flex flex-col justify-between space-y-3 h-full"
                  : "lg:col-span-5 p-5 border border-border shadow-xs rounded-2xl bg-card flex flex-col justify-between space-y-3 h-full"
              }
            >
              <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4.5 w-4.5 text-amber-500" />
                  <h3 className="font-bold text-base font-heading text-foreground">
                    {isAr ? "طلبات تتطلب إجراءً" : "Action Needed Feed"}
                  </h3>
                </div>
                <Link
                  to="/admin/b/$slug/orders"
                  params={{ slug }}
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  {isAr ? "إدارة الطلبات ←" : "Triage ←"}
                </Link>
              </div>

              {actionNeededOrders.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground bg-secondary/10 rounded-xl border border-dashed border-border space-y-1 my-auto">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
                  <p className="font-bold text-foreground">
                    {isAr ? "جميع الطلبات محدثة!" : "All orders up to date!"}
                  </p>
                  <p>
                    {isAr
                      ? "لا توجد طلبات تحتاج إلى إجراء فوري حاليًا."
                      : "No urgent pending merchant actions required."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 my-auto">
                  {actionNeededOrders.map((o) => (
                    <div
                      key={o.id}
                      className="p-2.5 bg-background/80 border border-border-subtle rounded-xl flex items-center justify-between gap-3 text-xs hover:border-primary/40 transition-all shadow-2xs"
                    >
                      <div className="min-w-0">
                        <Link
                          to="/admin/b/$slug/orders/$id"
                          params={{ slug, id: o.id }}
                          className="font-bold text-primary hover:underline block truncate"
                        >
                          #{o.invoice_number} —{" "}
                          {getOrderCustomerName(o) || (isAr ? "عميل" : "Customer")}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(o.created_at, locale)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-bold text-foreground">
                          {formatMoney(Number(o.total), o.currency, locale)}
                        </span>
                        <Link
                          to="/admin/b/$slug/orders/$id"
                          params={{ slug, id: o.id }}
                          className="h-6 px-2 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center gap-1 hover:bg-primary/20 transition-colors"
                        >
                          {isAr ? "عرض التفاصيل" : "View Details"}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Lower Feed: Activity Queue & Low Stock Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
            <Card className="lg:col-span-3 p-5 border border-border shadow-xs rounded-2xl bg-card flex flex-col justify-between space-y-3 h-full">
              <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-4.5 w-4.5 text-primary" />
                  <h3 className="font-bold text-base font-heading text-foreground">
                    {t("dashboard.recentOrders")}
                  </h3>
                </div>
                <Link
                  to="/admin/b/$slug/orders"
                  params={{ slug }}
                  className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                >
                  {isAr ? "عرض كل الطلبات ←" : "View All Orders →"}
                </Link>
              </div>

              <DashboardActivityQueue
                lang={isAr ? "ar" : "en"}
                slug={slug}
                orders={recentOrdersQ.data ?? []}
                currency={currency}
                locale={locale}
              />
            </Card>

            <Card className="lg:col-span-2 p-5 border border-border shadow-xs rounded-2xl bg-card flex flex-col justify-between space-y-3 h-full">
              <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <Package className="h-4.5 w-4.5 text-amber-500" />
                  <h3 className="font-bold text-base font-heading text-foreground">
                    {isAr ? "تنبيهات متغيرات المخزون" : "Variant Stock Alerts"}
                  </h3>
                </div>
                <Link
                  to="/admin/b/$slug/inventory"
                  params={{ slug }}
                  className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                >
                  {isAr ? "المخزون ←" : "Inventory →"}
                </Link>
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">
                {isAr
                  ? `${inventoryIntel.lowStockCount} منتجات منخفضة إجمالًا، منها ${inventoryIntel.outOfStockVariantCount} خيارات مقاس أو لون نافدة. قد يبقى المنتج متوفرًا إذا كانت خيارات أخرى منه موجودة.`
                  : `${inventoryIntel.lowStockCount} products are low overall, including ${inventoryIntel.outOfStockVariantCount} sold-out size or color options. A product can remain available when other options have stock.`}
              </p>

              {inventoryIntel.availableWithoutImages.length > 0 && (
                <div className="space-y-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
                    <AlertCircle className="h-4 w-4" />
                    <span>
                      {isAr
                        ? `${inventoryIntel.availableWithoutImages.length} منتجات متوفرة بلا صور`
                        : `${inventoryIntel.availableWithoutImages.length} available products have no images`}
                    </span>
                  </div>
                  {inventoryIntel.availableWithoutImages.slice(0, 3).map((product) => (
                    <Link
                      key={product.id}
                      to="/admin/b/$slug/inventory"
                      params={{ slug }}
                      className="flex items-center justify-between gap-2 rounded-lg bg-background/70 px-2.5 py-2 text-xs hover:bg-background"
                    >
                      <span className="truncate font-semibold">{product.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {product.stock} {isAr ? "متوفر" : "in stock"}
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {inventoryIntel.lowStockVariants.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground bg-secondary/10 rounded-xl border border-dashed border-border space-y-1 my-auto">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
                  <p className="font-bold text-foreground">
                    {isAr ? "جميع المستويات مستقرة" : "Stock Levels Healthy"}
                  </p>
                  <p>
                    {isAr
                      ? "لا توجد بضائع منخفضة أو مشرفة على النفاد."
                      : "All product stock levels are fully replenished."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 my-auto">
                  {inventoryIntel.lowStockVariants.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-semibold text-foreground truncate max-w-[180px]">
                        {item.name}
                      </span>
                      <span className="text-xs shrink-0 font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
                        {item.stock === 0
                          ? isAr
                            ? "نفد"
                            : "Out of stock"
                          : `${item.stock} ${isAr ? "وحدات" : "units"}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Dynamic View 2: Expanded Sales Chart Series ("sales_series") */}
      {activeScope === "sales_series" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <Card className="p-6 border border-border shadow-xs rounded-2xl bg-card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
              <div>
                <h3 className="text-lg font-extrabold flex items-center gap-2 text-foreground">
                  <CalendarDays className="h-5 w-5 text-emerald-500" />
                  {isAr ? "مخطط حركة المبيعات اليومية التفصيلي" : "Daily Sales Trajectory Chart"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? "تحليل نمو المبيعات وإيرادات المتجر اليومية للـ 30 يومًا الماضية"
                    : "Detailed daily revenue breakdown over the last 30 operational days."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                  {isAr ? "الإجمالي: " : "Total: "}
                  {formatMoney(financials.revenueCurrent, currency, locale)}
                </span>
              </div>
            </div>

            <div className="h-80 min-w-0 w-full overflow-hidden pt-2">
              {isMounted ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={financials.dailyChartSeries}
                    margin={{ top: 15, right: 15, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="salesGradExpanded" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#888888" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#888888" />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-xl border bg-popover/95 p-3 shadow-xl backdrop-blur-md text-xs space-y-1">
                              <p className="font-bold text-foreground">{data.date}</p>
                              <p className="text-emerald-500 font-mono font-extrabold text-sm">
                                {formatMoney(Number(data.sales), currency, locale)}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {data.orders} {isAr ? "عمليات بيع" : "sales transactions"}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stroke="#10b981"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#salesGradExpanded)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full w-full animate-pulse bg-muted rounded-xl" />
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Dynamic View 3: Diagnostics View ("diagnostics") */}
      {activeScope === "diagnostics" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Inventory Diagnostics Detailed Panel */}
            <Card className="p-5 border border-border shadow-xs rounded-2xl bg-card space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-amber-500" />
                  <div>
                    <h3 className="font-extrabold text-base text-foreground">
                      {isAr ? "تشخيص المخزون والبضائع" : "Inventory Stock Diagnostics"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "تحديد المنتجات المنخفضة والراكدة"
                        : "Low stock and dead stock alerts"}
                    </p>
                  </div>
                </div>
                <Link
                  to="/admin/b/$slug/inventory"
                  params={{ slug }}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  {isAr ? "إدارة المخزون ←" : "Manage Stock →"}
                </Link>
              </div>

              {inventoryIntel.lowStockVariants.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground bg-emerald-500/10 rounded-xl border border-emerald-500/20 space-y-1">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
                  <p className="font-bold text-foreground text-sm">
                    {isAr ? "جميع المستويات مستقرة!" : "Stock Healthy!"}
                  </p>
                  <p>{isAr ? "لا توجد بضائع منخفضة." : "No low stock items detected."}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {inventoryIntel.lowStockVariants.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-bold text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {isAr ? "مستوى المخزون الحالي" : "Current stock quantity"}
                        </p>
                      </div>
                      <Link
                        to="/admin/b/$slug/inventory"
                        params={{ slug }}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/30 transition-colors"
                      >
                        {item.stock === 0
                          ? isAr
                            ? "نفذ — إكمال المخزون"
                            : "Out of Stock — Reorder"
                          : `${item.stock} ${isAr ? "وحدات المتبقية" : "units remaining"}`}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* CRM Customer Diagnostics Panel */}
            <Card className="p-5 border border-border shadow-xs rounded-2xl bg-card space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-indigo-500" />
                  <div>
                    <h3 className="font-extrabold text-base text-foreground">
                      {isAr ? "تشخيص ورعاية العملاء (CRM)" : "CRM Customer Diagnostics"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "متابعة العملاء المميزين والمعرضين للتسرب"
                        : "VIP retention & churn risk tracking"}
                    </p>
                  </div>
                </div>
                <Link
                  to="/admin/b/$slug/customers"
                  params={{ slug }}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  {isAr ? "سجل العملاء ←" : "Customer List →"}
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-center space-y-1">
                  <p className="text-2xl font-extrabold font-mono text-indigo-600 dark:text-indigo-400">
                    {crmStats.vipCount}
                  </p>
                  <p className="text-xs font-bold text-foreground">
                    {isAr ? "عملاء مميزون (VIP)" : "VIP Customers"}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center space-y-1">
                  <p className="text-2xl font-extrabold font-mono text-rose-600 dark:text-rose-400">
                    {crmStats.churnRiskCount}
                  </p>
                  <p className="text-xs font-bold text-foreground">
                    {isAr ? "معرضون للتسرب" : "At Churn Risk"}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
