import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOOKING_RULES, type BookingRules } from "../src/lib/bookings/rules";
import { dayTitle } from "../src/lib/bookings/format";

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
  courierCompleteDelivery: vi.fn(async () => null),
  updateOrder: vi.fn(async () => undefined),
  logActivity: vi.fn(async () => undefined),
  reminded: new Map<string, string>(),
  rescheduleBooking: vi.fn(async (_input: unknown) => ({})),
  moveBookingOrderNote: vi.fn(async (..._args: unknown[]) => true),
  recordBookingReminder: vi.fn(async (..._args: unknown[]) => undefined),
  policy: null as { reschedule_months: number | null } | null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
// A booking with an order links to it (its invoice): a plain link, with no router mounted.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#order">{children}</a>,
}));

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
  // The agenda's reminders and the move (src/lib/data/bookings/operations.ts).
  bookingOperationsQueries: { reminders: () => fixture("reminders", () => state.reminded) },
  rescheduleBooking: state.rescheduleBooking,
  moveBookingOrderNote: state.moveBookingOrderNote,
  recordBookingReminder: state.recordBookingReminder,
};
const policiesData = {
  bookingPoliciesQueries: { policy: () => fixture("policy", () => state.policy) },
};
vi.mock("../src/lib/data/booking-policies", () => policiesData);
vi.mock("@/lib/data/booking-policies", () => policiesData);
vi.mock("../src/lib/data/bookings", () => bookingsData);
vi.mock("@/lib/data/bookings", () => bookingsData);
// A booking is finished through its order: the order's own writes, recorded here.
const ordersData = {
  courierCompleteDelivery: state.courierCompleteDelivery,
  updateOrder: state.updateOrder,
  invalidateOrders: vi.fn(async () => undefined),
};
vi.mock("../src/lib/data/orders/mutations", () => ordersData);
vi.mock("@/lib/data/orders/mutations", () => ordersData);
const activityLog = { logActivity: state.logActivity };
vi.mock("../src/lib/activity-log", () => activityLog);
vi.mock("@/lib/activity-log", () => activityLog);
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
  state.reminded = new Map();
  state.policy = null;
});

/** The page, on the calendar (the agenda is its first view) unless asked for the agenda. */
async function renderPage(view: "agenda" | "calendar" = "calendar") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <BookingsPageView />
      </I18nProvider>
    </QueryClientProvider>,
  );
  if (view === "calendar" && state.settings) {
    fireEvent.click(await screen.findByRole("tab", { name: /^(Calendar|التقويم)$/ }));
  }
  return result;
}

describe("the bookings page", () => {
  it("asks a store without rules to set them up first", async () => {
    state.settings = null;
    await renderPage("agenda");
    fireEvent.click(await screen.findByRole("button", { name: "Set booking rules" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(state.saveBookingSettings).toHaveBeenCalledWith("b1", DEFAULT_BOOKING_RULES),
    );
  });

  // The rules dialog renders many fields: slow when the whole suite runs at once.
  it("saves travel fees: a default and one area's own", { timeout: 15_000 }, async () => {
    state.areaFees = { hidd: 12 };
    await renderPage();
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
    await renderPage();
    expect(await screen.findByText("October 2026")).toBeInTheDocument();
    const full = await screen.findByRole("gridcell", { name: /12 October: Fully booked/ });
    expect(full).toBeInTheDocument();
    // A day with only a request waiting reads, and is coloured, apart from a confirmed one.
    const waiting = screen.getByRole("gridcell", {
      name: /15 October: Available · 1 awaiting your confirmation/,
    });
    expect(waiting).toBeInTheDocument();
    expect(waiting.className).toContain("bg-warning-subtle");
    expect(full.className).not.toContain("bg-warning-subtle");
    expect(screen.getByText("Awaiting your confirmation (request or payment)")).toBeInTheDocument();
    expect(screen.getByText("Booking requests (1)")).toBeInTheDocument();
  });

  it("opens a day with its bookings, times in the store's timezone", async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole("gridcell", { name: /12 October/ }));
    expect(await screen.findByText("Sara")).toBeInTheDocument();
    expect(screen.getByText("6:00 PM – 9:00 PM")).toBeInTheDocument();
    expect(screen.getByText("Juffair")).toBeInTheDocument();
  });

  it("confirms a request from the list", async () => {
    await renderPage();
    const list = (await screen.findByText("Booking requests (1)")).closest("section")!;
    fireEvent.click(within(list).getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(state.setBookingStatus).toHaveBeenCalledWith("r1", "confirmed", undefined),
    );
  });

  it("blocks a day", async () => {
    await renderPage();
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
    await renderPage();
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
    await renderPage();
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
    await renderPage();
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
    await renderPage();
    expect(await screen.findByText(/Bookings are off for this store/)).toBeInTheDocument();
  });

  it("reads right to left in Arabic", async () => {
    localStorage.setItem("lang", "ar");
    const { container } = await renderPage();
    expect(await screen.findByRole("button", { name: "الشهر السابق" })).toBeInTheDocument();
    expect(container.querySelector("[dir='rtl']")).not.toBeNull();
  });
});

