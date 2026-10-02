import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { monthGrid, type DayState } from "@/lib/bookings/rules";
import { dayTitle, monthTitle, weekdayNames } from "@/lib/bookings/format";
import { offerBadgeText } from "@/lib/bookings/discounts";
import {
  BOOKING_WEEK_STARTS_ON,
  type BookingFlow,
} from "@/features/storefront-booking/hooks/use-booking-flow";

function unavailableText(state: DayState | undefined, isAr: boolean): string {
  switch (state) {
    case "full":
      return isAr ? "محجوز" : "Booked";
    case "blocked":
    case "closed":
      return isAr ? "غير متاح" : "Unavailable";
    case "available":
      return isAr ? "متاح" : "Available";
    default:
      return isAr ? "غير متاح للحجز" : "Not open for booking";
  }
}

/** Step 1: the month, with booked and closed days struck through. */
export function BookingDayPicker({ flow }: { flow: BookingFlow }) {
  const { isAr, cursor, dayStates } = flow;
  const Previous = isAr ? ChevronRight : ChevronLeft;
  const Next = isAr ? ChevronLeft : ChevronRight;
  const weeks = monthGrid(cursor.year, cursor.month, BOOKING_WEEK_STARTS_ON);
  const thisMonth = flow.today.slice(0, 7);
  const shownMonth = `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;

  return (
    <div aria-busy={flow.availabilityLoading}>
      <div className="mb-3 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={flow.previousMonth}
          disabled={shownMonth <= thisMonth}
          aria-label={isAr ? "الشهر السابق" : "Previous month"}
        >
          <Previous className="size-4" />
        </Button>
        <p className="font-display text-base font-semibold text-foreground">
          {monthTitle(cursor.year, cursor.month, isAr)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={flow.nextMonth}
          aria-label={isAr ? "الشهر التالي" : "Next month"}
        >
          <Next className="size-4" />
        </Button>
      </div>
      <div
        role="grid"
        aria-label={monthTitle(cursor.year, cursor.month, isAr)}
        className="space-y-1"
      >
        <div role="row" className="grid grid-cols-7 gap-1">
          {weekdayNames(isAr, BOOKING_WEEK_STARTS_ON).map((name) => (
            <span
              key={name}
              role="columnheader"
              className="text-center text-xs font-medium text-muted-foreground"
            >
              {name}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div role="row" key={week[0].day} className="grid grid-cols-7 gap-1">
            {week.map(({ day, inMonth }) => {
              if (!inMonth) return <span key={day} role="gridcell" aria-hidden="true" />;
              const state = dayStates.get(day);
              const available = state === "available";
              const selected = flow.flow.day === day;
              const offer = available ? flow.offerOnDay(day) : null;
              return (
                <Button
                  key={day}
                  type="button"
                  variant="ghost"
                  role="gridcell"
                  aria-selected={selected}
                  aria-label={`${dayTitle(day, isAr)}: ${unavailableText(state, isAr)}${offer ? ` · ${offerBadgeText(offer.rule)}` : ""}`}
                  disabled={!available}
                  onClick={() => flow.update({ day, start: null })}
                  className={cn(
                    "aspect-square h-auto min-h-11 rounded-lg p-0 text-sm font-normal",
                    available && "text-foreground hover:bg-primary/10",
                    !available && "text-muted-foreground line-through opacity-40",
                    state === "full" && "opacity-60",
                    selected && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                  )}
                >
                  <span className="flex flex-col items-center leading-none">
                    {Number(day.slice(8))}
                    {offer && (
                      <span
                        className={cn(
                          "mt-0.5 text-xs font-semibold",
                          selected ? "text-primary-foreground" : "text-success",
                        )}
                        dir="ltr"
                      >
                        {offerBadgeText(offer.rule)}
                      </span>
                    )}
                  </span>
                </Button>
              );
            })}
          </div>
        ))}
      </div>
      {flow.offersLegendText && (
        <p className="mt-2 text-xs font-semibold text-success">{flow.offersLegendText}</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {isAr
          ? "الأيام المشطوبة محجوزة أو غير متاحة."
          : "Struck-through days are booked or unavailable."}
      </p>
    </div>
  );
}
