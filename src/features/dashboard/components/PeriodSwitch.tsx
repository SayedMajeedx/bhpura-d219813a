import { SegmentTab } from "@/components/ui/segment-tab";
import { TabsPill } from "@/components/motion/TabsPill";
import { SEGMENT_TRACK } from "@/components/ui/segmented";
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
      className={SEGMENT_TRACK}
    >
      <TabsPill />
      {DASHBOARD_PERIODS.map((option) => {
        const active = option === days;
        return (
          <SegmentTab
            active={active}
            key={option}
            role="radio"
            aria-checked={active}
            data-active={active ? "true" : "false"}
            aria-label={periodWords(option, lang).last}
            onClick={() => onChange(option)}
            className="min-h-8 px-2.5"
          >
            {periodWords(option, lang).span}
          </SegmentTab>
        );
      })}
    </div>
  );
}
