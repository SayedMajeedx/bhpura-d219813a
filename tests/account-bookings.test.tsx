import React from "react";
import { render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OwnBooking } from "../src/features/storefront-account/lib/own-bookings";

// A shopper's bookings on their account page (storefront_my_bookings), rendered with the
// storefront faked.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
const storefrontMock = vi.hoisted(() => () => ({
  useStorefront: () => ({
    brand: { id: "b1", slug: "aurora", name_en: "Aurora", name_ar: "اورورا" },
    lang: "en",
    t: (_ar: string, en: string) => en,
  }),
  formatPrice: (n: number, currency: string) => `${currency} ${n.toFixed(3)}`,
}));
vi.mock("../src/lib/storefront-context", storefrontMock);
vi.mock("@/lib/storefront-context", storefrontMock);

const { BookingsSection } =
  await import("../src/features/storefront-account/components/BookingsSection");

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T09:00:00Z"));
});
afterAll(() => vi.useRealTimers());

const booking = (over: Partial<OwnBooking>): OwnBooking => ({
  reference: "BK-ONE",
  status: "confirmed",
  event_date: "2026-10-25",
  starts_at: "2026-10-25T15:00:00Z",
  ends_at: "2026-10-25T18:00:00Z",
  timezone: "Asia/Bahrain",
  location: { area: "Juffair", venue: "Gold hall" },
  services: [{ name_en: "Photo booth", name_ar: "فوتوبوث", quantity: 1 }],
  invoice_token: "tok",
  total: 100,
  paid: 40,
  currency: "BHD",
  ...over,
});

describe("a shopper's bookings on their account", () => {
  it("lists what is coming up with what is still to pay, the invoice and a way to the calendar", () => {
    render(
      <BookingsSection
        isLoading={false}
        bookings={[
          booking({}),
          booking({
            reference: "BK-OLD",
            status: "completed",
            event_date: "2026-10-01",
            starts_at: "2026-10-01T15:00:00Z",
            ends_at: "2026-10-01T18:00:00Z",
            paid: 100,
          }),
        ]}
      />,
    );
    const coming = screen.getByRole("region", { name: "Coming up" });
    const card = within(coming).getByText("BK-ONE").closest("article")!;
    expect(within(card).getByText("Confirmed")).toBeInTheDocument();
    expect(within(card).getByText("6:00 PM – 9:00 PM")).toBeInTheDocument();
    expect(within(card).getByText("Photo booth")).toBeInTheDocument();
    expect(within(card).getByText(/Gold hall/)).toBeInTheDocument();
    expect(within(card).getByText("BHD 60.000")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Invoice" })).toHaveAttribute(
      "href",
      "/invoice/tok",
    );
    expect(
      within(card).getByRole("link", { name: "Add to Google Calendar" }).getAttribute("href"),
    ).toContain("dates=20261025T150000Z%2F20261025T180000Z");

    // A past booking: in its own list, done, with nothing to pay and no calendar.
    const past = screen.getByRole("region", { name: "Past" });
    const old = within(past).getByText("BK-OLD").closest("article")!;
    expect(within(old).getByText("Done")).toBeInTheDocument();
    expect(within(old).queryByText(/Still to pay/)).toBeNull();
    expect(within(old).queryByRole("link", { name: "Add to Google Calendar" })).toBeNull();
  });

  it("invites a shopper with no bookings to book a date", () => {
    render(<BookingsSection isLoading={false} bookings={[]} />);
    expect(screen.getByText("No bookings yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book a date" })).toHaveAttribute(
      "href",
      "/$slug/book",
    );
  });
});
