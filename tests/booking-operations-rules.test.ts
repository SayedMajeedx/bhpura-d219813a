import { describe, expect, it } from "vitest";
import {
  bookingMinutes,
  bookingNoteLine,
  movedOrderNotes,
  overbookable,
  pastMoveTerms,
} from "../src/lib/bookings/move";
import {
  agendaDays,
  agendaEnd,
  bookingBalance,
  canRemind,
  remindToday,
} from "../src/features/bookings/lib/agenda";
import {
  bookingMovedMessage,
  bookingReminderMessage,
  customerChatLink,
} from "../src/features/bookings/lib/booking-messages";
import { whatsAppToCustomer } from "../src/features/bookings/lib/booking-invoice";

// Moving a booking, the agenda and the WhatsApp messages staff send: pure rules.

const now = new Date("2026-10-01T09:00:00Z");
const today = "2026-10-01";

describe("moving a booking", () => {
  it("keeps the booking's length", () => {
    expect(
      bookingMinutes({ starts_at: "2026-10-02T15:00:00Z", ends_at: "2026-10-02T18:30:00Z" }),
    ).toBe(210);
  });

  it("moves the order's line for the booking, and nothing else in its notes", () => {
    const notes = "📅 BK-AB12 · 2026-10-02 · 18:00–21:00\n\nPlease bring the gold backdrop.";
    const line = bookingNoteLine("BK-AB12", "2026-10-05", "17:00", "20:00");
    expect(line).toBe("📅 BK-AB12 · 2026-10-05 · 17:00–20:00");
    expect(movedOrderNotes(notes, "BK-AB12", line)).toBe(
      "📅 BK-AB12 · 2026-10-05 · 17:00–20:00\n\nPlease bring the gold backdrop.",
    );
    // No line for this booking (an older order, or one staff rewrote): nothing to change.
    expect(movedOrderNotes("Gold backdrop", "BK-AB12", line)).toBeNull();
    expect(movedOrderNotes(null, "BK-AB12", line)).toBeNull();
    expect(movedOrderNotes(`${line}\nnote`, "BK-AB12", line)).toBeNull();
    // Another booking's line is left alone.
    expect(movedOrderNotes("📅 BK-ZZ99 · 2026-10-02 · 18:00–21:00", "BK-AB12", line)).toBeNull();
  });

  it("says when the new day is past the store's terms, month ends counted", () => {
    expect(pastMoveTerms("2026-10-02", "2026-11-02", 1)).toBeNull();
    expect(pastMoveTerms("2026-10-02", "2026-11-03", 1)).toBe("2026-11-02");
    expect(pastMoveTerms("2026-01-31", "2026-03-01", 1)).toBe("2026-02-28");
    expect(pastMoveTerms("2026-10-02", "2027-10-02", null)).toBeNull();
    expect(pastMoveTerms("2026-10-02", "2027-10-02", 0)).toBeNull();
  });

  it("may be moved anyway when the day or a service has no place, never into the past", () => {
    expect(overbookable("BOOKING_DAY_FULL")).toBe(true);
    expect(overbookable("BOOKING_DAY_BLOCKED")).toBe(true);
    expect(overbookable("BOOKING_SERVICE_FULL: Booth")).toBe(true);
    expect(overbookable("BOOKING_DAY_PAST")).toBe(false);
    expect(overbookable("BOOKING_DAY_BEYOND")).toBe(false);
    expect(overbookable("BOOKING_TRANSITION_INVALID")).toBe(false);
  });
});

