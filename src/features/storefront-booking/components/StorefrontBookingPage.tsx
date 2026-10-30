import type { ReactNode } from "react";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import { CalendarCheck, CheckCircle2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/storefront-context";
import { bookingEnd } from "@/lib/bookings/rules";
import { dayTitle, formatClock } from "@/lib/bookings/format";
import { storeTaxRule } from "@/lib/order-tax";
import {
  bookingTotals,
  bookingWhatsAppText,
  serviceName,
  whatsAppLink,
  type FlowStep,
} from "@/features/storefront-booking/lib/booking-flow";
import {
  useBookingFlow,
  type BookingFlow,
} from "@/features/storefront-booking/hooks/use-booking-flow";
import {
  BookingSummaryBar,
  stepAnchor,
} from "@/features/storefront-booking/components/BookingSummaryBar";
import { BookingDayPicker } from "@/features/storefront-booking/components/BookingDayPicker";
import { BookingServicePicker } from "@/features/storefront-booking/components/BookingServicePicker";
import { BookingTimePicker } from "@/features/storefront-booking/components/BookingTimePicker";
import { BookingPolicies } from "@/features/storefront-booking/components/BookingPolicies";
import { StoreFaq } from "@/features/store-content/components/StoreFaq";
import { StoreGallery } from "@/features/store-content/components/StoreGallery";
import { BookingDetailsFields } from "@/features/storefront-booking/components/BookingDetailsFields";

const STEPS: Array<{ id: FlowStep; ar: string; en: string }> = [
  { id: "date", ar: "التاريخ", en: "Date" },
  { id: "services", ar: "الخدمات", en: "Services" },
  { id: "time", ar: "الوقت", en: "Time" },
  { id: "details", ar: "التفاصيل", en: "Details" },
];

function Step({
  id,
  index,
  title,
  done,
  children,
}: {
  id: FlowStep;
  index: number;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={stepAnchor(id)}
      className="scroll-mt-24 space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
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
export function StorefrontBookingPage({
  initialService,
  initialMinutes,
}: {
  initialService?: string;
  initialMinutes?: number;
}) {
  const flow = useBookingFlow(initialService, initialMinutes);
  const { isAr, currency, showPrices } = flow;
  const lang = isAr ? "ar" : "en";

  if (flow.loading) {
    return <SectionSkeleton rows={3} className="mx-auto max-w-3xl px-4" />;
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

  const chosen = flow.chosen;
  const offerAmount = flow.offer?.amount ?? 0;
  const tax = storeTaxRule(flow.settings);
  const totals = bookingTotals(
    {
      services: flow.servicesTotal,
      options: flow.optionsTotal,
      offer: offerAmount,
      travelFee: flow.flow.areaCode ? (flow.travelFee ?? 0) : 0,
    },
    tax,
  );
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
      answers: flow.answers,
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
            ? "يصبح الموعد لك بعد تأكيد المتجر. أرسل الطلب على واتساب ليصلهم فوراً."
            : "The date is yours once the store confirms it. Send it on WhatsApp so they see it now."}
        </p>
        <BookingPolicies
          brandId={flow.brand.id}
          isAr={isAr}
          depositPercent={flow.deposit.percent}
          eventDay={flow.result.event_date}
        />
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
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-36 pt-8 sm:pb-40 sm:pt-12">
      <header className="space-y-1 text-center">
        <h1 className="font-display text-3xl text-foreground">
          {isAr ? "احجز موعدك" : "Book your date"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr ? "أربع خطوات بسيطة، والباقي علينا." : "Four simple steps; we'll handle the rest."}
        </p>
      </header>

      <Step id="date" index={1} title={STEPS[0][lang]} done={done("date")}>
        <BookingDayPicker flow={flow} />
      </Step>
      <Step id="services" index={2} title={STEPS[1][lang]} done={done("services")}>
        {flow.flow.day && (
          <p className="text-sm text-muted-foreground">{dayTitle(flow.flow.day, isAr)}</p>
        )}
        <BookingServicePicker flow={flow} />
      </Step>
      <Step id="time" index={3} title={STEPS[2][lang]} done={done("time")}>
        <BookingTimePicker flow={flow} />
      </Step>
      <Step id="details" index={4} title={STEPS[3][lang]} done={done("details")}>
        <BookingDetailsFields flow={flow} />
      </Step>

      <BookingPolicies
        brandId={flow.brand.id}
        isAr={isAr}
        depositPercent={flow.deposit.percent}
        eventDay={flow.flow.day}
        compact
      />
      <StoreGallery brandId={flow.brand.id} isAr={isAr} />
      <StoreFaq brandId={flow.brand.id} isAr={isAr} folded />

      <BookingSummaryBar
        flow={flow}
        totals={totals}
        tax={tax}
        offerAmount={offerAmount}
        stepLabel={flow.step ? (STEPS.find((step) => step.id === flow.step)?.[lang] ?? null) : null}
      />
    </main>
  );
}
