import { Card } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

import type { primaryKpisFor } from "@/features/dashboard/lib/dashboard-kpis";

/** The headline KPI cards with their change against the previous 30 days. */
export function DashboardKpiCards({
  isAr,
  primaryKpis,
}: {
  isAr: boolean;
  primaryKpis: ReturnType<typeof primaryKpisFor>;
}) {
  return (
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
                        isAr ? "مقارنة بـ 30 يومًا السابقة" : "Compared to previous 30-day period"
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
  );
}
