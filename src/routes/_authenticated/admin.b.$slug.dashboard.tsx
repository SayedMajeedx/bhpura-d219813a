import { checklistView } from "@/features/dashboard/lib/checklist-view";
import { OnboardingChecklistLine } from "@/features/dashboard/components/OnboardingChecklistLine";
import { StoreFunnelCard } from "@/features/dashboard/components/StoreFunnelCard";
import { StoreStatusCard } from "@/features/dashboard/components/StoreStatusCard";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { BookingsGlanceCard } from "@/features/bookings/components/BookingsGlanceCard";
import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Sparkles } from "lucide-react";
import { useI18n, useT } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";
import { useBrand } from "@/lib/brand-context";
import { useMemo, useState } from "react";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { useAddons } from "@/components/addons/AddonsProvider";

import { DashboardCommandHeader } from "@/components/dashboard/DashboardCommandHeader";
import {
  DashboardScopeSwitcher,
  type DashboardViewScope,
} from "@/components/dashboard/DashboardScopeSwitcher";
import { ReviewRequestQueue } from "@/components/dashboard/ReviewRequestQueue";
import { ReviewInsightsSummary } from "@/components/dashboard/ReviewInsightsSummary";
import { DashboardActionStrip } from "@/components/dashboard/DashboardActionStrip";
import { useDashboardData } from "@/features/dashboard/hooks/use-dashboard-data";
import { lowStockLevel } from "@/lib/inventory-health";
import { useOnboardingMilestones } from "@/features/dashboard/hooks/use-onboarding-milestones";
import {
  customerSegments,
  dashboardFinancials,
  inventoryIntelFor,
  ordersNeedingAction,
  ordersToPrepareCount,
  revenueOrders,
  appointmentsToCompleteCount,
} from "@/features/dashboard/lib/dashboard-metrics";
import { isServicesProfile } from "@/lib/store-profile";
import { primaryKpisFor } from "@/features/dashboard/lib/dashboard-kpis";
import { OnboardingChecklist } from "@/features/dashboard/components/OnboardingChecklist";
import { DashboardKpiCards } from "@/features/dashboard/components/DashboardKpiCards";
import { SalesAndActionsRow } from "@/features/dashboard/components/SalesAndActionsRow";
import { ActivityAndStockRow } from "@/features/dashboard/components/ActivityAndStockRow";
import { SalesSeriesView } from "@/features/dashboard/components/SalesSeriesView";
import { DiagnosticsView } from "@/features/dashboard/components/DiagnosticsView";
import { OutreachDashboardLine } from "@/features/outreach/components/OutreachDashboardLine";
import { SupplierOrdersDashboardLine } from "@/features/supplier-orders/components/SupplierOrdersDashboardLine";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { canViewFinancials, hasPermission } = useProfile();
  const { isInstalled } = useAddons();
  const hasMadeToOrder = isInstalled("made-to-order");
  const { slug } = Route.useParams();
  const brand = useBrand();
  const brandId = brand.id;
  const { profile: storeProfile } = useAdminStoreProfile(brandId);
  const locale = lang === "ar" ? "ar-BH-u-nu-latn" : "en-US";
  const reportingPeriodLabel = isAr ? "آخر 30 يومًا" : "the last 30 days";

  const isMounted = typeof window !== "undefined";
  const [activeScope, setActiveScope] = useState<DashboardViewScope>("financials");
  const [checklistOpen, setChecklistOpen] = useState(false);

  const {
    isPreviewed,
    isManualSaleCompleted,
    isOnboardingDismissed,
    handleCopyStoreLink,
    handlePreviewStorefront,
    togglePreviewMilestone,
    toggleSaleMilestone,
    handleDismissOnboarding,
    handleRestoreOnboarding,
  } = useOnboardingMilestones({ brand, brandId, isAr });

  const {
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
  } = useDashboardData({ brandId, slug, canViewFinancials });

  // The orders that count as sold, as the Reports overview counts them
  const validRevenueOrders = useMemo(() => revenueOrders(ordersQ.data ?? []), [ordersQ.data]);

  // Operational Actionable Orders (Orders needing triage/action)
  const actionNeededOrders = useMemo(
    () => ordersNeedingAction(ordersQ.data ?? [], hasMadeToOrder),
    [ordersQ.data, hasMadeToOrder],
  );

  // Financial intelligence aggregations
  const financials = useMemo(
    () =>
      dashboardFinancials({
        validRevenueOrders,
        expenseRows: expensesQ.data ?? [],
        incubatorSaleRows: incubatorSalesQ.data ?? [],
        variantRows: variantsQ.data ?? [],
        productRows: productsQ.data ?? [],
        bomItemRows: bomItemsQ.data ?? [],
        packagingMaterialRows: packagingMaterialsQ.data ?? [],
        settings: businessSettings.data,
        accountingRow,
        previousAccountingRow,
        locale,
        now: new Date(),
      }),
    [
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
    ],
  );

  // CRM segmentation distribution
  const crmStats = useMemo(
    () => customerSegments(validRevenueOrders, customersQ.data ?? [], new Date()),
    [validRevenueOrders, customersQ.data],
  );

  // Inventory velocity & stock depletion calculations
  const lowStockUnits = lowStockLevel(businessSettings.data?.low_stock_threshold);
  const inventoryIntel = useMemo(
    () =>
      inventoryIntelFor({
        productRows: productsQ.data ?? [],
        variantRows: variantsQ.data ?? [],
        validRevenueOrders,
        lang,
        now: new Date(),
        lowStockUnits,
      }),
    [productsQ.data, variantsQ.data, validRevenueOrders, lang, lowStockUnits],
  );

  // Orders awaiting merchant preparation & fulfillment (synchronized with orders page to_prepare tab)
  const unfulfilledOrdersCount = useMemo(
    () => ordersToPrepareCount(ordersQ.data ?? [], hasMadeToOrder),
    [ordersQ.data, hasMadeToOrder],
  );

  // Appointments whose time has come (only a store that takes bookings has any).
  const appointmentsToComplete = useMemo(
    () => (storeProfile.modules.bookings ? appointmentsToCompleteCount(ordersQ.data ?? []) : 0),
    [ordersQ.data, storeProfile.modules.bookings],
  );

  // Loading skeleton placeholder
  if (isLoading) {
    return <RoutePendingSkeleton />;
  }

  if (canViewFinancials && reportingOverviewQ.error) {
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
          <Button type="button" className="mt-5" onClick={() => reportingOverviewQ.refetch()}>
            {isAr ? "إعادة المحاولة" : "Try again"}
          </Button>
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
  const checklist = checklistView({
    completed: completedStepsCount,
    dismissed: isOnboardingDismissed,
  });

  // Primary Financial or Catalog KPIs
  const primaryKpis = primaryKpisFor({
    isCatalog,
    isAr,
    catalogInquiries: catalogInquiriesQ.data,
    financials,
    canViewFinancials,
    currency,
    locale,
    isServices: isServicesProfile(storeProfile.modules),
  });

  return (
    <div className="mx-auto max-w-[1500px] space-y-3.5 p-1 sm:p-2">
      {/* 1. Integrated Command Header */}
      <DashboardCommandHeader
        lang={isAr ? "ar" : "en"}
        slug={slug}
        brandName={(isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug}
        salesTransactionCount={financials.ordersCurrent}
        periodLabel={reportingPeriodLabel}
        isCatalog={isCatalog}
        inquiryCount={catalogInquiriesQ.data?.totalInquiries ?? 0}
        hasIncubators={storeProfile.modules.incubators}
        isServices={isServicesProfile(storeProfile.modules)}
      />

      {/* The figures first, on every view: on a phone they once came after the checklist, a screen down. */}
      <DashboardKpiCards isAr={isAr} primaryKpis={primaryKpis} />

      {/* 1.5 Merchant Action Strip: What Needs Attention Today */}
      <DashboardActionStrip
        slug={slug}
        isAr={isAr}
        unfulfilledOrdersCount={unfulfilledOrdersCount}
        lowStockCount={storeProfile.modules.stock ? inventoryIntel.lowStockCount : 0}
        pendingReturnsCount={pendingReturnsQ.data ?? 0}
        appointmentsToCompleteCount={appointmentsToComplete}
      />

      {/* How many shoppers came and how far they went (not for a catalog: it has no bag). */}
      {!isCatalog && (
        <StoreFunnelCard
          brandId={brandId}
          isAr={isAr}
          isServices={isServicesProfile(storeProfile.modules)}
        />
      )}

      {/* Whether the store takes orders now, and a busy pause in one tap. */}
      <StoreStatusCard brandId={brandId} isAr={isAr} canChange={hasPermission("manage_settings")} />

      {/* Clients worth a message today: one line, the way in to the list. */}
      {hasPermission("manage_customers") && <OutreachDashboardLine slug={slug} isAr={isAr} />}

      {/* A supplier's order late, or money owed to suppliers: one line, the way in. */}
      {canViewFinancials && !isServicesProfile(storeProfile.modules) && (
        <SupplierOrdersDashboardLine
          brandId={brandId}
          slug={slug}
          currency={currency}
          lang={isAr ? "ar" : "en"}
        />
      )}

      {storeProfile.modules.bookings && (
        <BookingsGlanceCard brandId={brandId} slug={slug} isAr={isAr} />
      )}

      <ReviewRequestQueue
        brandId={brandId}
        brandName={(isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug}
        isAr={isAr}
      />

      {/* 2. Scope Switcher Toolbar */}
      <DashboardScopeSwitcher
        lang={isAr ? "ar" : "en"}
        activeScope={activeScope}
        onScopeChange={(scope) => setActiveScope(scope)}
        lowStockCount={inventoryIntel.lowStockCount}
        tracksStock={storeProfile.modules.stock}
      />

      {/* Dynamic View 1: Financial Telemetry (Default / "financials") */}
      {activeScope === "financials" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Guided Onboarding Checklist with Real State & Interactive Completion */}
          {checklist === "line" && !checklistOpen && (
            <OnboardingChecklistLine
              completed={completedStepsCount}
              isAr={isAr}
              onOpen={() => setChecklistOpen(true)}
            />
          )}
          {(checklist === "full" || (checklist === "line" && checklistOpen)) && (
            <OnboardingChecklist
              brand={brand}
              completedStepsCount={completedStepsCount}
              handleCopyStoreLink={handleCopyStoreLink}
              handleDismissOnboarding={handleDismissOnboarding}
              handlePreviewStorefront={handlePreviewStorefront}
              isAllStepsCompleted={isAllStepsCompleted}
              isAr={isAr}
              productsQ={productsQ}
              slug={slug}
              step1Done={step1Done}
              step2Done={step2Done}
              step3Done={step3Done}
              togglePreviewMilestone={togglePreviewMilestone}
              toggleSaleMilestone={toggleSaleMilestone}
              totalOrdersCount={totalOrdersCount}
              takesBookings={storeProfile.modules.bookings}
            />
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

          {/* Middle Multi-Column Grid: Sales Trajectory & Action Feed */}
          <SalesAndActionsRow
            actionNeededOrders={actionNeededOrders}
            canViewFinancials={canViewFinancials}
            catalogInquiriesQ={catalogInquiriesQ}
            currency={currency}
            financials={financials}
            hasSales={hasSales}
            isAr={isAr}
            isCatalog={isCatalog}
            isMounted={isMounted}
            locale={locale}
            slug={slug}
          />

          {/* Lower Feed: Activity Queue & Low Stock Alerts */}
          <ActivityAndStockRow
            currency={currency}
            inventoryIntel={inventoryIntel}
            isAr={isAr}
            locale={locale}
            recentOrdersQ={recentOrdersQ}
            slug={slug}
            t={t}
            tracksStock={storeProfile.modules.stock}
          />
        </div>
      )}

      {/* Dynamic View 2: Expanded Sales Chart Series ("sales_series") */}
      {activeScope === "sales_series" && (
        <SalesSeriesView
          currency={currency}
          financials={financials}
          isAr={isAr}
          isMounted={isMounted}
          locale={locale}
        />
      )}

      {/* Dynamic View 3: Diagnostics View ("diagnostics") */}
      {activeScope === "diagnostics" && (
        <DiagnosticsView
          crmStats={crmStats}
          inventoryIntel={inventoryIntel}
          isAr={isAr}
          slug={slug}
          tracksStock={storeProfile.modules.stock}
        />
      )}

      {/* What customers say: worth reading, after the figures and the work to do. */}
      <ReviewInsightsSummary brandId={brandId} slug={slug} isAr={isAr} />
    </div>
  );
}
