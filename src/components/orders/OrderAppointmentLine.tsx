import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { useBrand } from "@/lib/brand-context";
import { bookingsQueries } from "@/lib/data/bookings";
import {
  appointmentText,
  bookingOfOrder,
  type OrderBooking,
} from "@/lib/bookings/order-appointment";

/**
 * When an appointment order happens, on its row in the orders list: the day
 * and the time, in the store's timezone. Shows nothing for other orders (and
 * runs no hooks for them: only appointments mount the part that does).
 */
export function OrderAppointmentLine({
  order,
  isAr,
}: {
  order: { bookings?: unknown };
  isAr: boolean;
}) {
  const booking = bookingOfOrder(order);
  return booking ? <AppointmentWhen booking={booking} isAr={isAr} /> : null;
}

function AppointmentWhen({ booking, isAr }: { booking: OrderBooking; isAr: boolean }) {
  const brand = useBrand();
  const rules = useQuery(bookingsQueries.settings(brand.id));
  const appointment = appointmentText(booking, rules.data?.timezone ?? "Asia/Bahrain", isAr);
  return (
    <p className="flex items-center gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-300">
      <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{appointment.day}</span>
      <span dir="ltr">{appointment.time}</span>
    </p>
  );
}
