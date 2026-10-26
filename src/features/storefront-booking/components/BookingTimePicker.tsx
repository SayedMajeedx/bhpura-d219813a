import { useState, type ReactNode } from "react";
import { Moon, Sun, Sunrise } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { bookingEnd, startTimes } from "@/lib/bookings/rules";
import { formatClock, formatDuration } from "@/lib/bookings/format";
import {
  periodOf,
  periodsOf,
  type DayPeriodId,
} from "@/features/storefront-booking/lib/time-periods";
import type { BookingFlow } from "@/features/storefront-booking/hooks/use-booking-flow";
import {
  blockedReasonText,
  startBlockedReason,
} from "@/features/storefront-booking/lib/service-availability";

function Chip({
  selected,
  onClick,
  children,
  label,
  disabled = false,
  title,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full px-3 text-xs font-medium",
        selected && "border-primary bg-primary text-primary-foreground hover:bg-primary",
        disabled && "line-through",
      )}
    >
      {children}
    </Button>
  );
}

const PERIOD_ICONS = { morning: Sunrise, noon: Sun, evening: Moon } as const;

/**
 * The start time in two taps: a part of the day (morning, afternoon, evening), then a time from the
 * list that opens under it. A part with no free time is greyed out; the chosen time shows on its part.
 */
function PeriodPicker({ flow, times }: { flow: BookingFlow; times: string[] }) {
  const { isAr } = flow;
  const { start } = flow.flow;
  const [openId, setOpenId] = useState<DayPeriodId | null>(null);
  const periods = periodsOf(times);
  const isTaken = (time: string) => flow.freeStarts !== null && !flow.freeStarts.has(time);

  return (
    <div
      className="grid grid-cols-3 gap-2"
      role="group"
      aria-label={isAr ? "وقت البداية" : "Start time"}
    >
      {periods.map((period) => {
        const free = period.times.filter((time) => !isTaken(time));
        const chosen = start && periodOf(start) === period.id ? start : null;
        const Icon = PERIOD_ICONS[period.id];
        return (
          <Popover
            key={period.id}
            open={openId === period.id}
            onOpenChange={(open) => setOpenId(open ? period.id : null)}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={free.length === 0}
                aria-label={`${isAr ? period.ar : period.en}${chosen ? `: ${formatClock(chosen, isAr)}` : ""}`}
                className={cn(
                  "h-auto min-h-16 flex-col gap-0.5 rounded-xl px-2 py-2.5",
                  chosen && "border-primary bg-primary/10 text-foreground",
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Icon className="size-4 text-primary" aria-hidden="true" />
                  {isAr ? period.ar : period.en}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {chosen
                    ? formatClock(chosen, isAr)
                    : free.length === 0
                      ? isAr
                        ? "غير متاح"
                        : "Unavailable"
                      : `${formatClock(free[0], isAr)} – ${formatClock(free[free.length - 1], isAr)}`}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="center" className="w-64 p-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                {isAr ? period.ar : period.en}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {period.times.map((time) => {
                  const taken = isTaken(time);
                  return (
                    <Button
                      key={time}
                      type="button"
                      size="sm"
                      variant={start === time ? "default" : "outline"}
                      disabled={taken}
                      aria-pressed={start === time}
                      title={
                        taken
                          ? blockedReasonText(startBlockedReason(flow.startRows, time), isAr)
                          : undefined
                      }
                      className={cn("h-10 px-1 text-xs", taken && "line-through")}
                      onClick={() => {
                        flow.update({ start: time });
                        setOpenId(null);
                      }}
                    >
                      {formatClock(time, isAr)}
                    </Button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}

/** Step 3: how long, and from when; the end time follows. */
export function BookingTimePicker({ flow }: { flow: BookingFlow }) {
  const { isAr, rules } = flow;
  if (!rules) return null;
  const { durationMinutes, start } = flow.flow;
  const end = start && durationMinutes ? bookingEnd(start, durationMinutes) : null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {isAr ? "كم المدة التي تحتاجها؟" : "How long do you need?"}
        </p>
        <div className="flex flex-wrap gap-2">
          {flow.lengths.map((minutes) => (
            <Chip
              key={minutes}
              selected={durationMinutes === minutes}
              onClick={() => flow.update({ durationMinutes: minutes })}
            >
              {formatDuration(minutes, isAr)}
            </Chip>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {isAr ? "متى تريد البداية؟" : "When should it start?"}
        </p>
        <PeriodPicker flow={flow} times={startTimes(rules)} />
        {flow.freeStarts !== null && flow.freeStarts.size === 0 && (
          <p className="text-sm font-medium text-destructive" role="status">
            {isAr
              ? "لا يوجد وقت متاح لهذه المدة في هذا اليوم. جرّب مدة أقصر أو يوماً آخر."
              : "No time is free for this length on this day. Try a shorter length or another day."}
          </p>
        )}
      </div>
      {end && (
        <p className="text-sm text-muted-foreground" role="status">
          {isAr ? "حتى " : "Until "}
          <span dir={isAr ? "rtl" : "ltr"} className="font-semibold text-foreground">
            {formatClock(end.time, isAr)}
          </span>
          {end.nextDay && (isAr ? " (اليوم التالي)" : " (next day)")}
        </p>
      )}
    </div>
  );
}
