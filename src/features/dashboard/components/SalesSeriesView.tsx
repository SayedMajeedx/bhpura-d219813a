import { Card } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import { formatMoney } from "@/lib/format";

import type { DashboardData } from "@/features/dashboard/hooks/use-dashboard-data";
import type { DashboardFigures } from "@/features/dashboard/lib/dashboard-figures";
import { DailySalesChart } from "@/features/dashboard/components/DailySalesChart";

/** The "sales series" view: the expanded daily sales chart. */
export function SalesSeriesView({
  currency,
  figures,
  isAr,
  isMounted,
  locale,
}: {
  currency: DashboardData["currency"];
  figures: DashboardFigures | null;
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
              {formatMoney(figures?.sales.total ?? 0, currency, locale)}
            </span>
          </div>
        </div>

        <div className="h-80 min-w-0 w-full overflow-hidden pt-2">
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
    </div>
  );
}
