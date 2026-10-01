// The parts of an order email that depend on how the order is fulfilled,
// including a services store's appointment. Plain TypeScript (no Deno APIs)
// so the Vitest suite runs it too (tests/order-email-appointment.test.ts keeps
// its day and time wording equal to the app's, src/lib/bookings/format.ts).

export function escapeHtml(s: unknown) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

type BookingRow = {
  reference?: string | null;
  event_date?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  location?: unknown;
};

/** The order fields this module reads (the email's order query embeds them). */
export type OrderForAppointment = {
  fulfillment_method?: string | null;
  bookings?: BookingRow[] | BookingRow | null;
  brand?: {
    booking_settings?: { timezone?: string | null } | Array<{ timezone?: string | null }> | null;
  } | null;
};

export type EmailAppointment = {
  reference: string;
  /** "Thursday 1 October" / "الخميس 1 أكتوبر". */
  day: string;
  /** "6:00 PM – 9:00 PM" / "6:00 م – 9:00 م". */
  time: string;
  /** Area, venue, address: whatever the booking recorded. */
  place: string;
};

function clock(iso: string, timezone: string, isAr: boolean): string {
  const [hours, minutes] = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(iso))
    .split(":")
    .map(Number);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours < 12 ? (isAr ? "ص" : "AM") : isAr ? "م" : "PM";
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** The appointment the order was placed for, or null when it has none. */
export function emailAppointment(
  order: OrderForAppointment,
  isAr: boolean,
): EmailAppointment | null {
  const rows = Array.isArray(order.bookings)
    ? order.bookings
    : order.bookings
      ? [order.bookings]
      : [];
  const booking = rows.find((row) => row.event_date && row.starts_at && row.ends_at);
  if (!booking) return null;
  const settings = order.brand?.booking_settings;
  const timezone =
    (Array.isArray(settings) ? settings[0]?.timezone : settings?.timezone) || "Asia/Bahrain";
  const day = new Intl.DateTimeFormat(isAr ? "ar-u-nu-latn" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${booking.event_date}T00:00:00Z`));
  const place =
    booking.location && typeof booking.location === "object"
      ? Object.values(booking.location as Record<string, unknown>)
          .filter((value): value is string => typeof value === "string" && value.trim() !== "")
          .join("، ")
      : "";
  return {
    reference: booking.reference ?? "",
    day,
    time: `${clock(booking.starts_at!, timezone, isAr)} – ${clock(booking.ends_at!, timezone, isAr)}`,
    place,
  };
}

/** The appointment block of the customer email (empty for an order without one). */
export function appointmentHtml(order: OrderForAppointment, isAr: boolean): string {
  const appointment = emailAppointment(order, isAr);
  if (!appointment) return "";
  const dir = isAr ? "rtl" : "ltr";
  const label = (ar: string, en: string) => (isAr ? ar : en);
  return (
    `<div dir="${dir}" style="margin:0 0 18px;padding:14px 16px;border-radius:10px;border:1px solid #e5e5e5;background:#fafafa;text-align:${isAr ? "right" : "left"}">` +
    `<strong>${label("موعدك", "Your appointment")}</strong>` +
    `<p style="margin:8px 0 2px">${escapeHtml(appointment.day)}</p>` +
    `<p style="margin:0 0 2px;unicode-bidi:plaintext" dir="ltr">${escapeHtml(appointment.time)}</p>` +
    (appointment.place
      ? `<p style="margin:0 0 2px">${label("المكان", "Place")}: ${escapeHtml(appointment.place)}</p>`
      : "") +
    `<p style="margin:6px 0 0;font-size:12px;color:#666">${label("رقم الحجز", "Booking reference")}: <span dir="ltr">${escapeHtml(appointment.reference)}</span></p>` +
    `</div>`
  );
}

/** How the order is fulfilled, as the email shows it. */
export function fulfillmentText(order: OrderForAppointment, isAr: boolean): string {
  if (emailAppointment(order, isAr)) return isAr ? "موعد خدمة" : "Service appointment";
  switch (order.fulfillment_method) {
    case "appointment":
      return isAr ? "موعد خدمة" : "Service appointment";
    case "delivery":
      return isAr ? "توصيل" : "Home delivery";
    case "pickup":
      return isAr ? "استلام من الفرع" : "Pickup from branch";
    case "digital":
      return isAr ? "توصيل رقمي" : "Digital delivery";
    default:
      return order.fulfillment_method || (isAr ? "غير محدد" : "Not specified");
  }
}
