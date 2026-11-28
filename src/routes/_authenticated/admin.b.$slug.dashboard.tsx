import { launchView } from "@/features/launch/lib/launch-steps";
import { useLaunchChecklist } from "@/features/launch/hooks/use-launch-checklist";
import { LaunchChecklistCard } from "@/features/launch/components/LaunchChecklistCard";
import { OnboardingChecklistLine } from "@/features/dashboard/components/OnboardingChecklistLine";
import { StoreFunnelCard } from "@/features/dashboard/components/StoreFunnelCard";
import { StoreStatusCard } from "@/features/dashboard/components/StoreStatusCard";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { BookingsGlanceCard } from "@/features/bookings/components/BookingsGlanceCard";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";
import { useBrand } from "@/lib/brand-context";
import { useMemo, useState } from "react";
import { useAddons } from "@/components/addons/AddonsProvider";

import { DashboardCommandHeader } from "@/components/dashboard/DashboardCommandHeader";
import { ReviewRequestQueue } from "@/components/dashboard/ReviewRequestQueue";
import { ReviewInsightsSummary } from "@/components/dashboard/ReviewInsightsSummary";
import { useDashboardData } from "@/features/dashboard/hooks/use-dashboard-data";
import { lowStockLevel } from "@/lib/inventory-health";
import {
  inventoryIntelFor,
  ordersNeedingAction,
  ordersToPrepareCount,
  revenueOrders,
  appointmentsToCompleteCount,
} from "@/features/dashboard/lib/dashboard-metrics";
import { isServicesProfile } from "@/lib/store-profile";
import { primaryKpisFor } from "@/features/dashboard/lib/dashboard-kpis";
import {
  dashboardFigures,
  salesCountsSince,
  type SeriesRow,
} from "@/features/dashboard/lib/dashboard-figures";
import { attentionLines, todayFigures } from "@/features/dashboard/lib/dashboard-today";
import { periodSearch, periodWords, readPeriod } from "@/features/dashboard/lib/dashboard-period";
import { PeriodSwitch } from "@/features/dashboard/components/PeriodSwitch";
import { DashboardKpiCards } from "@/features/dashboard/components/DashboardKpiCards";
import { CardPlaceholder } from "@/features/dashboard/components/CardPlaceholder";
import { SalesAndRecentRow } from "@/features/dashboard/components/SalesAndRecentRow";
import { StockAlertsCard } from "@/features/dashboard/components/StockAlertsCard";
import { TodayStrip } from "@/features/dashboard/components/TodayStrip";
import { AttentionList } from "@/features/dashboard/components/AttentionList";
import { OutreachDashboardLine } from "@/features/outreach/components/OutreachDashboardLine";
import { SupplierOrdersDashboardLine } from "@/features/supplier-orders/components/SupplierOrdersDashboardLine";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/dashboard")({
  validateSearch: (search: Record<string, unknown>) => periodSearch(readPeriod(search.days)),
  component: Dashboard,
});

/**
 * The store's dashboard, read top to bottom: today (orders, net sales, what is still to collect),
 * what needs a person in one list, the store's status and the one-line ways in (bookings,
 * clients to message, suppliers, reviews to ask for), then the period chosen (7, 30 or 90 days,
 * the Reports' own figures), the daily chart beside the latest orders, the sizes running out, the visits folded to
 * one line and the launch checklist. Each part draws as its own data arrives.
 */
