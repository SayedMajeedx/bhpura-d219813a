import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOOKING_RULES, type BookingRules } from "../src/lib/bookings/rules";

// The admin bookings page, rendered with its data layer faked: the store's
// rules, a month of bookings, a waiting request, and the writes staff make.

const state = vi.hoisted(() => ({
  settings: null as BookingRules | null,
  bookings: [] as unknown[],
  requests: [] as unknown[],
  blocks: [] as unknown[],
  bookingsModule: true,
  saveBookingSettings: vi.fn(async () => undefined),
  saveBookingAreaFees: vi.fn(async () => undefined),
  areaFees: {} as Record<string, number>,
  calendarToken: null as string | null,
  setCalendarToken: vi.fn(async () => undefined),
  setBookingStatus: vi.fn(async () => ({})),
  addBookingBlock: vi.fn(async () => undefined),
  removeBookingBlock: vi.fn(async () => undefined),
  createStaffBooking: vi.fn(async () => ({})),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fixture = (key: string, value: () => unknown) => ({
  queryKey: ["bookings-test", key],
  queryFn: async () => value(),
});
const bookingsData = {
  bookingsQueries: {
    settings: () => fixture("settings", () => state.settings),
    range: () => fixture("range", () => state.bookings),
    blocks: () => fixture("blocks", () => state.blocks),
    requests: () => fixture("requests", () => state.requests),
    areaFees: () => fixture("area-fees", () => state.areaFees),
    calendarToken: () => fixture("calendar-token", () => state.calendarToken),
  },
  bookingsKeys: { calendarToken: () => ["bookings-test", "calendar-token"] },
  setCalendarToken: state.setCalendarToken,
  invalidateBookings: vi.fn(async () => undefined),
  saveBookingSettings: state.saveBookingSettings,
  saveBookingAreaFees: state.saveBookingAreaFees,
  setBookingStatus: state.setBookingStatus,
  addBookingBlock: state.addBookingBlock,
  removeBookingBlock: state.removeBookingBlock,
  createStaffBooking: state.createStaffBooking,
};
vi.mock("../src/lib/data/bookings", () => bookingsData);
vi.mock("@/lib/data/bookings", () => bookingsData);
const settingsData = {
  businessSettingsQueries: { detail: () => fixture("bs", () => ({ currency: "BHD" })) },
};
vi.mock("../src/lib/data/business-settings", () => settingsData);
vi.mock("@/lib/data/business-settings", () => settingsData);
const catalogData = {
  catalogQueries: {
    // Prices live on variants; base_price is often empty.
    products: () =>
      fixture("products", () => [
        {
          id: "p1",
          name: "Photo booth",
          name_en: "Photo booth",
          name_ar: "فوتوبوث",
          base_price: null,
          is_active: true,
        },
        { id: "p2", name: "Old", name_en: "Old", name_ar: null, base_price: 10, is_active: false },
      ]),
    variants: () =>
      fixture("variants", () => [
        { id: "v2", product_id: "p1", selling_price: 70 },
        { id: "v1", product_id: "p1", selling_price: 55 },
      ]),
  },
};
vi.mock("../src/lib/data/catalog", () => catalogData);
vi.mock("@/lib/data/catalog", () => catalogData);
const brandContext = { useBrand: () => ({ id: "b1", slug: "booth", name_en: "Booth" }) };
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);
const storeProfile = {
  useAdminStoreProfile: () => ({
    profile: { vertical: "services", modules: { bookings: state.bookingsModule } },
    isLoading: false,
  }),
};
vi.mock("../src/hooks/use-store-profile", () => storeProfile);
vi.mock("@/hooks/use-store-profile", () => storeProfile);

const { BookingsPageView } = await import("../src/features/bookings/components/BookingsPageView");
const { I18nProvider } = await import("../src/lib/i18n");
const { getAdminNavItems } = await import("../src/config/admin-navigation");

// 1 October 2026, 12:00 in Bahrain.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
});
afterAll(() => vi.useRealTimers());