describe("the agenda", () => {
  const item = (over: Record<string, unknown>) => ({
    id: "x",
    status: "confirmed",
    event_date: "2026-10-02",
    starts_at: "2026-10-02T15:00:00Z",
    customer_phone: "39001122",
    hold_expires_at: null,
    orders: null,
    ...over,
  });

  it("is today and the next six days, each in start order, without what was cancelled or ran out", () => {
    expect(agendaEnd(today)).toBe("2026-10-07");
    const days = agendaDays(
      [
        item({ id: "late", starts_at: "2026-10-02T17:00:00Z" }),
        item({ id: "early", starts_at: "2026-10-02T06:00:00Z" }),
        item({ id: "gone", status: "cancelled" }),
        item({ id: "lapsed", status: "hold", hold_expires_at: "2026-10-01T08:00:00Z" }),
        item({ id: "held", status: "hold", hold_expires_at: "2026-10-01T10:00:00Z" }),
        item({
          id: "done",
          status: "completed",
          event_date: today,
          starts_at: "2026-10-01T05:00:00Z",
        }),
      ],
      today,
      now,
    );
    expect(days).toHaveLength(7);
    expect(days[0].bookings.map((b) => b.id)).toEqual(["done"]);
    expect(days[1].bookings.map((b) => b.id)).toEqual(["early", "held", "late"]);
    expect(days[6]).toMatchObject({ day: "2026-10-07", offset: 6, bookings: [] });
  });

  it("reminds a confirmed booking still to come with a number; tomorrow's until it is reminded", () => {
    expect(canRemind(item({}), today, now)).toBe(true);
    expect(canRemind(item({ event_date: today }), today, now)).toBe(false);
    expect(canRemind(item({ status: "requested" }), today, now)).toBe(false);
    expect(canRemind(item({ customer_phone: " " }), today, now)).toBe(false);
    expect(remindToday(item({ id: "a" }), today, new Set(), now)).toBe(true);
    expect(remindToday(item({ id: "a" }), today, new Set(["a"]), now)).toBe(false);
    expect(remindToday(item({ event_date: "2026-10-03" }), today, new Set(), now)).toBe(false);
  });

  it("owes what the order has not been paid", () => {
    const orders = {
      id: "o",
      invoice_number: 1,
      public_invoice_token: "t",
      status: "confirmed",
      payment_status: "partially_paid",
      total: "100.000",
      advance_paid: "37.5",
      currency: "BHD",
    };
    expect(bookingBalance({ orders })).toBe(62.5);
    expect(bookingBalance({ orders: { ...orders, advance_paid: "100" } })).toBe(0);
    expect(bookingBalance({ orders: null })).toBe(0);
  });
});

describe("the messages staff send", () => {
  const facts = {
    brandName: "Aurora",
    customerName: "Sara",
    reference: "BK-AB12",
    dayLabel: "Friday 2 October",
    timeLabel: "6:00 PM – 9:00 PM",
    place: "Juffair, Venue",
    link: "https://aurora.boutq.store/invoice/tok",
  };

  it("reminds of the date, the place and what is still to pay", () => {
    expect(
      bookingReminderMessage({
        ...facts,
        isAr: false,
        balance: 60,
        currency: "BHD",
        tomorrow: true,
      }).split("\n"),
    ).toEqual([
      "Hello Sara,",
      "A reminder from Aurora of your booking tomorrow (BK-AB12)",
      "When: Friday 2 October · 6:00 PM – 9:00 PM",
      "Where: Juffair, Venue",
      // formatMoney keeps the currency and the amount together with a no-break space.
      expect.stringMatching(/^Still to pay: BHD\s60\.000$/),
      "https://aurora.boutq.store/invoice/tok",
    ]);
  });

  it("says tomorrow only when it is, and nothing about money when all is paid, in Arabic too", () => {
    const text = bookingReminderMessage({
      ...facts,
      isAr: true,
      place: null,
      link: null,
      balance: 0,
      currency: "BHD",
      tomorrow: false,
    });
    expect(text).toBe(
      [
        "مرحباً Sara،",
        "تذكير من Aurora بموعد حجزك (BK-AB12)",
        "الموعد: Friday 2 October · 6:00 PM – 9:00 PM",
      ].join("\n"),
    );
  });

  it("tells a customer the booking moved", () => {
    expect(bookingMovedMessage({ ...facts, isAr: false, link: null })).toBe(
      [
        "Hello Sara,",
        "Your booking with Aurora (BK-AB12) has moved",
        "New date: Friday 2 October · 6:00 PM – 9:00 PM",
      ].join("\n"),
    );
    expect(bookingMovedMessage({ ...facts, isAr: true, customerName: null, link: null })).toBe(
      [
        "تم نقل حجزك لدى Aurora (BK-AB12)",
        "الموعد الجديد: Friday 2 October · 6:00 PM – 9:00 PM",
      ].join("\n"),
    );
  });

  it("opens the chat through the one phone rule", () => {
    expect(customerChatLink("3900 1122", "hi")).toBe("https://wa.me/97339001122?text=hi");
    expect(customerChatLink("0097339001122", "hi")).toBe("https://wa.me/97339001122?text=hi");
    expect(customerChatLink("555123456", "hi")).toBe("https://wa.me/966555123456?text=hi");
    expect(customerChatLink("12", "hi")).toBeNull();
    // The invoice block's link is the same rule.
    expect(whatsAppToCustomer("3900 1122", "hi")).toBe(customerChatLink("3900 1122", "hi"));
  });
});
