import React from "react";
import { QueryClient, QueryClientProvider, queryOptions } from "@tanstack/react-query";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getOrderWorkflow } from "../src/lib/order-workflow";
import { getFulfillmentBadgeDetails } from "../src/lib/status-labels";
import {
  appointmentText,
  bookingOfOrder,
  fulfillmentMethodText,
} from "../src/lib/bookings/order-appointment";
import { orderSavePayload } from "../src/features/orders/lib/order-save";
import { useCheckoutFulfillment } from "../src/features/checkout/hooks/use-checkout-fulfillment";
import type { Order } from "../src/features/orders/types";

// Services vertical, step S3: an order placed for a booking was packed,
// shipped and "delivered" like a dress, and its list row never said when the
// appointment was; the checkout charged a travel fee it never showed.

const NOW = new Date("2026-10-08T12:00:00Z");
const past = { starts_at: "2026-10-08T09:00:00Z" };
const future = { starts_at: "2026-10-09T15:00:00Z" };

const appointment = (overrides: Record<string, unknown> = {}) => ({
  status: "confirmed",
  payment_status: "paid",
  payment_method: "card",
  fulfillment_status: "ON_HOLD",
  fulfillment_method: "appointment",
  total: 90,
  advance_paid: 90,
  bookings: [past],
  ...overrides,
});

describe("an appointment order's workflow", () => {
  it("waits for its day instead of being packed or shipped", () => {
    const early = getOrderWorkflow(appointment({ bookings: [future] }), { now: NOW });
    expect(early.fulfillment).toBe("scheduled");
    expect(early.nextAction).toBe("none");
    expect(early.terminal).toBe(false);
  });

  it("is completed once its time has come, collecting any balance", () => {
    expect(getOrderWorkflow(appointment(), { now: NOW }).nextAction).toBe("complete_service");
    // A card deposit paid, the rest due on the day.
    const deposit = getOrderWorkflow(
      appointment({ payment_status: "partially_paid", advance_paid: 20 }),
      { now: NOW },
    );
    expect(deposit.nextAction).toBe("collect_and_complete_service");
    // Cash on the day.
    const cash = getOrderWorkflow(
      appointment({ payment_method: "cod", payment_status: "unpaid", advance_paid: 0 }),
      { now: NOW },
    );
    expect(cash.nextAction).toBe("collect_and_complete_service");
  });

  it("is not blocked by a booking it can't see, and a transfer is validated first", () => {
    expect(getOrderWorkflow(appointment({ bookings: [] }), { now: NOW }).nextAction).toBe(
      "complete_service",
    );
    const transfer = getOrderWorkflow(
      appointment({ payment_method: "benefit", payment_status: "unpaid", advance_paid: 0 }),
      { now: NOW },
    );
    expect(transfer.nextAction).toBe("validate_payment");
  });

  it("ends when completed or cancelled, and leaves other orders alone", () => {
    expect(
      getOrderWorkflow(appointment({ status: "completed", fulfillment_status: "COMPLETED" }), {
        now: NOW,
      }).terminal,
    ).toBe(true);
    expect(getOrderWorkflow(appointment({ status: "cancelled" }), { now: NOW }).fulfillment).toBe(
      "cancelled",
    );
    const delivery = getOrderWorkflow(appointment({ fulfillment_method: "delivery" }), {
      now: NOW,
    });
    expect(delivery.fulfillment).not.toBe("scheduled");
    expect(delivery.nextAction).toBe("start_packing");
  });
});

