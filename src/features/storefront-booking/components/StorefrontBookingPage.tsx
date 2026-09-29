import type { ReactNode } from "react";
import { CalendarCheck, CheckCircle2, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/storefront-context";
import { bookingEnd } from "@/lib/bookings/rules";
import { dayTitle, formatClock } from "@/lib/bookings/format";
import {
  bookingWhatsAppText,
  chosenTotal,
  serviceName,
  whatsAppLink,
  type FlowStep,
} from "@/features/storefront-booking/lib/booking-flow";
import {
  useBookingFlow,
  type BookingFlow,
} from "@/features/storefront-booking/hooks/use-booking-flow";
import { BookingDayPicker } from "@/features/storefront-booking/components/BookingDayPicker";
import { BookingServicePicker } from "@/features/storefront-booking/components/BookingServicePicker";
import { BookingTimePicker } from "@/features/storefront-booking/components/BookingTimePicker";
import { BookingDetailsFields } from "@/features/storefront-booking/components/BookingDetailsFields";

const STEPS: Array<{ id: FlowStep; ar: string; en: string }> = [
  { id: "date", ar: "التاريخ", en: "Date" },
  { id: "services", ar: "الخدمات", en: "Services" },
  { id: "time", ar: "الوقت", en: "Time" },
  { id: "details", ar: "التفاصيل", en: "Details" },
];

function Step({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold text-foreground">
        <span
          className={cn(
            "grid size-7 place-items-center rounded-full text-sm",
            done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
          aria-hidden="true"
        >
          {done ? <CheckCircle2 className="size-4" /> : index}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The time range the customer chose, "6:00 PM – 10:00 PM". */
function timeRange(flow: BookingFlow): string {
  const { start, durationMinutes } = flow.flow;
  if (!start || !durationMinutes) return "";
  return `${formatClock(start, flow.isAr)} – ${formatClock(bookingEnd(start, durationMinutes).time, flow.isAr)}`;
}

/**
 * Booking a service from the storefront, in four steps like a booking site:
 * a free date, the services, the time, the details. It sends a booking
 * request; the customer then confirms it with the store on WhatsApp.
 */
export function StorefrontBookingPage({ initialService }: { initialService?: string }) {
  const flow = useBookingFlow(initialService);
  const { isAr, currency, showPrices } = flow;
  const lang = isAr ? "ar" : "en";

  if (flow.loading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!flow.rules) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl">{isAr ? "الحجز غير متاح" : "Booking isn't open"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAr
            ? "هذا المتجر لا يستقبل حجوزات عبر الموقع حالياً."
            : "This store isn't taking bookings online right now."}
        </p>
      </main>
    );
  }

  const chosen = flow.services.filter((service) => flow.flow.services.includes(service.id));
  const total = chosenTotal(flow.flow.services, flow.services);
  const stepIndex = flow.step ? STEPS.findIndex((step) => step.id === flow.step) : STEPS.length;
  const done = (id: FlowStep) => STEPS.findIndex((step) => step.id === id) < stepIndex;

  if (flow.result) {
    const place = [flow.flow.area, flow.flow.venue.trim()].filter(Boolean).join("، ");
    const text = bookingWhatsAppText({
      isAr,
      brandName: (isAr ? flow.brand.name_ar : null) || flow.brand.name_en,
      reference: flow.result.reference,
      dayLabel: dayTitle(flow.result.event_date, isAr),
      timeLabel: timeRange(flow),
      services: chosen.map((service) => serviceName(service, isAr)),
      place,
      name: flow.flow.name.trim(),
      totalLabel: showPrices ? formatPrice(Number(flow.result.total), currency, lang) : null,
    });
    const link = whatsAppLink(flow.settings.whatsapp_number, text);
    return (
      <main className="mx-auto max-w-xl space-y-4 px-4 py-12 text-center">
        <CalendarCheck className="mx-auto size-12 text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl text-foreground">
          {isAr ? "تم إرسال طلب الحجز" : "Your booking request is in"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "يُثبَّت موعدك بعد تأكيد المتجر. أرسل الطلب على واتساب ليصلهم فوراً."
            : "Your date is held once the store confirms. Send it on WhatsApp so they see it now."}
        </p>
        <p className="rounded-xl bg-muted p-3 text-sm">
          {isAr ? "رقم الطلب: " : "Request: "}
          <span className="font-semibold" dir="ltr">
            {flow.result.reference}
          </span>
        </p>
        {link && (
          <Button asChild size="lg" className="w-full gap-2">
            <a href={link} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-5" />
              {isAr ? "أكمل الحجز عبر واتساب" : "Confirm on WhatsApp"}
            </a>
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={flow.startOver}>
          {isAr ? "حجز آخر" : "Make another booking"}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8 sm:py-12">
      <header className="space-y-1 text-center">
        <h1 className="font-display text-3xl text-foreground">
          {isAr ? "احجز موعدك" : "Book your date"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr ? "أربع خطوات بسيطة، والباقي علينا." : "Four simple steps; we'll handle the rest."}
        </p>
      </header>

      <Step index={1} title={STEPS[0][lang]} done={done("date")}>
        <BookingDayPicker flow={flow} />
      </Step>
      <Step index={2} title={STEPS[1][lang]} done={done("services")}>
        {flow.flow.day && (
          <p className="text-sm text-muted-foreground">{dayTitle(flow.flow.day, isAr)}</p>
        )}
        <BookingServicePicker flow={flow} />
      </Step>
      <Step index={3} title={STEPS[2][lang]} done={done("time")}>
        <BookingTimePicker flow={flow} />
      </Step>
      <Step index={4} title={STEPS[3][lang]} done={done("details")}>
        <BookingDetailsFields flow={flow} />
      </Step>

      <section className="sticky bottom-0 space-y-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
        {chosen.length > 0 && showPrices && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {chosen.map((service) => serviceName(service, isAr)).join(isAr ? "، " : ", ")}
            </span>
            <span className="font-semibold text-foreground" dir="ltr">
              {formatPrice(total, currency, lang)}
            </span>
          </div>
        )}
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={flow.step !== null || flow.submitting}
          onClick={flow.submit}
        >
          {flow.submitting
            ? isAr
              ? "جارٍ الإرسال…"
              : "Sending…"
            : isAr
              ? "أرسل طلب الحجز"
              : "Send booking request"}
        </Button>
        {flow.step && (
          <p className="text-center text-xs text-muted-foreground" role="status">
            {isAr ? "أكمل خطوة: " : "Still to do: "}
            {STEPS.find((step) => step.id === flow.step)?.[lang]}
          </p>
        )}
      </section>
    </main>
  );
}
