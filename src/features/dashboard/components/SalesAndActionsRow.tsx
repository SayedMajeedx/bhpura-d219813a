import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { TrendingUp, AlertCircle, CheckCircle2, MessageCircle } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { formatDate, formatMoney } from "@/lib/format";
import { getOrderCustomerName } from "@/lib/order-customer-snapshot";

import type { DashboardData } from "@/features/dashboard/hooks/use-dashboard-data";
import type {
  DashboardFinancials,
  ordersNeedingAction,
} from "@/features/dashboard/lib/dashboard-metrics";

/** The 30-day sales trajectory and the orders that need action. */
export function SalesAndActionsRow({
  actionNeededOrders,
  canViewFinancials,
  catalogInquiriesQ,
  currency,
  financials,
  hasSales,
  isAr,
  isCatalog,
  isMounted,
  locale,
  slug,
}: {
  actionNeededOrders: ReturnType<typeof ordersNeedingAction>;
  canViewFinancials: boolean;
  catalogInquiriesQ: DashboardData["catalogInquiriesQ"];
  currency: DashboardData["currency"];
  financials: DashboardFinancials;
  hasSales: boolean;
  isAr: boolean;
  isCatalog: DashboardData["isCatalog"];
  isMounted: boolean;
  locale: string;
  slug: string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
      {isCatalog ? (
        <Card className="min-w-0 overflow-hidden lg:col-span-3 p-5 border border-border shadow-xs rounded-2xl bg-card flex flex-col justify-between space-y-4 h-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border-subtle">
            <div>
              <h3 className="text-base font-bold font-heading flex items-center gap-2">
                <MessageCircle className="h-4.5 w-4.5 text-emerald-500" />
                {isAr ? "أكثر المنتجات طلباً عبر واتساب" : "Top Inquired Products (WhatsApp)"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "المنتجات التي أبدى العملاء اهتماماً بها واستفسروا عنها خلال آخر 30 يوماً"
                  : "Products with the highest customer inquiry volume over the last 30 days"}
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 w-fit">
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
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300/40">
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
                      strokeWidth={2.5}
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
        ))
      )}

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
                    #{o.invoice_number} — {getOrderCustomerName(o) || (isAr ? "عميل" : "Customer")}
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
  );
}
