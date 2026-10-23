import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  googleCalendarUrl,
  icsDataUrl,
  icsFileName,
  type CalendarEvent,
} from "@/lib/bookings/add-to-calendar";

/**
 * Puts a booking in the shopper's own calendar: Google Calendar opens with the
 * event filled in, and the file opens in Apple Calendar or Outlook.
 */
export function AddToCalendar({
  event,
  reference,
  isAr,
  className,
}: {
  event: CalendarEvent;
  reference: string;
  isAr: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap justify-center gap-2 ${className ?? ""}`}>
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
          <CalendarPlus className="size-4" aria-hidden="true" />
          {isAr ? "أضف إلى تقويم Google" : "Add to Google Calendar"}
        </a>
      </Button>
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <a href={icsDataUrl(event)} download={icsFileName(reference)}>
          <CalendarPlus className="size-4" aria-hidden="true" />
          {isAr ? "أضف إلى تقويم Apple أو Outlook" : "Add to Apple or Outlook"}
        </a>
      </Button>
    </div>
  );
}
