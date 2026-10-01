import React from "react";
import { QueryClient, QueryClientProvider, queryOptions } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  bookingsGlance,
  glanceEnd,
  type GlanceBooking,
} from "../src/features/bookings/lib/bookings-glance";
import { checklistCopy } from "../src/features/dashboard/lib/checklist-copy";
import { addDays, todayIn } from "../src/lib/bookings/rules";

// Services vertical, step S5: a services store's dashboard talked about
// orders to pack and low stock, and said nothing about its appointments; its
// launch checklist asked for "your first product" and "your first sale".

const rules = { timezone: "Asia/Bahrain", closed_weekdays: [5] as number[] };
// 2026-10-08 is a Thursday; 12:00 UTC is 15:00 in Bahrain.
const now = new Date("2026-10-08T12:00:00Z");

let counter = 0;
const booking = (patch: Partial<GlanceBooking> & { event_date: string }): GlanceBooking => {
  counter += 1;
  return {
    id: `b${counter}`,
    reference: `BK-${counter}`,
    status: "confirmed",
    source: "storefront",
    total: 60,
    starts_at: `${patch.event_date}T15:00:00Z`,
    ends_at: `${patch.event_date}T18:00:00Z`,
    ...patch,
  };
};

describe("a services store's bookings at a glance", () => {
  it("lists today's confirmed appointments earliest first, and counts the week", () => {
    const glance = bookingsGlance({
      bookings: [
        booking({ event_date: "2026-10-08", starts_at: "2026-10-08T17:00:00Z" }),
        booking({ event_date: "2026-10-08", starts_at: "2026-10-08T08:00:00Z" }),
        booking({ event_date: "2026-10-08", status: "requested" }),
        booking({ event_date: "2026-10-08", status: "cancelled" }),
        booking({ event_date: "2026-10-10" }),
        booking({ event_date: "2026-10-20" }),
      ],
      blocks: [],
      rules,
      pendingRequests: 3,
      now,
    });
    expect(glance.today).toBe("2026-10-08");
    expect(glance.todayBookings.map((b) => b.starts_at)).toEqual([
      "2026-10-08T08:00:00Z",
      "2026-10-08T17:00:00Z",
    ]);
    expect(glance.weekCount).toBe(3);
    expect(glance.week.map((entry) => entry.count)).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(glance.pendingRequests).toBe(3);
  });

  it("names the next appointment that has not started", () => {
    const glance = bookingsGlance({
      bookings: [
        booking({ event_date: "2026-10-08", starts_at: "2026-10-08T08:00:00Z" }),
        booking({
          event_date: "2026-10-08",
          starts_at: "2026-10-08T17:00:00Z",
          reference: "BK-NEXT",
        }),
        booking({ event_date: "2026-10-09", starts_at: "2026-10-09T17:00:00Z" }),
      ],
      blocks: [],
      rules,
      pendingRequests: 0,
      now,
    });
    expect(glance.next?.reference).toBe("BK-NEXT");
    expect(
      bookingsGlance({ bookings: [], blocks: [], rules, pendingRequests: 0, now }).next,
    ).toBeNull();
  });

  it("measures how full the next two weeks are, leaving out closed and blocked days", () => {
    // 14 days from Thursday 8 Oct; Fridays (2) are closed, one more day is blocked.
    const glance = bookingsGlance({
      bookings: [
        booking({ event_date: "2026-10-08" }),
        booking({ event_date: "2026-10-09" }),
        booking({ event_date: "2026-10-12" }),
        booking({ event_date: "2026-10-30" }),
      ],
      blocks: [{ starts_on: "2026-10-14", ends_on: "2026-10-14" }],
      rules,
      pendingRequests: 0,
      now,
    });
    expect(glanceEnd("2026-10-08")).toBe("2026-10-21");
    expect(glance.bookableDays).toBe(11);
    // The booking on a closed Friday still counts as a booked day.
    expect(glance.bookedDays).toBe(3);
    expect(glance.occupancy).toBeCloseTo(3 / 11);
  });

  it("reads today in the store's timezone", () => {
    // 22:30 UTC on the 8th is already the 9th in Bahrain (UTC+3).
    const late = new Date("2026-10-08T22:30:00Z");
    expect(
      bookingsGlance({ bookings: [], blocks: [], rules, pendingRequests: 0, now: late }).today,
    ).toBe("2026-10-09");
  });
});

describe("the launch checklist", () => {
  it("talks about services and bookings for a store that takes bookings", () => {
    const services = checklistCopy(true);
    expect(services.addTitle.en).toBe("Add Your First Service");
    expect(services.addDone(2).ar).toContain("خدمة");
    expect(services.firstTitle.en).toBe("Receive Your First Booking");
    expect(services.firstTo).toBe("/admin/b/$slug/bookings");
    const shop = checklistCopy(false);
    expect(shop.addTitle.en).toBe("Add Your First Product");
    expect(shop.firstTitle.en).toBe("Record Your First Sale");
    expect(shop.firstTo).toBe("/admin/b/$slug/orders");
  });
});