describe("finishing and cancelling a booking", () => {
  // Today, 1 October: a booking that started at 09:00 in Bahrain, with its order.
  const order = (over: Record<string, unknown> = {}) => ({
    id: "o1",
    invoice_number: 1042,
    public_invoice_token: "tok",
    status: "confirmed",
    payment_status: "partially_paid",
    total: 100,
    advance_paid: 40,
    currency: "BHD",
    ...over,
  });
  const today = (over: Record<string, unknown>) =>
    booking({
      id: "t1",
      event_date: "2026-10-01",
      starts_at: "2026-10-01T06:00:00Z",
      ends_at: "2026-10-01T08:00:00Z",
      orders: order(),
      ...over,
    });

  it("marks a started booking done through its order, collecting what is still owed", async () => {
    state.bookings = [today({})];
    await renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Mark done" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Sara still owes BHD 60\.000/)).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^Collect BHD\s60\.000 & complete$/ }),
    );
    await waitFor(() => expect(state.courierCompleteDelivery).toHaveBeenCalledWith("o1", 60, null));
    // The booking follows its order (sync_bookings_with_order): it is not written apart.
    expect(state.setBookingStatus).not.toHaveBeenCalled();
    expect(state.updateOrder).not.toHaveBeenCalled();
  });

  it("completes a paid booking's order with nothing to collect", async () => {
    state.bookings = [today({ orders: order({ payment_status: "paid", advance_paid: 100 }) })];
    await renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Mark done" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Service done" }));
    await waitFor(() =>
      expect(state.updateOrder).toHaveBeenCalledWith(
        "b1",
        "o1",
        expect.objectContaining({ status: "completed", fulfillment_status: "COMPLETED" }),
      ),
    );
    expect(state.courierCompleteDelivery).not.toHaveBeenCalled();
  });

  it("offers no Mark done before the booking's time", async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole("gridcell", { name: /12 October/ }));
    expect(await screen.findByText("Sara")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark done" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("asks before cancelling, keeps the reason and says what was paid", async () => {
    state.bookings = [today({})];
    await renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Its invoice is cancelled with it/)).toBeInTheDocument();
    expect(within(dialog).getByText(/The customer has paid BHD 40\.000/)).toBeInTheDocument();
    expect(state.setBookingStatus).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Reason (optional)"), {
      target: { value: "  Event moved abroad " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
    await waitFor(() =>
      expect(state.setBookingStatus).toHaveBeenCalledWith("t1", "cancelled", "Event moved abroad"),
    );
  });

  it("asks before declining a request", async () => {
    await renderPage();
    const list = (await screen.findByText("Booking requests (1)")).closest("section")!;
    fireEvent.click(within(list).getByRole("button", { name: "Decline" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Decline" }));
    await waitFor(() =>
      expect(state.setBookingStatus).toHaveBeenCalledWith("r1", "cancelled", undefined),
    );
  });

  it("tells a store that takes neither a card nor BenefitPay that its deposit is not asked", async () => {
    state.settings = { ...DEFAULT_BOOKING_RULES, deposit_percent: 20 };
    await renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Booking rules" }));
    expect(
      await screen.findByText(
        /Your store takes neither a card nor BenefitPay, so no deposit is asked/,
      ),
    ).toBeInTheDocument();
  });

  it("leaves a hold whose time ran out off its day, as an expired one", async () => {
    state.bookings = [
      today({ status: "hold", hold_expires_at: "2026-10-01T08:00:00Z", orders: null }),
    ];
    await renderPage();
    expect(await screen.findByText("No bookings on this day.")).toBeInTheDocument();
    expect(screen.queryByText("Awaiting payment")).toBeNull();
  });
});

describe("the agenda, reminders and moving a booking", () => {
  // Tomorrow (2 October) at 18:00 in Bahrain for three hours, with its order part paid.
  const tomorrow = (over: Record<string, unknown> = {}) =>
    booking({
      id: "t2",
      order_id: "o1",
      event_date: "2026-10-02",
      starts_at: "2026-10-02T15:00:00Z",
      ends_at: "2026-10-02T18:00:00Z",
      orders: {
        id: "o1",
        invoice_number: 1042,
        public_invoice_token: "tok",
        status: "confirmed",
        payment_status: "partially_paid",
        total: 100,
        advance_paid: 40,
        currency: "BHD",
      },
      ...over,
    });

  it("opens on today and the next six days, with tomorrow's reminders to send", async () => {
    state.bookings = [tomorrow()];
    await renderPage("agenda");
    expect(await screen.findByText("1 booking tomorrow still to remind.")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
    // Seven days, each listed; the free ones say so.
    expect(screen.getAllByText("Free")).toHaveLength(6);
    expect(screen.getByText(/Still to pay/)).toBeInTheDocument();

    const remind = screen.getByRole("link", { name: "Remind of the date" });
    const href = decodeURIComponent(remind.getAttribute("href") ?? "");
    expect(href).toContain("https://wa.me/97339001122?text=");
    expect(href).toContain("A reminder from Booth of your booking tomorrow (BK-AAAAAA)");
    expect(href).toMatch(/Still to pay: BHD\s60\.000/);
    fireEvent.click(remind);
    await waitFor(() =>
      expect(state.recordBookingReminder).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ id: "t2", reference: "BK-AAAAAA" }),
      ),
    );
  });

  it("reads a booking already reminded as reminded, and offers to send it again", async () => {
    state.bookings = [tomorrow()];
    state.reminded = new Map([["t2", "2026-10-01T08:00:00Z"]]);
    await renderPage("agenda");
    expect(await screen.findByText("Reminded")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Remind again" })).toBeInTheDocument();
    expect(screen.queryByText(/still to remind/)).toBeNull();
  });

  it("opens a day of the agenda in the calendar", async () => {
    state.bookings = [tomorrow()];
    await renderPage("agenda");
    const day = (await screen.findByText("Tomorrow")).closest("li")!;
    fireEvent.click(within(day).getByRole("button", { name: "Open day" }));
    expect(
      await screen.findByRole("heading", { name: dayTitle("2026-10-02", false) }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Calendar" })).toHaveAttribute("aria-selected", "true");
  });

  it("moves a booking keeping its length, moves its order's note, and offers to tell the customer", async () => {
    state.bookings = [tomorrow()];
    await renderPage("agenda");
    fireEvent.click(await screen.findByRole("button", { name: "Move" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Same length: 3 hours/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("New date"), {
      target: { value: "2026-10-05" },
    });
    fireEvent.change(within(dialog).getByLabelText("Start"), { target: { value: "17:00" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move booking" }));
    await waitFor(() =>
      expect(state.rescheduleBooking).toHaveBeenCalledWith({
        bookingId: "t2",
        day: "2026-10-05",
        start: "17:00",
        durationMinutes: 180,
        allowOverbook: false,
      }),
    );
    expect(state.moveBookingOrderNote).toHaveBeenCalledWith(
      "b1",
      "o1",
      "BK-AAAAAA",
      "📅 BK-AAAAAA · 2026-10-05 · 17:00–20:00",
    );
    expect(await within(dialog).findByText(/Moved to/)).toBeInTheDocument();
    const tell = within(dialog).getByRole("link", { name: "Tell the customer on WhatsApp" });
    expect(decodeURIComponent(tell.getAttribute("href") ?? "")).toContain(
      "Your booking with Booth (BK-AAAAAA) has moved",
    );
  });

  it("offers to move it anyway when the new day has no place", async () => {
    state.bookings = [tomorrow()];
    state.rescheduleBooking.mockRejectedValueOnce(new Error("BOOKING_DAY_FULL"));
    await renderPage("agenda");
    fireEvent.click(await screen.findByRole("button", { name: "Move" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("New date"), {
      target: { value: "2026-10-05" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move booking" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("That day is fully booked.");
    const move = within(dialog).getByRole("button", { name: "Move booking" });
    expect(move).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(move);
    await waitFor(() =>
      expect(state.rescheduleBooking).toHaveBeenLastCalledWith(
        expect.objectContaining({ allowOverbook: true }),
      ),
    );
  });

  it("says when the new date is past what the store's terms allow", async () => {
    state.bookings = [tomorrow()];
    state.policy = { reschedule_months: 1 };
    await renderPage("agenda");
    fireEvent.click(await screen.findByRole("button", { name: "Move" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("New date"), {
      target: { value: "2026-11-10" },
    });
    expect(
      await within(dialog).findByText(/Your terms allow moving a booking until 2026-11-02/),
    ).toBeInTheDocument();
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