const booking = (over: Record<string, unknown>) => ({
  id: "x",
  reference: "BK-AAAAAA",
  status: "confirmed",
  event_date: "2026-10-12",
  starts_at: "2026-10-12T15:00:00Z", // 18:00 in Bahrain
  ends_at: "2026-10-12T18:00:00Z",
  customer_name: "Sara",
  customer_phone: "39001122",
  location: { area: "Juffair" },
  notes: null,
  total: 55,
  cancel_reason: null,
  booking_items: [
    {
      id: "i1",
      product_id: "p1",
      name_en: "Photo booth",
      name_ar: "فوتوبوث",
      quantity: 1,
      unit_price: 55,
      line_total: 55,
    },
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
  state.settings = { ...DEFAULT_BOOKING_RULES };
  state.bookingsModule = true;
  const request = booking({
    id: "r1",
    status: "requested",
    event_date: "2026-10-15",
    starts_at: "2026-10-15T15:00:00Z",
    ends_at: "2026-10-15T18:00:00Z",
    customer_name: "Noor",
  });
  state.bookings = [booking({ id: "c1" }), request];
  state.requests = [request];
  state.blocks = [];
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <BookingsPageView />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe("the bookings page", () => {
  it("asks a store without rules to set them up first", async () => {
    state.settings = null;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Set booking rules" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(state.saveBookingSettings).toHaveBeenCalledWith("b1", DEFAULT_BOOKING_RULES),
    );
  });

  // The rules dialog renders many fields: slow when the whole suite runs at once.
  it("saves travel fees: a default and one area's own", { timeout: 15_000 }, async () => {
    state.areaFees = { hidd: 12 };
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Booking rules" }));
    fireEvent.change(await screen.findByLabelText(/Default fee/), { target: { value: "5" } });
    // The saved area fee shows the list already open.
    fireEvent.change(screen.getByLabelText("Juffair"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Hidd"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(state.saveBookingAreaFees).toHaveBeenCalledTimes(1));
    expect(state.saveBookingSettings).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ travel_fee_default: 5 }),
    );
    expect(state.saveBookingAreaFees).toHaveBeenCalledWith("b1", { hidd: null, juffair: 3 });
    state.areaFees = {};
  });

  it("shows the month with booked days and waiting requests", async () => {
    renderPage();
    expect(await screen.findByText("October 2026")).toBeInTheDocument();
    const full = await screen.findByRole("gridcell", { name: /12 October: Fully booked/ });
    expect(full).toBeInTheDocument();
    expect(
      screen.getByRole("gridcell", { name: /15 October: Available · 1 requests/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Booking requests (1)")).toBeInTheDocument();
  });

  it("opens a day with its bookings, times in the store's timezone", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("gridcell", { name: /12 October/ }));
    expect(await screen.findByText("Sara")).toBeInTheDocument();
    expect(screen.getByText("6:00 PM – 9:00 PM")).toBeInTheDocument();
    expect(screen.getByText("Juffair")).toBeInTheDocument();
  });

  it("confirms a request from the list", async () => {
    renderPage();
    const list = (await screen.findByText("Booking requests (1)")).closest("section")!;
    fireEvent.click(within(list).getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(state.setBookingStatus).toHaveBeenCalledWith("r1", "confirmed", undefined),
    );
  });

  it("blocks a day", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("gridcell", { name: /20 October/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Block" }));
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Eid" } });
    fireEvent.click(screen.getByRole("button", { name: "Block days" }));
    await waitFor(() =>
      expect(state.addBookingBlock).toHaveBeenCalledWith("b1", {
        starts_on: "2026-10-20",
        ends_on: "2026-10-20",
        reason: "Eid",
      }),
    );
  });

  it("takes a booking for the chosen day with the store's active services", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("gridcell", { name: /22 October/ }));
    fireEvent.click(await screen.findByRole("button", { name: "New booking" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText("Old")).not.toBeInTheDocument();
    fireEvent.click(await within(dialog).findByRole("checkbox", { name: /Photo booth/ }));
    fireEvent.change(within(dialog).getByLabelText("Customer name"), { target: { value: "Huda" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save booking" }));
    await waitFor(() => expect(state.createStaffBooking).toHaveBeenCalledTimes(1));
    expect(state.createStaffBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: "b1",
        day: "2026-10-22",
        start: "18:00",
        durationMinutes: 180,
        customer: { name: "Huda", phone: undefined },
        items: [
          expect.objectContaining({
            product_id: "p1",
            variant_id: "v1",
            quantity: 1,
            unit_price: 55,
          }),
        ],
        status: "confirmed",
      }),
    );
  });

  it("shows how the month went in the report view", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Report" }));
    // One confirmed booking (12 Oct, 55) this month; the 15 Oct request waits.
    expect(await screen.findByText("Confirmed bookings")).toBeInTheDocument();
    expect(screen.getByText("Top services")).toBeInTheDocument();
    expect(await screen.findByText(/Photo booth/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Last 90 days" }));
    expect(screen.getByRole("button", { name: "Last 90 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("makes a private calendar link and shows it to subscribe to", async () => {
    state.calendarToken = null;
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Calendar link" }));
    expect(await screen.findByText("There is no link yet.")).toBeInTheDocument();
    const made = crypto.randomUUID();
    state.calendarToken = made;
    fireEvent.click(screen.getByRole("button", { name: "Make the link" }));
    await waitFor(() => expect(state.setCalendarToken).toHaveBeenCalledTimes(1));
    const [brandId, token] = state.setCalendarToken.mock.lastCall as unknown as [string, string];
    expect(brandId).toBe("b1");
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByLabelText("Calendar link")).toHaveValue(
      `${window.location.origin}/api/public/bookings/calendar/${made}.ics`,
    );
    state.calendarToken = null;
  });

  it("says when bookings are off for the store", async () => {
    state.bookingsModule = false;
    renderPage();
    expect(await screen.findByText(/Bookings are off for this store/)).toBeInTheDocument();
  });

  it("reads right to left in Arabic", async () => {
    localStorage.setItem("lang", "ar");
    const { container } = renderPage();
    expect(await screen.findByRole("button", { name: "الشهر السابق" })).toBeInTheDocument();
    expect(container.querySelector("[dir='rtl']")).not.toBeNull();
  });
});

describe("the bookings menu item", () => {
  const nav = (bookings: boolean) =>
    getAdminNavItems({
      activeSlug: "booth",
      isCourier: false,
      isAdmin: true,
      hasPermission: () => true,
      t: (key: string) => key,
      lang: "en",
      storeModules: { size_guide: false, fit_passport: false, made_to_order: false, bookings },
    }).map((item) => item.id);

  it("appears only for stores with the bookings module", () => {
    expect(nav(true)).toContain("bookings");
    expect(nav(false)).not.toContain("bookings");
  });
});