const brandCtx = { useBrand: () => ({ id: "b1", slug: "aurora" }) };
vi.mock("../src/lib/brand-context", () => brandCtx);
vi.mock("@/lib/brand-context", () => brandCtx);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const data = {
  rules: null as null | typeof rules,
  bookings: [] as GlanceBooking[],
  requests: [] as Array<{ id: string }>,
};
const bookingsData = {
  bookingsQueries: {
    settings: (brandId: string) =>
      queryOptions({
        queryKey: ["bookings", brandId, "settings"],
        queryFn: async () => data.rules,
      }),
    range: (brandId: string, from: string, to: string) =>
      queryOptions({
        queryKey: ["bookings", brandId, "range", from, to],
        queryFn: async () => data.bookings,
      }),
    blocks: (brandId: string, from: string, to: string) =>
      queryOptions({
        queryKey: ["bookings", brandId, "blocks", from, to],
        queryFn: async () => [],
      }),
    requests: (brandId: string) =>
      queryOptions({
        queryKey: ["bookings", brandId, "requests"],
        queryFn: async () => data.requests,
      }),
  },
};
vi.mock("../src/lib/data/bookings", () => bookingsData);
vi.mock("@/lib/data/bookings", () => bookingsData);

const { BookingsGlanceCard } =
  await import("../src/features/bookings/components/BookingsGlanceCard");

const withQuery = (node: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );

describe("the dashboard's bookings card", () => {
  it("shows today's appointments, the week, the waiting requests and the occupancy", async () => {
    const today = todayIn("Asia/Bahrain");
    const soon = new Date(Date.now() + 3_600_000).toISOString();
    const later = new Date(Date.now() + 4 * 3_600_000).toISOString();
    data.rules = { timezone: "Asia/Bahrain", closed_weekdays: [] };
    data.bookings = [
      booking({ event_date: today, starts_at: soon, ends_at: later, customer_name: "Ali" }),
      booking({ event_date: addDays(today, 2) }),
    ];
    data.requests = [{ id: "r1" }, { id: "r2" }];
    withQuery(<BookingsGlanceCard brandId="b1" slug="aurora" isAr={false} />);

    expect(await screen.findByText("Ali")).toBeTruthy();
    const value = (label: string) =>
      screen.getByText(label).closest("div")?.querySelector("dd")?.textContent;
    expect(value("Today")).toBe("1");
    expect(value("Next 7 days")).toBe("2");
    expect(value("Requests waiting")).toBe("2");
    expect(value("Occupancy (14 days)")).toBe("14%");
    expect(screen.getByRole("link", { name: /Open the calendar/ })).toBeTruthy();
  });

  it("asks a store with no booking rules to set its hours first", async () => {
    data.rules = null;
    withQuery(<BookingsGlanceCard brandId="b1" slug="aurora" isAr={false} />);
    expect(await screen.findByText("Set your booking hours first")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open bookings" })).toBeTruthy();
    expect(screen.queryByText("Next 7 days")).toBeNull();
  });
});

const formState = { bs: { pickup_enabled: true } as Record<string, unknown> };
const setBs = vi.fn();
const settingsForm = {
  useBrandSettingsFormContext: () => ({ form: { bs: formState.bs }, setBs }),
};
vi.mock("../src/features/settings/use-brand-settings-form", () => settingsForm);
vi.mock("@/features/settings/use-brand-settings-form", () => settingsForm);

const { I18nProvider } = await import("../src/lib/i18n");
const { ServiceFulfillmentGroup } =
  await import("../src/features/settings/tabs/orders/ServiceFulfillmentGroup");

describe("where a service happens, in the settings", () => {
  it("replaces shipping zones with the venue choice and points to the booking rules", () => {
    localStorage.setItem("lang", "en");
    render(
      <I18nProvider>
        <ServiceFulfillmentGroup />
      </I18nProvider>,
    );
    expect(screen.getByText("Where your services happen")).toBeTruthy();
    expect(screen.queryByText("Add Zone")).toBeNull();
    expect(screen.queryByText("Bahrain Delivery Fee")).toBeNull();
    expect(screen.getByRole("link", { name: "Open booking rules" })).toBeTruthy();

    // The customer's venue is always on; "at your place" follows the pickup setting.
    expect(screen.getByRole("switch", { name: "At the customer's venue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("switch", { name: "At your place" }));
    expect(setBs).toHaveBeenCalledWith({ pickup_enabled: false });
  });
});
