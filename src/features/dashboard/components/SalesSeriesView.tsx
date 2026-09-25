import { Card } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { formatMoney } from "@/lib/format";

import type { DashboardData } from "@/features/dashboard/hooks/use-dashboard-data";
import type { DashboardFinancials } from "@/features/dashboard/lib/dashboard-metrics";

/** The "sales series" view: the expanded daily sales chart. */
export function SalesSeriesView({
  currency,
  financials,
  isAr,
  isMounted,
  locale,
}: {
  currency: DashboardData["currency"];
  financials: DashboardFinancials;
  isAr: boolean;
  isMounted: boolean;
  locale: string;
}) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <Card className="p-6 border border-border shadow-xs rounded-2xl bg-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
          <div>
            <h3 className="text-lg font-extrabold flex items-center gap-2 text-foreground">
              <CalendarDays className="h-5 w-5 text-emerald-500" />
              {isAr ? "مخطط حركة المبيعات اليومية" : "Daily Sales Trajectory Chart"}
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
  );
}
