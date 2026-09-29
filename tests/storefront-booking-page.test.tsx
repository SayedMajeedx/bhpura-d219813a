import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOOKING_RULES, type BookingRules } from "../src/lib/bookings/rules";

// The storefront booking page, rendered with the store and its data faked:
// the store's rules, a month with a booked and a closed day, two services.

const state = vi.hoisted(() => ({
  rules: null as BookingRules | null,
  lang: "en" as "en" | "ar",
  bookings: true,
  mode: "catalog",
  cart: [] as Array<{ cart_line_id: string; booking?: unknown }>,
  addToCart: vi.fn(),
  removeFromCart: vi.fn(),
  navigate: vi.fn(async () => undefined),
  holdBooking: vi.fn(async () => ({
    booking_id: "bk1",
    hold_token: "tok-1",
    reference: "BK-HOLD01",
    event_date: "2026-10-10",
    hold_expires_at: "2026-10-01T09:15:00Z",
    total: 55,
    items: [{ product_id: "p1", variant_id: "v1", quantity: 1, unit_price: 55 }],
  })),
  requestBooking: vi.fn(async () => ({
    reference: "BK-7Q2X9A",
    status: "requested",
    event_date: "2026-10-10",
    starts_at: "2026-10-10T15:00:00Z",
    ends_at: "2026-10-10T19:00:00Z",
    total: 90,
  })),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const fixture = (key: string, value: () => unknown) => ({
  queryKey: ["storefront-booking-test", key],
  queryFn: async () => value(),
});
const bookingsData = {
  bookingsKeys: { all: (brandId: string) => ["storefront-booking-test", brandId] },
  bookingsQueries: {
    publicRules: () => fixture("rules", () => state.rules),
    availability: () =>
      fixture("availability", () => [
        { day: "2026-10-09", state: "full", remaining: 0 },
        { day: "2026-10-10", state: "available", remaining: 1 },
        { day: "2026-10-16", state: "closed", remaining: 0 },
      ]),
  },
  requestBooking: state.requestBooking,
  holdBooking: state.holdBooking,
};
vi.mock("../src/lib/data/bookings", () => bookingsData);
vi.mock("@/lib/data/bookings", () => bookingsData);
const storefrontData = {
  storefrontQueries: {
    products: () =>
      fixture("products", () => [
        {
          id: "p1",
          name: "Photo booth",
          name_ar: "فوتوبوث",
          name_en: "Photo booth",
          image_url: null,
          product_variants: [{ id: "v1", selling_price: 55 }],
        },
        {
          id: "p2",
          name: "Prints",
          name_ar: "طباعة",
          name_en: "Prints",
          image_url: null,
          product_variants: [{ id: "v2", selling_price: 35 }],
        },
      ]),
  },
};
vi.mock("../src/lib/data/storefront", () => storefrontData);
vi.mock("@/lib/data/storefront", () => storefrontData);
const storefront = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => ({
    brand: { id: "b1", slug: "aurora", name_en: "Aurora", name_ar: "أورورا" },
    settings: {
      whatsapp_number: "39990016",
      storefront_mode: state.mode,
      catalog_show_prices: true,
    },
    cart: state.cart,
    addToCart: state.addToCart,
    removeFromCart: state.removeFromCart,
    lang: state.lang,
    currency: "BHD",
    t: (ar: string, en: string) => (state.lang === "ar" ? ar : en),
  }),
  useStoreModules: () => ({ bookings: state.bookings }),
});
vi.mock("../src/lib/storefront-context", (io) => storefront(io));
vi.mock("@/lib/storefront-context", (io) => storefront(io));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  Link: ({ children, to, search }: { children: React.ReactNode; to: string; search?: object }) => (
    <a href={`${to}${search ? `?${new URLSearchParams(search as Record<string, string>)}` : ""}`}>
      {children}
    </a>
  ),
}));

const { StorefrontBookingPage } =
  await import("../src/features/storefront-booking/components/StorefrontBookingPage");
const { BookingInvite, BookServiceButton } =
  await import("../src/features/storefront-booking/components/BookingEntryPoints");

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  vi.clearAllMocks();
  state.rules = { ...DEFAULT_BOOKING_RULES };
  state.lang = "en";
  state.bookings = true;
  state.mode = "catalog";
  state.cart = [];
});

const renderWithQuery = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

