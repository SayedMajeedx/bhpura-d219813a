import { TabsPill } from "@/components/motion/TabsPill";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_PERIODS,
  periodWords,
  type DashboardPeriod,
} from "@/features/dashboard/lib/dashboard-period";

/**
 * The dashboard's period in one tap: 7, 30 or 90 days. Today's strip and the attention list do
 * not change with it; the cards, the chart, the sales counted and the visits do.
 */
export function PeriodSwitch({
  days,
  onChange,
  isAr,
}: {
  days: DashboardPeriod;
  onChange: (days: DashboardPeriod) => void;
  isAr: boolean;
}) {
  const lang = isAr ? "ar" : "en";
  return (
    <div
      role="radiogroup"
      aria-label={isAr ? "فترة الأرقام" : "Period of the figures"}
      className="t-tabs relative inline-flex gap-1 rounded-xl border border-border-subtle bg-muted/40 p-1"
    >
      <TabsPill />
      {DASHBOARD_PERIODS.map((option) => {
        const active = option === days;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            data-active={active ? "true" : "false"}
            aria-label={periodWords(option, lang).last}
            onClick={() => onChange(option)}
            className={cn(
              "t-tab h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors duration-(--motion-quick) pointer-coarse:min-h-11",
              active
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {periodWords(option, lang).span}
          </button>
        );
      })}
    </div>
  );
}
