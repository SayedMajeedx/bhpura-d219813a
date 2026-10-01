import React from "react";
import { QueryClient, QueryClientProvider, queryOptions } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  confirmationEnd,
  confirmationFromCart,
  confirmationFromRow,
  confirmationSearch,
  parseConfirmation,
} from "../src/lib/bookings/confirmation";
import { orderBookingConfirmation } from "../src/lib/bookings/confirmation.server";
import { dayTitle } from "../src/lib/bookings/format";
import { AppointmentSummary } from "../src/features/storefront-booking/components/AppointmentSummary";

// Services stores: an order placed for a booking showed its appointment
// nowhere. Staff saw packing and shipping on the order, and the shopper's
// thank-you page said "we will contact you to confirm delivery".

const cartBooking = {
  id: "b1",
  token: "t1",
  reference: "BK-7Q2M9X",
  day: "2026-10-08",
  start: "18:00",
  durationMinutes: 180,
  expiresAt: "2026-10-01T10:15:00Z",
};

describe("the appointment in the thank-you address", () => {
  it("comes from the cart's booking and reads back the same", () => {
    const confirmation = confirmationFromCart(cartBooking);
    expect(confirmation).toEqual({
      ref: "BK-7Q2M9X",
      day: "2026-10-08",
      start: "18:00",
      minutes: 180,
    });
    expect(parseConfirmation(confirmationSearch(confirmation))).toEqual(confirmation);
  });

  it("comes from a booking row in the store's timezone", () => {
    const confirmation = confirmationFromRow(
      {
        reference: "BK-ABC123",
        event_date: "2026-10-08",
        starts_at: "2026-10-08T15:00:00Z",
        ends_at: "2026-10-08T19:30:00Z",
      },
      "Asia/Bahrain",
    );
    expect(confirmation).toEqual({
      ref: "BK-ABC123",
      day: "2026-10-08",
      start: "18:00",
      minutes: 270,
    });
  });

  it("ignores a missing or edited appointment", () => {
    const good = { ref: "BK-7Q2M9X", day: "2026-10-08", start: "18:00", minutes: "180" };
    expect(parseConfirmation({})).toBeNull();
    expect(parseConfirmation({ ...good, ref: "<script>" })).toBeNull();
    expect(parseConfirmation({ ...good, day: "8/10/2026" })).toBeNull();
    expect(parseConfirmation({ ...good, start: "25:00" })).toBeNull();
    expect(parseConfirmation({ ...good, minutes: "0" })).toBeNull();
    expect(parseConfirmation({ ...good, minutes: "abc" })).toBeNull();
  });

  it("ends after its length, past midnight too", () => {
    expect(confirmationEnd({ ref: "BK-1", day: "2026-10-08", start: "18:00", minutes: 180 })).toBe(
      "21:00",
    );
    expect(confirmationEnd({ ref: "BK-1", day: "2026-10-08", start: "22:30", minutes: 120 })).toBe(
      "00:30",
    );
  });
});

describe("the thank-you page's appointment", () => {
  it("shows the day, the time and the reference", () => {
    render(
      <AppointmentSummary
        appointment={{ ref: "BK-7Q2M9X", day: "2026-10-08", start: "18:00", minutes: 180 }}
        isAr
      />,
    );
    expect(screen.getByText(dayTitle("2026-10-08", true))).toBeTruthy();
    expect(screen.getByText("⁧6:00 م⁩ – ⁧9:00 م⁩")).toBeTruthy();
    expect(screen.getByText("BK-7Q2M9X")).toBeTruthy();
  });
});

/** A stand-in for the service-role client: one row per table. */
function fakeAdmin(rows: Record<string, unknown>, failing: string[] = []) {
  return {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () =>
          failing.includes(table)
            ? { data: null, error: { message: "boom" } }
            : { data: rows[table] ?? null, error: null },
      };
      return chain;
    },
  } as unknown as Parameters<typeof orderBookingConfirmation>[0];
}

describe("the card gateway's redirect", () => {
  it("finds the order's appointment in the store's timezone", async () => {
    const admin = fakeAdmin({
      bookings: {
        reference: "BK-ABC123",
        event_date: "2026-10-08",
        starts_at: "2026-10-08T15:00:00Z",
        ends_at: "2026-10-08T18:00:00Z",
      },
      booking_settings: { timezone: "Asia/Bahrain" },
    });
    await expect(orderBookingConfirmation(admin, "o1", "brand")).resolves.toEqual({
      ref: "BK-ABC123",
      day: "2026-10-08",
      start: "18:00",
      minutes: 180,
    });
  });

  it("goes without the appointment when there is none or the lookup fails", async () => {
    await expect(orderBookingConfirmation(fakeAdmin({}), "o1", "brand")).resolves.toBeNull();
    await expect(
      orderBookingConfirmation(fakeAdmin({}, ["bookings"]), "o1", "brand"),
    ).resolves.toBeNull();
    const throwing = {
      from() {
        throw new Error("network down");
      },
    } as unknown as Parameters<typeof orderBookingConfirmation>[0];
    await expect(orderBookingConfirmation(throwing, "o1", "brand")).resolves.toBeNull();
  });
});

const booking = {
  id: "b1",
  reference: "BK-7Q2M9X",
  status: "confirmed",
  event_date: "2026-10-08",
  starts_at: "2026-10-08T15:00:00Z",
  ends_at: "2026-10-08T18:00:00Z",
  location: { area: "الرفاع", venue: "قاعة الريم" },
  travel_fee: 5,
  deposit_amount: 20,
  cancel_reason: null,
};
let orderBooking: typeof booking | null = booking;
const bookingsData = {
  bookingsQueries: {
    forOrder: (brandId: string, orderId: string) =>
      queryOptions({
        queryKey: ["bookings", brandId, "order", orderId],
        queryFn: async () => orderBooking,
      }),
    settings: (brandId: string) =>
      queryOptions({
        queryKey: ["bookings", brandId, "settings"],
        queryFn: async () => ({ timezone: "Asia/Bahrain" }),
      }),
  },
};
vi.mock("../src/lib/data/bookings", () => bookingsData);
vi.mock("@/lib/data/bookings", () => bookingsData);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const { OrderBookingCard } = await import("../src/features/orders/components/OrderBookingCard");

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrderBookingCard brandId="brand" slug="aurora" orderId="o1" isAr currency="BHD" />
    </QueryClientProvider>,
  );
}

describe("the appointment on the admin order", () => {
  it("shows the day, time, place, status, travel fee and deposit", async () => {
    orderBooking = booking;
    renderCard();
    expect(await screen.findByText(dayTitle("2026-10-08", true))).toBeTruthy();
    expect(screen.getByText("⁧6:00 م⁩ – ⁧9:00 م⁩")).toBeTruthy();
    expect(screen.getByText("الرفاع، قاعة الريم")).toBeTruthy();
    expect(screen.getByText("مؤكد")).toBeTruthy();
    expect(screen.getByText("رسوم التنقل")).toBeTruthy();
    expect(screen.getByText("العربون")).toBeTruthy();
    expect(screen.getByText(/فتح في تقويم الحجوزات/)).toBeTruthy();
  });

  it("shows nothing for an order without a booking", async () => {
    orderBooking = null;
    const { container } = renderCard();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe("");
  });
});
