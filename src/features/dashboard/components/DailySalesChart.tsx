import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/format";
import { countOf } from "@/lib/arabic-count";
import { SALES_WORDS } from "@/lib/report-words";
import type { DashboardFigures } from "@/features/dashboard/lib/dashboard-figures";

/**
 * The thirty days' net sales, day by day, the store's and the partner shops' stacked: the Reports
 * sales page's own series (`dashboardFigures().dailySeries`). Its total is the cards' net sales.
 */
export function DailySalesChart({
  series,
  currency,
  locale,
  isAr,
  isMounted,
  showPartners,
}: {
  series: DashboardFigures["dailySeries"];
  currency: string;
  locale: string;
  isAr: boolean;
  isMounted: boolean;
  showPartners: boolean;
}) {
  const lang = isAr ? "ar" : "en";
  if (!isMounted) return <div className="h-full w-full animate-pulse rounded-xl bg-muted" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          stroke="var(--color-border)"
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          stroke="var(--color-border)"
          tickLine={false}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const day = payload[0].payload as DashboardFigures["dailySeries"][number];
            return (
              <div className="space-y-1 rounded-xl border bg-popover/95 p-2.5 text-xs shadow-xl backdrop-blur-md">
                <p className="font-bold text-foreground">{day.date}</p>
                <p className="font-mono font-bold text-foreground">
                  {formatMoney(day.sales, currency, locale)}
                </p>
                {showPartners && day.partner > 0 && (
                  <p className="text-muted-foreground">
                    {SALES_WORDS.store[lang]}: {formatMoney(day.store, currency, locale)} ·{" "}
                    {SALES_WORDS.partners[lang]}: {formatMoney(day.partner, currency, locale)}
                  </p>
                )}
                <p className="text-muted-foreground">{countOf(day.orders, "sale", lang)}</p>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="store"
          stackId="sales"
          name={SALES_WORDS.store[lang]}
          stroke="var(--color-primary)"
          strokeWidth={2.5}
          fill="var(--color-primary)"
          fillOpacity={0.15}
        />
        {showPartners && (
          <Area
            type="monotone"
            dataKey="partner"
            stackId="sales"
            name={SALES_WORDS.partners[lang]}
            stroke="var(--color-secondary, var(--color-muted-foreground))"
            strokeWidth={2}
            fill="var(--color-secondary, var(--color-muted-foreground))"
            fillOpacity={0.15}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