function Dashboard() {
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
  const days = readPeriod(Route.useSearch().days);
  const navigate = useNavigate({ from: Route.fullPath });
  const period = periodWords(days, isAr ? "ar" : "en");
  const reportingPeriodLabel = period.last;

  const isMounted = typeof window !== "undefined";
  const [checklistOpen, setChecklistOpen] = useState(false);

  // The store's one launch checklist, the same steps and count as Settings' (launch-steps.ts).
  const launch = useLaunchChecklist({
    brandId,
    slug,
    lang: isAr ? "ar" : "en",
    dashboard: true,
  });
  const { isOnboardingDismissed, handleRestoreOnboarding } = launch.milestones;

  const {
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
    periodStart,
  } = useDashboardData({ brandId, slug, canViewFinancials, days });

  // The orders that count as sold, as the Reports overview counts them
  const validRevenueOrders = useMemo(() => revenueOrders(ordersQ.data ?? []), [ordersQ.data]);

  // The orders waiting on the store (the attention list shows the first five)
  const actionNeededOrders = useMemo(
    () => ordersNeedingAction(ordersQ.data ?? [], hasMadeToOrder),
    [ordersQ.data, hasMadeToOrder],
  );

  // The money figures are the Reports' own for the 30 days (null without the finances).
  const figures = useMemo(
    () =>
      canViewFinancials && accountingRow
        ? dashboardFigures({
            row: accountingRow,
            previous: previousAccountingRow,
            series:
              (salesSeriesQ.data as { timeseries?: SeriesRow[] } | undefined)?.timeseries ?? [],
            start: periodStart,
            locale,
            currency,
            days,
          })
        : null,
    [
      canViewFinancials,
      accountingRow,
      previousAccountingRow,
      salesSeriesQ.data,
      periodStart,
      locale,
      currency,
      days,
    ],
  );
  // How many sales the 30 days hold, counted as Reports counts them (anyone may see it).
  const counts = useMemo(
    () =>
      figures
        ? {
            storeOrders: figures.storeOrders,
            partnerSales: figures.partnerSales,
            transactions: figures.transactions,
            deltaPct: figures.transactionsDeltaPct,
          }
        : salesCountsSince(validRevenueOrders, incubatorSalesQ.data ?? [], periodStart, new Date()),
    [figures, validRevenueOrders, incubatorSalesQ.data, periodStart],
  );

  // Stock health from the last 45 days of sales
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

  // Orders waiting to be prepared (the orders page's "to prepare" tab)
  const unfulfilledOrdersCount = useMemo(
    () => ordersToPrepareCount(ordersQ.data ?? [], hasMadeToOrder),
    [ordersQ.data, hasMadeToOrder],
  );

  // Appointments whose time has come (only a store that takes bookings has any).
  const appointmentsToComplete = useMemo(
    () => (storeProfile.modules.bookings ? appointmentsToCompleteCount(ordersQ.data ?? []) : 0),
    [ordersQ.data, storeProfile.modules.bookings],
  );

  // Today: the orders placed, the net sales and what is still to collect on open orders.
  const today = useMemo(
    () =>
      ordersQ.data
        ? todayFigures({
            orders: ordersQ.data,
            dailySeries: canViewFinancials ? (figures?.dailySeries ?? null) : null,
            now: new Date(),
          })
        : null,
    [ordersQ.data, canViewFinancials, figures],
  );

  if (canViewFinancials && reportingOverviewQ.error) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <Card className="border-destructive/30 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto h-9 w-9 text-destructive" />
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
  const totalOrdersCount = orderCountQ.data ?? ordersQ.data?.length ?? 0;
  const hasRealSales =
    totalOrdersCount > 0 || counts.transactions > 0 || validRevenueOrders.length > 0;
  const hasSales = hasRealSales;
  const isServices = isServicesProfile(storeProfile.modules);
  const ordersLoading = ordersQ.isPending;
  const catalogLoading = productsQ.isPending || variantsQ.isPending;

  // The checklist waits for what it counts, so it does not open and fold as the reads arrive.
  const checklist = launch.ready
    ? launchView({
        completed: launch.completed,
        total: launch.total,
        dismissed: isOnboardingDismissed,
      })
    : "hidden";

  const primaryKpis = primaryKpisFor({
    isCatalog,
    isAr,
    catalogInquiries: catalogInquiriesQ.data,
    figures,
    counts,
    canViewFinancials,
    currency,
    locale,
    isServices,
    periodLast: period.last,
  });
  const attention = attentionLines({
    prepare: unfulfilledOrdersCount,
    appointments: appointmentsToComplete,
    returns: pendingReturnsQ.data ?? 0,
    low_stock: storeProfile.modules.stock && !catalogLoading ? inventoryIntel.lowStockCount : 0,
  });
  const brandName = (isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug;

  return (
    <div className="mx-auto max-w-[1500px] space-y-3.5 p-1 sm:p-2">
      <DashboardCommandHeader
        lang={isAr ? "ar" : "en"}
        slug={slug}
        brandName={brandName}
        salesTransactionCount={counts.transactions}
        periodLabel={reportingPeriodLabel}
        isCatalog={isCatalog}
        inquiryCount={catalogInquiriesQ.data?.totalInquiries ?? 0}
        hasIncubators={storeProfile.modules.incubators}
        isServices={isServices}
        actions={
          !isCatalog && (
            <PeriodSwitch
              days={days}
              isAr={isAr}
              onChange={(next) =>
                navigate({ search: periodSearch(next), replace: true, resetScroll: false })
              }
            />
          )
        }
      />

      {/* Today first, then what needs a person: the page once opened on thirty days' figures. */}
      {!isCatalog && (
        <TodayStrip
          today={today}
          loading={ordersLoading || (canViewFinancials && figuresLoading)}
          currency={currency}
          locale={locale}
          isAr={isAr}
          slug={slug}
          isServices={isServices}
        />
      )}

      <AttentionList
        lines={attention}
        orders={actionNeededOrders}
        loading={ordersLoading}
        isAr={isAr}
        slug={slug}
        locale={locale}
      />

      {/* Whether the store takes orders now, and a busy pause in one tap. */}
      <StoreStatusCard brandId={brandId} isAr={isAr} canChange={hasPermission("manage_settings")} />

      {storeProfile.modules.bookings && (
        <BookingsGlanceCard brandId={brandId} slug={slug} isAr={isAr} />
      )}

      {/* Clients worth a message today: one line, the way in to the list. */}
      {hasPermission("manage_customers") && <OutreachDashboardLine slug={slug} isAr={isAr} />}

      {/* A supplier's order late, or money owed to suppliers: one line, the way in. */}
      {canViewFinancials && !isServices && (
        <SupplierOrdersDashboardLine
          brandId={brandId}
          slug={slug}
          currency={currency}
          lang={isAr ? "ar" : "en"}
        />
      )}

      <ReviewRequestQueue brandId={brandId} brandName={brandName} store={brand} isAr={isAr} />

      {/* The period chosen, beside the period before (the Reports' own figures). */}
      {canViewFinancials && figuresLoading && !isCatalog ? (
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((n) => (
            <CardPlaceholder
              key={n}
              label={isAr ? "جارٍ تحميل الأرقام" : "Loading figures"}
              className="min-h-28"
            />
          ))}
        </div>
      ) : (
        <DashboardKpiCards isAr={isAr} primaryKpis={primaryKpis} comparedTo={period.before} />
      )}

      <SalesAndRecentRow
        canViewFinancials={canViewFinancials}
        catalogInquiriesQ={catalogInquiriesQ}
        currency={currency}
        figures={figures}
        figuresLoading={figuresLoading}
        hasSales={hasSales}
        isAr={isAr}
        isCatalog={isCatalog}
        isMounted={isMounted}
        locale={locale}
        periodLast={period.last}
        recentOrdersQ={recentOrdersQ}
        slug={slug}
      />

      {storeProfile.modules.stock && (
        <StockAlertsCard
          inventoryIntel={inventoryIntel}
          loading={catalogLoading || ordersLoading}
          isAr={isAr}
          slug={slug}
        />
      )}

      {/* How many shoppers came and how far they went, one line until opened (not a catalog). */}
      {!isCatalog && (
        <StoreFunnelCard brandId={brandId} isAr={isAr} isServices={isServices} days={days} />
      )}

      {checklist === "line" && !checklistOpen && (
        <OnboardingChecklistLine
          completed={launch.completed}
          total={launch.total}
          isAr={isAr}
          onOpen={() => setChecklistOpen(true)}
        />
      )}
      {(checklist === "full" || (checklist === "line" && checklistOpen)) && (
        <LaunchChecklistCard
          checklist={launch}
          lang={isAr ? "ar" : "en"}
          slug={slug}
          mayOpenSettings={hasPermission("manage_settings")}
        />
      )}

      {isOnboardingDismissed && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleRestoreOnboarding}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-primary"
          >
            <Sparkles className="h-3 w-3 text-primary" />
            {isAr ? "عرض خطوات إطلاق المتجر" : "Show launch checklist"}
          </button>
        </div>
      )}

      {/* What customers say: worth reading, after the figures and the work to do. */}
      <ReviewInsightsSummary brandId={brandId} slug={slug} isAr={isAr} />
    </div>
  );
}
