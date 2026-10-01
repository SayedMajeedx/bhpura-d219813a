import type { AppointmentText } from "@/lib/bookings/order-appointment";

/**
 * An appointment order's day, time, place and reference on an invoice, in the
 * invoice's own colours (both the admin preview and the public invoice).
 */
export function InvoiceAppointment({
  appointment,
  isRTL,
  color,
}: {
  appointment: AppointmentText;
  isRTL: boolean;
  color: string;
}) {
  return (
    <div className="mt-2 space-y-0.5 text-xs" style={{ color, opacity: 0.9 }}>
      <p className="font-semibold">{appointment.day}</p>
      <p dir="ltr" style={{ textAlign: isRTL ? "right" : "left" }}>
        {appointment.time}
      </p>
      {appointment.place && <p>{appointment.place}</p>}
      {appointment.reference && (
        <p style={{ opacity: 0.75 }}>
          {isRTL ? "رقم الحجز" : "Booking"}: <span dir="ltr">{appointment.reference}</span>
        </p>
      )}
    </div>
  );
}
