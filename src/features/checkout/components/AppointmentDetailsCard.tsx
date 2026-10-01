import { Link } from "@tanstack/react-router";
import { CalendarCheck, MapPin, Pencil, Phone, StickyNote, User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CartBooking } from "@/lib/bookings/cart";
import { dayTitle, formatClockRange } from "@/lib/bookings/format";
import { minutesOf, timeOf } from "@/lib/bookings/rules";
import type { Storefront } from "@/features/checkout/types";

/**
 * A booking's checkout shows what the customer already told us, once: the
 * date and time, who, where and any notes, with a way back to change them.
 * Nothing is asked twice; the rest of the page is the payment.
 */
export function AppointmentDetailsCard({
  appointment,
  brand,
  lang,
  t,
}: {
  appointment: CartBooking;
  brand: Pick<Storefront["brand"], "slug">;
  lang: Storefront["lang"];
  t: Storefront["t"];
}) {
  const isAr = lang === "ar";
  const end = timeOf(minutesOf(appointment.start) + appointment.durationMinutes);
  const place = [appointment.place?.area, appointment.place?.venue].filter(Boolean).join("، ");
  const customer = appointment.customer;

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl">{t("تفاصيل حجزك", "Your booking")}</h2>
        <Button asChild type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Link to="/$slug/book" params={{ slug: brand.slug }}>
            <Pencil className="size-3.5" aria-hidden="true" />
            {t("تعديل", "Change")}
          </Link>
        </Button>
      </div>
      <ul className="space-y-2.5 text-sm">
        <li className="flex items-start gap-2.5">
          <CalendarCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block font-semibold text-foreground">
              {dayTitle(appointment.day, isAr)}
            </span>
            <span className="block text-muted-foreground">
              {formatClockRange(appointment.start, end, isAr)}
            </span>
          </span>
        </li>
        {customer && (customer.name || customer.phone) && (
          <li className="flex items-start gap-2.5">
            <User className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 break-words">
              <span className="block text-foreground">{customer.name}</span>
              {customer.phone && (
                <span className="flex items-center gap-1 text-muted-foreground" dir="ltr">
                  <Phone className="size-3" aria-hidden="true" />
                  {customer.phone}
                </span>
              )}
            </span>
          </li>
        )}
        {place && (
          <li className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 break-words text-foreground">{place}</span>
          </li>
        )}
        {appointment.notes && (
          <li className="flex items-start gap-2.5">
            <StickyNote className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 whitespace-pre-line break-words text-muted-foreground">
              {appointment.notes}
            </span>
          </li>
        )}
      </ul>
    </Card>
  );
}
