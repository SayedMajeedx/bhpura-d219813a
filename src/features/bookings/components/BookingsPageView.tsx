import { useState } from "react";
import { SectionSkeleton } from "@/components/ui/section-skeleton";
import {
  CalendarDays,
  CalendarPlus,
  CalendarSync,
  Images,
  Palette,
  ScrollText,
  Settings2,
  Tag,
  type LucideIcon,
} from "lucide-react";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewBookingDialog } from "@/features/bookings/components/NewBookingDialog";
import { Button } from "@/components/ui/button";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { useBookingsPage } from "@/features/bookings/hooks/use-bookings-page";
import { BookingsCalendar } from "@/features/bookings/components/BookingsCalendar";
import { BookingDayPanel } from "@/features/bookings/components/BookingDayPanel";
import { BookingRequestsList } from "@/features/bookings/components/BookingRequestsList";
import { BookingDiscountsDialog } from "@/features/bookings/components/BookingDiscountsDialog";
import { BookingRulesDialog } from "@/features/bookings/components/BookingRulesDialog";
import { BookingsReport } from "@/features/bookings/components/BookingsReport";
import { BookingsAgenda } from "@/features/bookings/components/BookingsAgenda";
import { StoreContentDialog } from "@/features/store-content/components/StoreContentDialog";
import { BookingLookDialog } from "@/features/bookings/components/BookingLookDialog";
import { BookingPoliciesDialog } from "@/features/bookings/components/BookingPoliciesDialog";
import { CalendarLinkDialog } from "@/features/bookings/components/CalendarLinkDialog";

type Tool = "new" | "rules" | "offers" | "content" | "terms" | "look" | "calendar";

/**
 * The set-up menu: what a store sets once and comes back to rarely. It was six outline buttons
 * that wrapped to two or three rows above the bookings on a phone.
 */
const SETUP_TOOLS: Array<{ id: Tool; icon: LucideIcon; ar: string; en: string }> = [
  { id: "rules", icon: Settings2, ar: "قواعد الحجز", en: "Booking rules" },
  { id: "offers", icon: Tag, ar: "عروض وخصومات", en: "Offers" },
  { id: "terms", icon: ScrollText, ar: "شروط الحجز", en: "Terms" },
  { id: "content", icon: Images, ar: "المعرض والأسئلة", en: "Gallery & FAQ" },
  { id: "look", icon: Palette, ar: "شكل الباقات", en: "Package look" },
  { id: "calendar", icon: CalendarSync, ar: "ربط بالتقويم", en: "Calendar link" },
];

const VIEW_LABELS = {
  agenda: { ar: "الأيام القادمة", en: "Agenda" },
  calendar: { ar: "التقويم", en: "Calendar" },
  report: { ar: "التقرير", en: "Report" },
} as const;

/**
 * The bookings page: the agenda (today and the next days, with the reminders
 * to send), the month calendar with the chosen day, and the report. Requests
 * waiting show above the agenda and the calendar. A store sets its booking
 * rules once before its calendar opens.
 */
export function BookingsPageView() {
  const page = useBookingsPage();
  const { isAr } = page;
  const { profile, isLoading: profileLoading } = useAdminStoreProfile(page.brand.id);
  // One tool open at a time: the new booking, or one of the set-up menu's dialogs.
  const [tool, setTool] = useState<Tool | null>(null);
  const close = (open: boolean) => {
    if (!open) setTool(null);
  };
  // The agenda first: what a services business works from day to day.
  const [view, setView] = useState<"agenda" | "calendar" | "report">("agenda");

  if (page.settingsLoading || profileLoading) {
    return <SectionSkeleton rows={4} />;
  }

  return (
    <div
      className="mx-auto w-full min-w-0 max-w-6xl space-y-4 p-2 pb-32 sm:p-4 sm:pb-16"
      dir={isAr ? "rtl" : "ltr"}
    >
      <AdminPageHeader
        icon={CalendarDays}
        title={isAr ? "الحجوزات" : "Bookings"}
        badges={
          page.requests.length > 0 ? (
            <AdminPageCount>
              {isAr ? `${page.requests.length} بانتظارك` : `${page.requests.length} waiting`}
            </AdminPageCount>
          ) : null
        }
        description={
          isAr
            ? "الأيام القادمة، التقويم، وطلبات الحجز."
            : "The days ahead, your calendar and booking requests."
        }
        actions={
          page.configured && (
            <>
              <AdminPageAction
                icon={CalendarPlus}
                label={isAr ? "حجز جديد" : "New booking"}
                short={isAr ? "جديد" : "New"}
                onClick={() => setTool("new")}
              />
              <DropdownMenu dir={isAr ? "rtl" : "ltr"}>
                <DropdownMenuTrigger asChild>
                  <AdminPageAction
                    icon={Settings2}
                    label={isAr ? "الإعداد" : "Set up"}
                    variant="outline"
                    iconOnPhone
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isAr ? "start" : "end"} className="w-56">
                  {SETUP_TOOLS.map((item) => (
                    <DropdownMenuItem key={item.id} onSelect={() => setTool(item.id)}>
                      <item.icon className="size-4" aria-hidden="true" />
                      {isAr ? item.ar : item.en}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />

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
            onClick={() => setTool("rules")}
            disabled={!profile.modules.bookings}
          >
            {isAr ? "إعداد قواعد الحجز" : "Set booking rules"}
          </Button>
        </section>
      ) : (
        <>
          <div className="flex gap-2" role="tablist" aria-label={isAr ? "العرض" : "View"}>
            {(["agenda", "calendar", "report"] as const).map((id) => (
              <Button
                key={id}
                type="button"
                role="tab"
                size="sm"
                aria-selected={view === id}
                variant={view === id ? "default" : "outline"}
                onClick={() => setView(id)}
              >
                {VIEW_LABELS[id][isAr ? "ar" : "en"]}
              </Button>
            ))}
          </div>
          {view === "report" ? (
            <BookingsReport page={page} />
          ) : view === "agenda" ? (
            <>
              <BookingRequestsList page={page} />
              <BookingsAgenda
                page={page}
                onOpenDay={(day) => {
                  page.goToDay(day);
                  setView("calendar");
                }}
              />
            </>
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

      {tool === "new" && <NewBookingDialog page={page} open onOpenChange={close} />}
      {tool === "offers" && <BookingDiscountsDialog page={page} open onOpenChange={close} />}
      {tool === "look" && <BookingLookDialog page={page} open onOpenChange={close} />}
      {tool === "terms" && <BookingPoliciesDialog page={page} open onOpenChange={close} />}
      {tool === "content" && (
        <StoreContentDialog brandId={page.brand.id} isAr={isAr} open onOpenChange={close} />
      )}
      {tool === "rules" && <BookingRulesDialog page={page} open onOpenChange={close} />}
      {tool === "calendar" && <CalendarLinkDialog page={page} open onOpenChange={close} />}
    </div>
  );
}