describe("an appointment's labels", () => {
  it("reads Scheduled, then Service done, not Delivered", () => {
    expect(getFulfillmentBadgeDetails("SCHEDULED", "en", "appointment").label).toBe("Scheduled");
    expect(getFulfillmentBadgeDetails("scheduled", "ar", "appointment").label).toBe("موعد مجدول");
    expect(getFulfillmentBadgeDetails("COMPLETED", "en", "appointment").label).toBe("Service done");
    expect(getFulfillmentBadgeDetails("COMPLETED", "ar", "appointment").label).toBe(
      "تم تنفيذ الخدمة",
    );
    expect(getFulfillmentBadgeDetails("COMPLETED", "en", "delivery").label).toBe("Delivered");
    expect(getFulfillmentBadgeDetails("COMPLETED", "en", "pickup").label).toBe("Picked Up");
  });

  it("names the method on an invoice", () => {
    expect(fulfillmentMethodText("appointment", true)).toBe("موعد خدمة");
    expect(fulfillmentMethodText("appointment", false)).toBe("Service appointment");
    expect(fulfillmentMethodText("pickup", false)).toBe("Pickup");
    expect(fulfillmentMethodText("digital", true)).toBe("تسليم رقمي");
    expect(fulfillmentMethodText("delivery", false)).toBe("Home delivery");
    expect(fulfillmentMethodText(undefined, false)).toBe("Home delivery");
  });
});

const booking = {
  reference: "BK-7Q2M9X",
  event_date: "2026-10-08",
  starts_at: "2026-10-08T15:00:00Z",
  ends_at: "2026-10-08T18:00:00Z",
  location: { area: "الرفاع", venue: "قاعة الريم" },
};

describe("an order's appointment", () => {
  it("is the first booking the order carries, if complete", () => {
    expect(bookingOfOrder({ bookings: [booking] })).toBe(booking);
    expect(bookingOfOrder({ bookings: [{ event_date: "2026-10-08" }, booking] })).toBe(booking);
    expect(bookingOfOrder({ bookings: [] })).toBeNull();
    expect(bookingOfOrder({})).toBeNull();
    expect(bookingOfOrder(null)).toBeNull();
  });

  it("reads as a day, a time in the store's timezone and a place", () => {
    expect(appointmentText(booking, "Asia/Bahrain", false)).toMatchObject({
      reference: "BK-7Q2M9X",
      time: "6:00 PM – 9:00 PM",
      place: "الرفاع، قاعة الريم",
    });
    expect(appointmentText(booking, "Asia/Bahrain", true).time).toBe("⁧6:00 م⁩ – ⁧9:00 م⁩");
    expect(appointmentText(booking, "UTC", false).time).toBe("3:00 PM – 6:00 PM");
  });
});

describe("saving an appointment order from the editor", () => {
  const totals = {
    subtotal: 90,
    discount: 0,
    taxAmount: 0,
    total: 90,
    advancePaid: 0,
  } as Parameters<typeof orderSavePayload>[1];
  const base = {
    fulfillment_method: "appointment",
    shipping_address_id: "addr-1",
    branch_id: "branch-1",
    notes: null,
  } as Order;

  it("keeps the event's address, which only a delivery used to keep", () => {
    expect(orderSavePayload(base, totals, null, "BHD").shipping_address_id).toBe("addr-1");
    expect(
      orderSavePayload({ ...base, fulfillment_method: "pickup" } as Order, totals, null, "BHD")
        .shipping_address_id,
    ).toBeNull();
  });
});

describe("the checkout of a booking", () => {
  const settings = {
    delivery_enabled: false,
    pickup_enabled: true,
    digital_delivery_enabled: true,
    delivery_fee: 3,
    cod_enabled: true,
    card_enabled: true,
    benefit_enabled: false,
    shipping_zones: [],
  } as unknown as Parameters<typeof useCheckoutFulfillment>[0]["settings"];

  it("asks where the service is, with the travel fee, even when delivery is off", () => {
    const { result } = renderHook(() =>
      useCheckoutFulfillment({ settings, lang: "en", appointment: { travelFee: 5 } }),
    );
    expect(result.current.fulfillmentOptions.map((o) => [o.id, o.en, o.fee])).toEqual([
      ["delivery", "At my venue", 5],
      ["pickup", "At your place", 0],
    ]);
    expect(result.current.fulfillment).toBe("delivery");
    expect(result.current.estimatedDeliveryText).toBe("At your booked time");
    expect(result.current.availableMethods.find((m) => m.id === "cod")?.en).toBe("Pay on the day");
  });

  it("is unchanged for a shop's order", () => {
    const shop = { ...settings, delivery_enabled: true } as typeof settings;
    const { result } = renderHook(() => useCheckoutFulfillment({ settings: shop, lang: "en" }));
    expect(result.current.fulfillmentOptions.map((o) => o.id)).toEqual([
      "delivery",
      "pickup",
      "digital",
    ]);
    expect(result.current.availableMethods.find((m) => m.id === "cod")?.en).toBe(
      "Cash on delivery",
    );
  });
});

