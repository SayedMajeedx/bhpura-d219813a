import { useState } from "react";
import { Ban, CalendarPlus, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dayTitle } from "@/lib/bookings/format";
import { BookingCard } from "@/features/bookings/components/BookingCard";
import { NewBookingDialog } from "@/features/bookings/components/NewBookingDialog";
import { stateLabel } from "@/features/bookings/components/BookingsCalendar";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

/**
 * The chosen day: its bookings and requests, and what staff can do with it
 * (take a booking, block the day or a run of days, reopen a blocked day).
 */
export function BookingDayPanel({ page }: { page: BookingsPage }) {
  const { isAr, selectedDay, selectedCell, dayBookings, dayBlocks } = page;
  const [newOpen, setNewOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blockUntil, setBlockUntil] = useState(selectedDay);
  const [reason, setReason] = useState("");

  const active = dayBookings.filter((booking) => booking.status !== "expired");

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
      <header className="space-y-1">
        <h2 className="font-display text-base font-bold text-foreground">
          {dayTitle(selectedDay, isAr)}
        </h2>
        {selectedCell && (
          <p className="text-xs text-muted-foreground">{stateLabel(selectedCell, isAr)}</p>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          onClick={() => setNewOpen(true)}
          disabled={!page.configured}
        >
          <CalendarPlus className="size-4" />
          {isAr ? "حجز جديد" : "New booking"}
        </Button>
        {dayBlocks.length === 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setBlockUntil(selectedDay);
              setBlocking((open) => !open);
            }}
          >
            <Ban className="size-4" />
            {isAr ? "إغلاق للحجز" : "Block"}
          </Button>
        ) : (
          dayBlocks.map((block) => (
            <Button
              key={block.id}
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={page.unblockPending}
              onClick={() => page.unblock(block.id)}
            >
              <LockOpen className="size-4" />
              {block.starts_on === block.ends_on
                ? isAr
                  ? "فتح اليوم للحجز"
                  : "Reopen day"
                : isAr
                  ? `فتح ${block.starts_on} – ${block.ends_on}`
                  : `Reopen ${block.starts_on} – ${block.ends_on}`}
            </Button>
          ))
        )}
      </div>

      {dayBlocks.map(
        (block) =>
          block.reason && (
            <p key={block.id} className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">
              {block.reason}
            </p>
          ),
      )}

      {blocking && (
        <form
          className="space-y-2 rounded-lg border border-border p-2"
          onSubmit={(event) => {
            event.preventDefault();
            page.blockDays(
              { starts_on: selectedDay, ends_on: blockUntil, reason },
              { onSuccess: () => setBlocking(false) },
            );
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="block-until" className="text-xs">
                {isAr ? "حتى تاريخ" : "Until"}
              </Label>
              <Input
                id="block-until"
                type="date"
                dir="ltr"
                min={selectedDay}
                value={blockUntil}
                onChange={(event) => setBlockUntil(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="block-reason" className="text-xs">
                {isAr ? "السبب (اختياري)" : "Reason (optional)"}
              </Label>
              <Input
                id="block-reason"
                maxLength={200}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </div>
          {active.some((booking) => booking.status === "confirmed") && (
            <p className="text-xs text-warning">
              {isAr
                ? "في هذا اليوم حجوزات مؤكدة؛ الإغلاق لا يلغيها."
                : "This day has confirmed bookings; blocking does not cancel them."}
            </p>
          )}
          <Button type="submit" size="sm" disabled={page.blockPending || blockUntil < selectedDay}>
            {isAr ? "تأكيد الإغلاق" : "Block days"}
          </Button>
        </form>
      )}

      {active.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          {isAr ? "لا توجد حجوزات في هذا اليوم." : "No bookings on this day."}
        </p>
      ) : (
        <div className="space-y-2">
          {active.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              isAr={isAr}
              currency={page.currency}
              timezone={page.rules.timezone}
              busy={page.statusPending}
              onStatus={(status) => page.setStatus({ booking, status })}
            />
          ))}
        </div>
      )}

      {newOpen && <NewBookingDialog page={page} open={newOpen} onOpenChange={setNewOpen} />}
    </section>
  );
}
