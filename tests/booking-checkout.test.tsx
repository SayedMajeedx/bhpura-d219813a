import React from "react";
import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookingCartLines,
  bookingOfCart,
  holdSecondsLeft,
  type BookingHold,
} from "../src/lib/bookings/cart";

// A shop store's booking at checkout: the held services in the cart, the
// banner with the hold's countdown, the order that finishes the booking, and
// the messages when it cannot.

const state = vi.hoisted(() => ({
  cart: [] as unknown[],
  rpc: vi.fn(async (_name: string, _args: unknown) => ({
    data: { order_id: "o1", confirmation_email_token: "t1" },
    error: null,
  })),
}));
const client = { supabase: { rpc: state.rpc } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);
const storefront = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => ({ cart: state.cart, lang: "en" }),
});
vi.mock("../src/lib/storefront-context", (io) => storefront(io));
vi.mock("@/lib/storefront-context", (io) => storefront(io));

const { BookingHoldBanner } =
  await import("../src/features/storefront-booking/components/BookingHoldBanner");
const { placeStorefrontOrder } = await import("../src/lib/data/checkout");
const { placeOrderFailure } = await import("../src/features/checkout/lib/place-order");
const { productFormFrom } = await import("../src/features/inventory/lib/product-form");
const { getVerticalVocabularyOverrides } = await import("../src/lib/store-vocabulary");

const hold: BookingHold = {
  booking_id: "bk1",
  hold_token: "tok-1",
  reference: "BK-HOLD01",
  event_date: "2026-10-10",
  hold_expires_at: "2026-10-01T09:15:00Z",
  total: 90,
  items: [
    { product_id: "p1", variant_id: "v1", quantity: 1, unit_price: 55 },
    { product_id: "p2", variant_id: "v2", quantity: 1, unit_price: 35 },
  ],
};
const services = [
  { id: "p1", name: "Photo booth", name_ar: "فوتوبوث", name_en: "Photo booth", image_url: "a.jpg" },
  { id: "p2", name: "Prints", name_ar: null, name_en: null, image_url: null },
];
const lines = bookingCartLines(
  hold,
  { day: "2026-10-10", start: "18:00", durationMinutes: 180 },
  services,
);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T09:05:30Z"));
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  state.rpc.mockClear();
  state.cart = lines;
});

describe("the booking in the cart", () => {
  it("adds each booked service at the database's price, carrying the booking", () => {
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      variant_id: "v1",
      product_id: "p1",
      name: "Photo booth",
      image: "a.jpg",
      price: 55,
      qty: 1,
      booking: {
        id: "bk1",
        token: "tok-1",
        reference: "BK-HOLD01",
        day: "2026-10-10",
        start: "18:00",
        durationMinutes: 180,
        expiresAt: "2026-10-01T09:15:00Z",
      },
    });
    expect(new Set(lines.map((line) => line.cart_line_id)).size).toBe(2);
    expect(bookingOfCart(lines)?.id).toBe("bk1");
    expect(bookingOfCart([])).toBeNull();
  });

  it("counts the hold down to zero", () => {
    expect(holdSecondsLeft("2026-10-01T09:15:00Z")).toBe(570);
    expect(holdSecondsLeft("2026-10-01T09:00:00Z")).toBe(0);
  });

  it("shows the booking and its hold at checkout", () => {
    render(<BookingHoldBanner />);
    expect(screen.getByText(/Saturday 10 October/)).toBeInTheDocument();
    expect(screen.getByText("6:00 PM – 9:00 PM")).toBeInTheDocument();
    expect(screen.getByText("9:30")).toBeInTheDocument();
    expect(screen.getByText("BK-HOLD01")).toBeInTheDocument();
  });

  it("shows nothing when the cart has no booking", () => {
    state.cart = [];
    const { container } = render(<BookingHoldBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the order that finishes the booking", () => {
  const input = { p_brand_slug: "aurora", p_payment_method: "card" as const, p_items: [] };

  it("places a booking's order through place_booking_order, with its hold", async () => {
    const placed = await placeStorefrontOrder(input, { id: "bk1", token: "tok-1" });
    expect(state.rpc).toHaveBeenCalledWith("place_booking_order", {
      ...input,
      p_booking_id: "bk1",
      p_hold_token: "tok-1",
    });
    expect(placed).toEqual({ orderId: "o1", confirmationToken: "t1" });
  });

  it("places any other order as before", async () => {
    await placeStorefrontOrder(input);
    expect(state.rpc).toHaveBeenCalledWith("place_storefront_order", input);
  });

  it("explains a booking the checkout could not finish", () => {
    const t = (_ar: string, en: string) => en;
    expect(placeOrderFailure("BOOKING_HOLD_EXPIRED", t).message).toMatch(/hold ran out/);
    expect(placeOrderFailure("BOOKING_ITEMS_MISMATCH", t).message).toMatch(
      /no longer in your cart/,
    );
    const ar = (arText: string) => arText;
    expect(placeOrderFailure("BOOKING_HOLD_EXPIRED", ar).message).toMatch(/انتهت/);
  });
});

describe("services in a bookings store", () => {
  it("start as made to order, so checkout never waits on stock", () => {
    expect(productFormFrom(null, { madeToOrder: true }).is_made_to_order).toBe(true);
    expect(productFormFrom(null).is_made_to_order).toBe(false);
    expect(
      productFormFrom({ is_made_to_order: false } as never, { madeToOrder: true }).is_made_to_order,
    ).toBe(false);
  });

  it("read as booked for the customer's date", () => {
    expect(getVerticalVocabularyOverrides("services").made_to_order?.en).toBe(
      "Booked for your date",
    );
  });
});
