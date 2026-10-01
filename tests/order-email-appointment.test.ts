import { describe, expect, it } from "vitest";
import {
  appointmentHtml,
  emailAppointment,
  fulfillmentText,
} from "../supabase/functions/send-order-email/appointment";
import { bookingPlaceText, dayTitle, formatClock, localTime } from "../src/lib/bookings/format";

// The order email of a booking said "Home delivery" and never said when the
// appointment was. The edge function can't import the app, so its wording is
// checked against the app's here.

const booking = {
  reference: "BK-7Q2M9X",
  event_date: "2026-10-08",
  starts_at: "2026-10-08T15:00:00Z",
  ends_at: "2026-10-08T18:30:00Z",
  location: { area: "الرفاع", venue: "<قاعة>" },
};
const order = {
  fulfillment_method: "delivery",
  bookings: [booking],
  brand: { booking_settings: { timezone: "Asia/Bahrain" } },
};

describe("the order email's appointment", () => {
  it("words the day, time and place as the app does", () => {
    for (const isAr of [true, false]) {
      const appointment = emailAppointment(order, isAr)!;
      expect(appointment.day).toBe(dayTitle(booking.event_date, isAr));
      expect(appointment.time).toBe(
        `${formatClock(localTime(booking.starts_at, "Asia/Bahrain"), isAr)} – ${formatClock(
          localTime(booking.ends_at, "Asia/Bahrain"),
          isAr,
        )}`,
      );
      expect(appointment.place).toBe(bookingPlaceText(booking.location));
      expect(appointment.reference).toBe("BK-7Q2M9X");
    }
  });

  it("reads the timezone whether the store's settings come as a row or a list", () => {
    const asList = { ...order, brand: { booking_settings: [{ timezone: "Asia/Bahrain" }] } };
    expect(emailAppointment(asList, false)?.time).toBe("6:00 PM – 9:30 PM");
    const without = { ...order, brand: null };
    expect(emailAppointment(without, false)?.time).toBe("6:00 PM – 9:30 PM");
  });

  it("puts an escaped block in the email, and nothing for an order without a booking", () => {
    const html = appointmentHtml(order, true);
    expect(html).toContain("موعدك");
    expect(html).toContain("BK-7Q2M9X");
    expect(html).toContain("&lt;قاعة&gt;");
    expect(html).not.toContain("<قاعة>");
    expect(appointmentHtml({ fulfillment_method: "delivery", bookings: [] }, true)).toBe("");
  });

  it("calls a booking's fulfillment an appointment, not delivery", () => {
    expect(fulfillmentText(order, true)).toBe("موعد خدمة");
    expect(fulfillmentText({ fulfillment_method: "delivery" }, true)).toBe("توصيل");
    expect(fulfillmentText({ fulfillment_method: "pickup" }, false)).toBe("Pickup from branch");
    expect(fulfillmentText({ fulfillment_method: "digital" }, false)).toBe("Digital delivery");
    expect(fulfillmentText({}, true)).toBe("غير محدد");
  });
});
