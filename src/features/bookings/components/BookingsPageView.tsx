import { useState } from "react";
import { CalendarDays, Loader2, Settings2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useBookingsPage } from "@/features/bookings/hooks/use-bookings-page";
import { BookingsCalendar } from "@/features/bookings/components/BookingsCalendar";
import { BookingDayPanel } from "@/features/bookings/components/BookingDayPanel";
import { BookingRequestsList } from "@/features/bookings/components/BookingRequestsList";
import { BookingDiscountsDialog } from "@/features/bookings/components/BookingDiscountsDialog";
import { BookingRulesDialog } from "@/features/bookings/components/BookingRulesDialog";
import { BookingsReport } from "@/features/bookings/components/BookingsReport";
import { CalendarLinkDialog } from "@/features/bookings/components/CalendarLinkDialog";

/**
 * The bookings page: requests waiting, the month calendar and the chosen
 * day. A store sets its booking rules once before its calendar opens.
 */
export function BookingsPageView() {
  const page = useBookingsPage();
  const { isAr } = page;
  const { profile, isLoading: profileLoading } = useAdminStoreProfile(page.brand.id);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [offersOpen, setOffersOpen] = useState(false);
  const [view, setView] = useState<"calendar" | "report">("calendar");

  if (page.settingsLoading || profileLoading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full min-w-0 max-w-6xl space-y-4 p-2 pb-32 sm:p-4 sm:pb-16"
      dir={isAr ? "rtl" : "ltr"}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-lg font-bold text-foreground">
              {isAr ? "الحجوزات" : "Bookings"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "التقويم، الأيام المحجوزة والمغلقة، وطلبات الحجز."
                : "Your calendar, booked and blocked days, and booking requests."}
            </p>
          </div>
        </div>
        {page.configured && (
          <div className="flex flex-wrap gap-2">
            <CalendarLinkDialog page={page} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setRulesOpen(true)}
            >
              <Settings2 className="size-4" />
              {isAr ? "قواعد الحجز" : "Booking rules"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setOffersOpen(true)}
            >
              <Tag className="size-4" />
              {isAr ? "عروض وخصومات" : "Offers"}
            </Button>
          </div>
        )}
      </header>

      {!profile.modules.bookings && (
        <p className="rounded-xl border border-warning bg-warning-subtle p-3 text-sm text-foreground">
          {isAr
            ? "الحجوزات غير مفعلة لنشاط هذا المتجر. تواصل مع فريق Boutq لتفعيلها."
            : "Bookings are off for this store's vertical. Contact Boutq to turn them on."}
        </p>
      )}

      {!page.configured ? (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-6 text-center">
          <CalendarDays className="mx-auto size-8 text-primary" aria-hidden="true" />
          <h2 className="font-display text-base font-bold text-foreground">
            {isAr ? "جهّز تقويم الحجوزات" : "Set up your booking calendar"}
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {isAr
              ? "حدد أوقات البداية، مدة الحجز، وعدد الحجوزات في اليوم. بعدها يظهر التقويم لك ولعملائك، وتُغلق الأيام المحجوزة تلقائياً."
              : "Choose your start times, booking lengths and how many bookings you take a day. Your calendar then opens for you and your customers, and booked days close by themselves."}
          </p>
          <Button
            type="button"
            onClick={() => setRulesOpen(true)}
            disabled={!profile.modules.bookings}
          >
            {isAr ? "إعداد قواعد الحجز" : "Set booking rules"}
          </Button>
        </section>
      ) : (
        <>
          <div className="flex gap-2" role="tablist" aria-label={isAr ? "العرض" : "View"}>
            {(["calendar", "report"] as const).map((id) => (
              <Button
                key={id}
                type="button"
                role="tab"
                size="sm"
                aria-selected={view === id}
                variant={view === id ? "default" : "outline"}
                onClick={() => setView(id)}
              >
                {id === "calendar" ? (isAr ? "التقويم" : "Calendar") : isAr ? "التقرير" : "Report"}
              </Button>
            ))}
          </div>
          {view === "report" ? (
            <BookingsReport page={page} />
          ) : (
            <>
              <BookingRequestsList page={page} />
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
                <BookingsCalendar page={page} />
                <BookingDayPanel key={page.selectedDay} page={page} />
              </div>
            </>
          )}
        </>
      )}

      {offersOpen && (
        <BookingDiscountsDialog page={page} open={offersOpen} onOpenChange={setOffersOpen} />
      )}
      {rulesOpen && <BookingRulesDialog page={page} open={rulesOpen} onOpenChange={setRulesOpen} />}
    </div>
  );
}
