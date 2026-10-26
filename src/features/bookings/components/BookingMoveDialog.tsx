import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bookingPoliciesQueries } from "@/lib/data/booking-policies";
import type { Booking } from "@/lib/data/bookings";
import { bookingErrorMessage } from "@/lib/bookings/errors";
import { bookingEnd, startTimes } from "@/lib/bookings/rules";
import {
  dayTitle,
  formatClock,
  formatClockRange,
  formatDuration,
  localTime,
} from "@/lib/bookings/format";
import { bookingMinutes, overbookable, pastMoveTerms } from "@/lib/bookings/move";
import { slotTaken } from "@/features/bookings/lib/booking-actions";
import { bookingInvoiceOf, invoiceLink } from "@/features/bookings/lib/booking-invoice";
import { bookingMovedMessage, customerChatLink } from "@/features/bookings/lib/booking-messages";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

const SELECT_CLASS =
  "h-9 w-full max-w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Moves a booking to another day and start time. It keeps its length (its price
 * was set for it), the database checks the new day still has a place (staff may
 * move it anyway when it has none, as when taking a booking), and the store's
 * terms are shown when the new day is past what they allow. Once moved, the
 * customer can be told on WhatsApp (a person sends it).
 */
export function BookingMoveDialog({
  page,
  booking,
  open,
  onOpenChange,
}: {
  page: BookingsPage;
  booking: Booking;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isAr, brand, rules, today } = page;
  const ids = { day: useId(), start: useId() };
  const timezone = rules.timezone;
  const minutes = bookingMinutes(booking);
  const currentStart = localTime(booking.starts_at, timezone);
  const [day, setDay] = useState(booking.event_date);
  const [start, setStart] = useState(currentStart);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [anyway, setAnyway] = useState(false);
  const [moved, setMoved] = useState(false);
  const policy = useQuery(bookingPoliciesQueries.policy(brand.id)).data;

  const times = Array.from(new Set([...startTimes(rules), currentStart])).sort();
  const end = bookingEnd(start, minutes).time;
  const limit = pastMoveTerms(booking.event_date, day, policy?.reschedule_months);
  // A paid booking whose day was taken may stay where it is, once that time has room again.
  const unchanged = day === booking.event_date && start === currentStart && !slotTaken(booking);
  const canAnyway = refusal !== null && overbookable(refusal);

  const submit = async () => {
    try {
      await page.moveBooking({ booking, day, start, allowOverbook: canAnyway && anyway });
      setMoved(true);
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : String(error));
    }
  };

  const whenLabel = `${dayTitle(day, isAr)} · ${formatClockRange(start, end, isAr)}`;
  const invoice = bookingInvoiceOf(booking);
  const tell = moved
    ? customerChatLink(
        booking.customer_phone,
        bookingMovedMessage({
          isAr,
          brandName: (isAr ? brand.name_ar : null) || brand.name_en || "",
          customerName: booking.customer_name,
          reference: booking.reference,
          dayLabel: dayTitle(day, isAr),
          timeLabel: formatClockRange(start, end, isAr),
          link: invoice ? invoiceLink(window.location.origin, invoice.token) : null,
        }),
      )
    : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !page.movePending && onOpenChange(next)}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isAr ? "نقل الحجز" : "Move the booking"}</DialogTitle>
          <DialogDescription>
            {booking.customer_name ? `${booking.customer_name} · ` : ""}
            <span dir="ltr">{booking.reference}</span>
          </DialogDescription>
        </DialogHeader>

        {moved ? (
          <div className="space-y-3 text-sm">
            <p className="flex items-start gap-2 rounded-lg bg-success-subtle p-3 text-foreground">
              <CalendarCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <span>
                {isAr ? "نُقل الحجز إلى " : "Moved to "}
                {whenLabel}
              </span>
            </p>
            <DialogFooter className="gap-2 sm:gap-2">
              {tell && (
                <Button asChild className="gap-1.5">
                  <a href={tell} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-4" aria-hidden="true" />
                    {isAr ? "أبلغ العميل واتساب" : "Tell the customer on WhatsApp"}
                  </a>
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {isAr ? "تم" : "Done"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor={ids.day}>{isAr ? "التاريخ الجديد" : "New date"}</Label>
                <Input
                  id={ids.day}
                  type="date"
                  dir="ltr"
                  min={today}
                  value={day}
                  onChange={(event) => {
                    setDay(event.target.value);
                    setRefusal(null);
                    setAnyway(false);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={ids.start}>{isAr ? "البداية" : "Start"}</Label>
                <select
                  id={ids.start}
                  className={SELECT_CLASS}
                  value={start}
                  onChange={(event) => {
                    setStart(event.target.value);
                    setRefusal(null);
                    setAnyway(false);
                  }}
                >
                  {times.map((time) => (
                    <option key={time} value={time}>
                      {formatClock(time, isAr)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {isAr ? "المدة كما هي: " : "Same length: "}
              {formatDuration(minutes, isAr)}
              {" · "}
              {whenLabel}
            </p>

            {limit && (
              <p className="rounded-lg border border-warning bg-warning-subtle p-2 text-xs text-foreground">
                {isAr
                  ? `شروطك تسمح بنقل الحجز حتى ${limit}. يمكنك نقله رغم ذلك.`
                  : `Your terms allow moving a booking until ${limit}. You can still move it.`}
              </p>
            )}

            {refusal && (
              <p className="text-xs text-destructive" role="alert">
                {bookingErrorMessage(refusal, isAr)}
              </p>
            )}
            {canAnyway && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-warning bg-warning-subtle p-2 text-xs">
                <Checkbox
                  checked={anyway}
                  onCheckedChange={(checked) => setAnyway(Boolean(checked))}
                  className="mt-0.5"
                />
                <span>
                  {isAr ? "انقله رغم ذلك (قرار المتجر)." : "Move it anyway (the store's call)."}
                </span>
              </label>
            )}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={page.movePending}
              >
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={
                  page.movePending || unchanged || !day || day < today || (canAnyway && !anyway)
                }
              >
                {isAr ? "نقل الحجز" : "Move booking"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
