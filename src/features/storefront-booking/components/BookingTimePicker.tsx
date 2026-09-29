import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bookingEnd, startTimes } from "@/lib/bookings/rules";
import { formatClock, formatDuration } from "@/lib/bookings/format";
import type { BookingFlow } from "@/features/storefront-booking/hooks/use-booking-flow";

function Chip({
  selected,
  onClick,
  children,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full px-3 text-xs font-medium",
        selected && "border-primary bg-primary text-primary-foreground hover:bg-primary",
      )}
    >
      {children}
    </Button>
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
        <div className="flex flex-wrap gap-2" dir="ltr">
          {startTimes(rules).map((time) => (
            <Chip key={time} selected={start === time} onClick={() => flow.update({ start: time })}>
              {formatClock(time, isAr)}
            </Chip>
          ))}
        </div>
      </div>
      {end && (
        <p className="text-sm text-muted-foreground" role="status">
          {isAr ? "حتى " : "Until "}
          <span dir="ltr" className="font-semibold text-foreground">
            {formatClock(end.time, isAr)}
          </span>
          {end.nextDay && (isAr ? " (اليوم التالي)" : " (next day)")}
        </p>
      )}
    </div>
  );
}
