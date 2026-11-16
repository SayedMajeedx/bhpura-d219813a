import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { MessageCircle, ReceiptText, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { DashboardActivityQueue } from "@/components/dashboard/DashboardActivityQueue";

import type { DashboardData } from "@/features/dashboard/hooks/use-dashboard-data";
import type { DashboardFigures } from "@/features/dashboard/lib/dashboard-figures";
import { DailySalesChart } from "@/features/dashboard/components/DailySalesChart";

/**
 * The period's sales day by day (a catalog store: its most asked-about products) beside the
 * latest orders. The orders that need action are in the attention list at the top.
 */
export function SalesAndRecentRow({
  canViewFinancials,
  catalogInquiriesQ,
  currency,
  figures,
  figuresLoading,
  hasSales,
  isAr,
  isCatalog,
  isMounted,
  locale,
  periodLast,
  recentOrdersQ,
  slug,
}: {
  canViewFinancials: boolean;
  catalogInquiriesQ: DashboardData["catalogInquiriesQ"];
  currency: DashboardData["currency"];
  /** The Reports' figures for the 30 days; null for staff who may not see the finances. */
  figures: DashboardFigures | null;
  /** The Reports' figures are still on their way: the chart's place waits for them. */
  figuresLoading: boolean;
  hasSales: boolean;
  isAr: boolean;
  isCatalog: DashboardData["isCatalog"];
  isMounted: boolean;
  locale: string;
  /** The period in words (`periodWords(...).last`). */
  periodLast: string;
  recentOrdersQ: DashboardData["recentOrdersQ"];
  slug: string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
      {isCatalog ? (
        <Card className="min-w-0 overflow-hidden lg:col-span-3 p-5 border border-border shadow-xs rounded-2xl bg-card flex flex-col justify-between space-y-4 h-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border-subtle">
            <div>
              <h3 className="text-base font-bold font-heading flex items-center gap-2">
                <MessageCircle className="h-4.5 w-4.5 text-success" />
                {isAr ? "أكثر المنتجات طلباً عبر واتساب" : "Top Inquired Products (WhatsApp)"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? `المنتجات التي أبدى العملاء اهتماماً بها واستفسروا عنها خلال ${periodLast}`
                  : `Products with the most customer inquiries over ${periodLast}`}
              </p>
            </div>
            <span className="text-xs font-bold text-success bg-success/10 px-2.5 py-1 rounded-full border border-success/20 w-fit">
              {catalogInquiriesQ.data?.totalInquiries ?? 0}{" "}
              {isAr ? "استفسار إجمالي" : "Total Inquiries"}
            </span>
          </div>

          {(catalogInquiriesQ.data?.productInquiries?.length ?? 0) === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground bg-secondary/10 rounded-xl border border-dashed border-border space-y-2 my-auto">
              <MessageCircle className="h-8 w-8 text-muted-foreground opacity-50 mx-auto" />
              <p className="font-bold text-foreground text-sm">
                {isAr ? "بانتظار استفسارات العملاء الأولى" : "Awaiting First Customer Inquiries"}
              </p>
              <p className="max-w-md mx-auto text-xs text-muted-foreground">
                {isAr
                  ? "عندما يضغط العملاء على زر التواصل عبر واتساب في صفحات المنتجات، ستظهر هنا إحصائيات المنتجات الأكثر طلباً تلقائياً."
                  : "When shoppers click WhatsApp inquiry on your product pages, the most popular items will appear here automatically."}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 my-auto">
              {catalogInquiriesQ.data?.productInquiries.slice(0, 5).map((p, idx) => (
                <div
                  key={p.productId}
                  className="p-3 bg-background/80 border border-border-subtle rounded-xl flex items-center justify-between gap-3 text-xs hover:border-primary/40 transition-all shadow-2xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <Link
                        to="/admin/b/$slug/inventory"
                        params={{ slug }}
                        className="font-bold text-foreground hover:text-primary truncate block text-sm"
                      >
                        {p.productName || (isAr ? "منتج بدون اسم" : "Unnamed Product")}
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {p.views} {isAr ? "مشاهدة" : "views"} • {p.clicks}{" "}
                        {isAr ? "نقرة" : "clicks"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/30">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {p.inquiries} {isAr ? "استفسار" : "inquiries"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        canViewFinancials &&
        (figuresLoading ? (
          <div
            role="status"
            aria-label={isAr ? "جارٍ تحميل المبيعات" : "Loading sales"}
            className="min-w-0 space-y-3 rounded-2xl border border-border bg-card p-5 lg:col-span-3"
          >
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : !hasSales ? (
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
                  <TrendingUp className="h-4.5 w-4.5 text-success" />
                  {isAr
                    ? `صافي المبيعات يومًا بيوم (${periodLast})`
                    : `Net sales day by day (${periodLast})`}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? "صافي المبيعات يومًا بيوم، المتجر والمحلات الشريكة"
                    : "Net sales day by day, the store's and the partner shops'"}
                </p>
              </div>
              <span className="text-xs font-bold text-primary font-mono bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20 w-fit">
                {formatMoney(figures?.sales.total ?? 0, currency, locale)}
                {isAr ? " · صافي الفترة" : " · net, the period"}
              </span>
            </div>

            <div className="h-56 min-w-0 w-full overflow-hidden pt-1">
              <DailySalesChart
                series={figures?.dailySeries ?? []}
                currency={currency}
                locale={locale}
                isAr={isAr}
                isMounted={isMounted}
                showPartners={(figures?.sales.partners ?? 0) > 0}
              />
            </div>
          </Card>
        ))
      )}

      {/* The latest orders, beside the chart. */}
      <Card
        className={`${canViewFinancials || isCatalog ? "lg:col-span-2" : "lg:col-span-5"} flex h-full flex-col space-y-3 rounded-2xl border border-border bg-card p-5 shadow-xs`}
      >
        <div className="flex items-center justify-between border-b border-border-subtle pb-2">
          <h3 className="flex items-center gap-2 font-heading text-base font-bold text-foreground">
            <ReceiptText className="h-4.5 w-4.5 text-primary" aria-hidden />
            {isAr ? "أحدث الطلبات" : "Latest orders"}
          </h3>
          <Link
            to="/admin/b/$slug/orders"
            params={{ slug }}
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            {isAr ? "كل الطلبات" : "All orders"}
          </Link>
        </div>
        {recentOrdersQ.isPending ? (
          <div
            role="status"
            aria-label={isAr ? "جارٍ تحميل الطلبات" : "Loading orders"}
            className="space-y-2"
          >
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <DashboardActivityQueue
            lang={isAr ? "ar" : "en"}
            slug={slug}
            orders={recentOrdersQ.data ?? []}
            currency={currency}
            locale={locale}
          />
        )}
      </Card>
    </div>
  );
}
