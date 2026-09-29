import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  dayTitle,
  monthTitle,
  weekdayNames,
  type CalendarCell,
} from "@/features/bookings/lib/calendar-view";
import { WEEK_STARTS_ON, type BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

/** What a day's state reads as, for the legend and screen readers. */
export function stateLabel(cell: CalendarCell, isAr: boolean): string {
  switch (cell.state) {
    case "blocked":
      return isAr ? "مغلق للحجز" : "Blocked";
    case "closed":
      return isAr ? "يوم عطلة" : "Closed day";
    case "full":
      return isAr ? "محجوز بالكامل" : "Fully booked";
    default:
      return cell.taken > 0
        ? isAr
          ? `${cell.capacity - cell.taken} متاح من ${cell.capacity}`
          : `${cell.capacity - cell.taken} of ${cell.capacity} free`
        : isAr
          ? "متاح"
          : "Available";
  }
}

/**
 * The month: each day shows whether it is free, partly or fully booked,
 * blocked or a closed weekday, and whether requests wait on it. Choosing a
 * day opens it in the day panel.
 */
export function BookingsCalendar({ page }: { page: BookingsPage }) {
  const { isAr, cursor, weeks, selectedDay, selectDay } = page;
  // In Arabic the calendar reads right to left: "previous" points right.
  const Previous = isAr ? ChevronRight : ChevronLeft;
  const Next = isAr ? ChevronLeft : ChevronRight;

  return (
    <section
      className="rounded-2xl border border-border bg-card p-3 sm:p-4"
      aria-busy={page.loading}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={page.previousMonth}
          aria-label={isAr ? "الشهر السابق" : "Previous month"}
        >
          <Previous className="size-4" />
        </Button>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-base font-bold text-foreground">
            {monthTitle(cursor.year, cursor.month, isAr)}
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={page.thisMonth}
          >
            {isAr ? "اليوم" : "Today"}
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={page.nextMonth}
          aria-label={isAr ? "الشهر التالي" : "Next month"}
        >
          <Next className="size-4" />
        </Button>
      </header>

      <div role="grid" aria-label={monthTitle(cursor.year, cursor.month, isAr)}>
        <div role="row" className="grid grid-cols-7 gap-1 pb-1">
          {weekdayNames(isAr, WEEK_STARTS_ON).map((name) => (
            <div
              key={name}
              role="columnheader"
              className="text-center text-xs font-medium text-muted-foreground"
            >
              {name}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div role="row" key={week[0].day} className="grid grid-cols-7 gap-1 pb-1">
            {week.map((cell) => (
              <DayCell
                key={cell.day}
                cell={cell}
                isAr={isAr}
                selected={cell.day === selectedDay}
                onSelect={() => selectDay(cell.day)}
              />
            ))}
          </div>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-border bg-card" aria-hidden="true" />
          {isAr ? "متاح" : "Available"}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" aria-hidden="true" />
          {isAr ? "محجوز" : "Booked"}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-muted-foreground/40" aria-hidden="true" />
          {isAr ? "مغلق" : "Blocked / closed"}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-warning" aria-hidden="true" />
          {isAr ? "طلبات بانتظار التأكيد" : "Requests waiting"}
        </li>
      </ul>
    </section>
  );
}

function DayCell({
  cell,
  isAr,
  selected,
  onSelect,
}: {
  cell: CalendarCell;
  isAr: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const unavailable = cell.state === "blocked" || cell.state === "closed";
  return (
    <Button
      type="button"
      variant="ghost"
      role="gridcell"
      aria-selected={selected}
      aria-label={`${dayTitle(cell.day, isAr)}: ${stateLabel(cell, isAr)}${
        cell.requests > 0 ? (isAr ? ` · ${cell.requests} طلب` : ` · ${cell.requests} requests`) : ""
      }`}
      onClick={onSelect}
      className={cn(
        "relative flex aspect-square h-auto min-h-11 flex-col items-center justify-center gap-0 rounded-lg border p-0 text-sm font-normal transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !cell.inMonth && "opacity-40",
        cell.isPast && "opacity-60",
        cell.state === "full" && "border-primary bg-primary text-primary-foreground",
        cell.state === "available" &&
          cell.taken > 0 &&
          "border-primary/40 bg-primary/10 text-foreground",
        cell.state === "available" &&
          cell.taken === 0 &&
          "border-border bg-card text-foreground hover:bg-muted",
        unavailable && "border-transparent bg-muted text-muted-foreground line-through",
        selected && "ring-2 ring-ring ring-offset-1 ring-offset-background",
        cell.isToday && "font-bold",
      )}
    >
      <span>{Number(cell.day.slice(8))}</span>
      {cell.state !== "closed" && cell.taken > 0 && (
        <span className="text-xs leading-none opacity-80">
          {cell.taken}/{cell.capacity}
        </span>
      )}
      {cell.requests > 0 && (
        <span className="absolute end-1 top-1 size-2 rounded-full bg-warning" aria-hidden="true" />
      )}
    </Button>
  );
}