const brandCtx = { useBrand: () => ({ id: "b1", slug: "aurora" }) };
vi.mock("../src/lib/brand-context", () => brandCtx);
vi.mock("@/lib/brand-context", () => brandCtx);
const bookingsData = {
  bookingsQueries: {
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
const storefrontCtx = {
  useStorefront: () => ({
    brand: { id: "b1", slug: "aurora" },
    settings: {},
    lang: "en",
    currency: "BHD",
    cart: [],
    t: (_ar: string, en: string) => en,
  }),
  formatPrice: (n: number) => `BHD ${Number(n).toFixed(3)}`,
};
vi.mock("../src/lib/storefront-context", () => storefrontCtx);
vi.mock("@/lib/storefront-context", () => storefrontCtx);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { OrderAppointmentLine } = await import("../src/components/orders/OrderAppointmentLine");
const { renderOrderQueueAction } =
  await import("../src/features/orders/components/order-queue-action");

const withQuery = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

describe("an appointment on the orders list", () => {
  it("shows its day and time on the row, and nothing on other orders", async () => {
    const { container } = withQuery(
      <OrderAppointmentLine order={{ bookings: [booking] }} isAr={false} />,
    );
    expect(await screen.findByText("6:00 PM – 9:00 PM")).toBeTruthy();
    expect(container.textContent).toContain("Thursday");
    const other = withQuery(<OrderAppointmentLine order={{ bookings: [] }} isAr={false} />);
    expect(other.container.textContent).toBe("");
  });

  const ctx = (patch: Record<string, unknown> = {}) =>
    ({
      brandId: "b1",
      hasMadeToOrder: false,
      lang: "en",
      qc: new QueryClient(),
      slug: "aurora",
      updatingOrderId: null,
      setUpdatingOrderId: vi.fn(),
      setFulfillNotes: vi.fn(),
      setIsFulfillModalOpen: vi.fn(),
      setSelectedCourierId: vi.fn(),
      setSelectedFulfillOrder: vi.fn(),
      vocabulary: {},
      ...patch,
    }) as unknown as Parameters<typeof renderOrderQueueAction>[0];
  // The queue uses the real clock: an appointment that started three hours ago.
  const startedAgo = { starts_at: new Date(Date.now() - 3 * 3_600_000).toISOString() };
  const row = (patch: Record<string, unknown> = {}) =>
    ({
      id: "o1",
      ...appointment({ bookings: [startedAgo] }),
      ...patch,
    }) as unknown as Parameters<typeof renderOrderQueueAction>[1];

  it("offers 'Service done' once started, and waits before", () => {
    // Started (past booking), fully paid.
    const done = render(<>{renderOrderQueueAction(ctx(), row())}</>);
    expect(screen.getByRole("button", { name: "Service done" })).toBeTruthy();
    done.unmount();

    // A balance to collect.
    const balance = render(
      <>
        {renderOrderQueueAction(ctx(), row({ payment_status: "partially_paid", advance_paid: 20 }))}
      </>,
    );
    expect(screen.getByRole("button", { name: "Collect & complete" })).toBeTruthy();
    balance.unmount();

    // Its day has not come.
    render(
      <>
        {renderOrderQueueAction(
          ctx(),
          row({ bookings: [{ starts_at: new Date(Date.now() + 5 * 86_400_000).toISOString() }] }),
        )}
      </>,
    );
    expect(screen.getByText("Awaiting appointment")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Service done" })).toBeNull();
    // Never a packing or shipping button.
    expect(screen.queryByRole("button", { name: /pack|ship|deliver/i })).toBeNull();
    fireEvent.click(document.body);
  });
});

const { FulfillmentMethodCard } =
  await import("../src/features/checkout/components/FulfillmentMethodCard");
const { OrderSummaryCard } = await import("../src/features/checkout/components/OrderSummaryCard");
type FulfillmentProps = React.ComponentProps<typeof FulfillmentMethodCard>;
type FulfillmentOptions = FulfillmentProps["fulfillmentOptions"];
type FulfillmentSettings = FulfillmentProps["settings"];

describe("the checkout of a booking, as the customer reads it", () => {
  const t = (_ar: string, en: string) => en;
  const cartBooking = {
    id: "b",
    token: "t",
    reference: "BK-DEMO01",
    day: "2026-10-15",
    start: "18:00",
    durationMinutes: 240,
    expiresAt: "2026-10-15T00:00:00Z",
    travelFee: 5,
  };
  const options = [
    { id: "delivery", ar: "", en: "At my venue", icon: () => null, fee: 5 },
    { id: "pickup", ar: "", en: "At your place", icon: () => null, fee: 0 },
  ];

  it("asks where the service is, not how it ships", () => {
    render(
      <FulfillmentMethodCard
        appointment
        currency="BHD"
        estimatedDeliveryText="At your booked time"
        fulfillment="delivery"
        fulfillmentOptions={options as unknown as FulfillmentOptions}
        lang="en"
        setFulfillment={vi.fn()}
        settings={{ delivery_estimate_enabled: true } as unknown as FulfillmentSettings}
        t={t}
      />,
    );
    expect(screen.getByRole("heading", { name: "Where is the service?" })).toBeTruthy();
    expect(screen.getByText("At my venue")).toBeTruthy();
    expect(screen.queryByText(/Estimated delivery/)).toBeNull();
  });

  const summary = (appointment: typeof cartBooking | null, shipping: number) =>
    render(
      <OrderSummaryCard
        {...({
          acceptedTerms: false,
          appliedPromo: null,
          applyPromo: vi.fn(),
          availableMethods: [],
          benefitReceipt: null,
          brand: { id: "b1", slug: "aurora" },
          cart: [
            {
              cart_line_id: "l1",
              product_id: "p",
              variant_id: "v",
              name: "Photo booth",
              image: null,
              price: 50,
              size: "4 hours",
              color: null,
              qty: 1,
              max_stock: 99,
            },
          ],
          cartTotal: 50,
          checkingPromo: false,
          currency: "BHD",
          estimatedDeliveryText: "Within 24 - 48 hours in Bahrain",
          estimatedPointsToEarn: 0,
          fulfillment: "delivery",
          fulfillmentOptions: [],
          advance: {
            applies: false,
            percent: 30,
            scope: "all",
            dueNow: 0,
            balance: 0,
            partial: false,
          },
          grandTotal: 50 + shipping,
          handleApplyPoints: vi.fn(),
          handleRemovePoints: vi.fn(),
          lang: "en",
          loyaltyAccount: null,
          loyaltyDiscount: 0,
          loyaltyProgram: null,
          marketingConsent: false,
          method: "cod",
          pointsToRedeemInput: "",
          promoDiscount: 0,
          promoInput: "",
          redeemedPoints: 0,
          setAcceptedTerms: vi.fn(),
          setAppliedPromo: vi.fn(),
          setMarketingConsent: vi.fn(),
          setPointsToRedeemInput: vi.fn(),
          setPromoInput: vi.fn(),
          setShareOpen: vi.fn(),
          shareOpen: false,
          shipping,
          submit: vi.fn(),
          submitting: false,
          t,
          appointment,
        } as unknown as React.ComponentProps<typeof OrderSummaryCard>)}
      />,
    );

  it("shows the appointment and the travel fee, not a delivery estimate", () => {
    const view = summary(cartBooking, 5);
    expect(screen.getByText("Your appointment")).toBeTruthy();
    expect(screen.getByText("6:00 PM – 10:00 PM")).toBeTruthy();
    expect(screen.getByText("Travel fee")).toBeTruthy();
    expect(screen.queryByText("Estimated delivery")).toBeNull();
    expect(screen.queryByText("Delivery fee")).toBeNull();
    view.unmount();

    summary(null, 3);
    expect(screen.getByText("Estimated delivery")).toBeTruthy();
    expect(screen.getByText("Delivery fee")).toBeTruthy();
    expect(screen.queryByText("Your appointment")).toBeNull();
  });
});