describe("booking from the storefront", () => {
  it("greys out booked and closed days", async () => {
    renderWithQuery(<StorefrontBookingPage />);
    expect(await screen.findByRole("gridcell", { name: /9 October: Booked/ })).toBeDisabled();
    expect(screen.getByRole("gridcell", { name: /16 October: Unavailable/ })).toBeDisabled();
    expect(screen.getByRole("gridcell", { name: /10 October: Available/ })).toBeEnabled();
  });

  it("walks the four steps and sends the request, then offers WhatsApp", async () => {
    renderWithQuery(<StorefrontBookingPage initialService="p1" />);
    const send = await screen.findByRole("button", { name: "Send booking request" });
    expect(send).toBeDisabled();
    fireEvent.click(await screen.findByRole("gridcell", { name: /10 October: Available/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Prints/ }));
    fireEvent.click(screen.getByRole("button", { name: "4 hours" }));
    fireEvent.click(screen.getByRole("button", { name: "6:00 PM" }));
    expect(screen.getByText(/Until/)).toHaveTextContent("Until 10:00 PM");
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText("WhatsApp number"), { target: { value: "3900 1122" } });
    fireEvent.change(screen.getByLabelText("Event area"), { target: { value: "juffair" } });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    await waitFor(() => expect(state.requestBooking).toHaveBeenCalledTimes(1));
    expect(state.requestBooking).toHaveBeenCalledWith({
      brandId: "b1",
      day: "2026-10-10",
      start: "18:00",
      durationMinutes: 240,
      items: [
        { product_id: "p1", variant_id: "v1", quantity: 1 },
        { product_id: "p2", variant_id: "v2", quantity: 1 },
      ],
      customer: { name: "Sara", phone: "3900 1122" },
      // The label as the customer read it, and the code the travel fees use.
      location: { area: "Juffair", area_code: "juffair" },
      notes: undefined,
    });

    expect(await screen.findByText("BK-7Q2X9A")).toBeInTheDocument();
    const whatsapp = screen.getByRole("link", { name: /Confirm on WhatsApp/ });
    const href = whatsapp.getAttribute("href")!;
    expect(href.startsWith("https://wa.me/97339990016?text=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("Request: BK-7Q2X9A");
    expect(decodeURIComponent(href)).toContain("Services: Photo booth, Prints");
  });

  it("in a shop store, holds the day and takes the services to checkout", async () => {
    state.mode = "shop";
    state.cart = [
      { cart_line_id: "old-booking", booking: { id: "old" } },
      { cart_line_id: "dress" },
    ];
    renderWithQuery(<StorefrontBookingPage initialService="p1" />);
    fireEvent.click(await screen.findByRole("gridcell", { name: /10 October: Available/ }));
    fireEvent.click(screen.getByRole("button", { name: "3 hours" }));
    fireEvent.click(screen.getByRole("button", { name: "6:00 PM" }));
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Sara" } });
    fireEvent.change(screen.getByLabelText("WhatsApp number"), { target: { value: "39001122" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to checkout" }));

    await waitFor(() => expect(state.navigate).toHaveBeenCalledTimes(1));
    expect(state.requestBooking).not.toHaveBeenCalled();
    expect(state.holdBooking).toHaveBeenCalledWith(
      expect.objectContaining({ day: "2026-10-10", start: "18:00", durationMinutes: 180 }),
    );
    // Only the earlier booking's lines make way; other products stay.
    expect(state.removeFromCart).toHaveBeenCalledWith("old-booking");
    expect(state.removeFromCart).not.toHaveBeenCalledWith("dress");
    expect(state.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({
        variant_id: "v1",
        price: 55,
        booking: expect.objectContaining({ id: "bk1", token: "tok-1", reference: "BK-HOLD01" }),
      }),
    );
    expect(state.navigate).toHaveBeenCalledWith({
      to: "/$slug/checkout",
      params: { slug: "aurora" },
    });
  });

  it("says so when the store takes no bookings online", async () => {
    state.rules = null;
    renderWithQuery(<StorefrontBookingPage />);
    expect(await screen.findByText("Booking isn't open")).toBeInTheDocument();
  });

  it("reads right to left in Arabic", async () => {
    state.lang = "ar";
    renderWithQuery(<StorefrontBookingPage />);
    expect(await screen.findByText("احجز موعدك")).toBeInTheDocument();
    expect(await screen.findByRole("gridcell", { name: /9 أكتوبر: محجوز/ })).toBeDisabled();
  });
});

describe("where a booking starts", () => {
  it("invites to book only in stores with bookings", () => {
    const { unmount } = renderWithQuery(<BookingInvite />);
    expect(screen.getByRole("link", { name: "See available dates" })).toHaveAttribute(
      "href",
      "/$slug/book",
    );
    unmount();
    state.bookings = false;
    const { container } = renderWithQuery(<BookServiceButton productId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("books a service straight from its page", () => {
    renderWithQuery(<BookServiceButton productId="p1" />);
    expect(screen.getByRole("link", { name: "Book this service" })).toHaveAttribute(
      "href",
      "/$slug/book?service=p1",
    );
  });
});
