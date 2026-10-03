import React from "react";
import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCheckoutFulfillment } from "../src/features/checkout/hooks/use-checkout-fulfillment";
import { placeOrderFailure } from "../src/features/checkout/lib/place-order";
import {
  advanceForOrder,
  methodsUnderAdvance,
  type AdvanceOrder,
  type AdvanceRule,
} from "../src/lib/payments/advance-payment";

// The advance-payment rule at checkout: cash on delivery is not offered where the rule
// applies, the customer sees what to pay now and what stays due, and the database's
// refusal reads in plain words.

const state = vi.hoisted(() => ({ lang: "en" as "en" | "ar" }));
const storefrontMock = vi.hoisted(() => () => ({
  useStorefront: () => ({ lang: state.lang }),
  formatPrice: (n: number) => `BHD ${n.toFixed(3)}`,
}));
vi.mock("../src/lib/storefront-context", storefrontMock);
vi.mock("@/lib/storefront-context", storefrontMock);

const { AdvancePaymentNotice } =
  await import("../src/features/checkout/components/AdvancePaymentNotice");

beforeEach(() => {
  state.lang = "en";
  sessionStorage.clear();
});

const rule = (over: Partial<AdvanceRule> = {}): AdvanceRule => ({
  enabled: true,
  percent: 30,
  scope: "all",
  rules: [],
  ...over,
});
const order = (over: Partial<AdvanceOrder> = {}): AdvanceOrder => ({
  total: 100,
  shipping: 0,
  fulfillment: "delivery",
  lines: [{ amount: 100, madeToOrder: false }],
  ...over,
});

describe("the checkout's payment methods", () => {
  const shop = {
    delivery_enabled: true,
    pickup_enabled: true,
    digital_delivery_enabled: false,
    delivery_fee: 2,
    cod_enabled: true,
    card_enabled: true,
    benefit_enabled: true,
    shipping_zones: [],
  } as unknown as Parameters<typeof useCheckoutFulfillment>[0]["settings"];

  it("offers all three; the checkout page takes cash on delivery away only where the rule applies", () => {
    const { result } = renderHook(() => useCheckoutFulfillment({ settings: shop, lang: "en" }));
    const all = result.current.availableMethods;
    expect(all.map((m) => m.id)).toEqual(["cod", "card", "benefit"]);
    // A delivered order under a delivery-only rule: no cash on delivery.
    const delivered = advanceForOrder(order(), rule({ scope: "delivery" }));
    expect(methodsUnderAdvance(all, delivered.applies).map((m) => m.id)).toEqual([
      "card",
      "benefit",
    ]);
    // The same store, a pickup order: the rule does not reach it, so nothing is taken away.
    const pickup = advanceForOrder(order({ fulfillment: "pickup" }), rule({ scope: "delivery" }));
    expect(methodsUnderAdvance(all, pickup.applies).map((m) => m.id)).toEqual([
      "cod",
      "card",
      "benefit",
    ]);
  });
});

describe("the advance notice", () => {
  it("says what to pay now and the balance due on delivery", () => {
    render(<AdvancePaymentNotice split={advanceForOrder(order(), rule())} currency="BHD" />);
    expect(screen.getByRole("note")).toHaveTextContent("Advance payment (30%) due now: BHD 30.000");
    expect(screen.getByRole("note")).toHaveTextContent("Balance BHD 70.000 on delivery");
  });

  it("says the share is of the made-to-order items when only those are covered", () => {
    const split = advanceForOrder(
      order({
        lines: [
          { amount: 60, madeToOrder: true },
          { amount: 40, madeToOrder: false },
        ],
      }),
      rule({ scope: "made_to_order", percent: 50 }),
    );
    render(<AdvancePaymentNotice split={split} currency="BHD" />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Advance payment (50% of the made-to-order items) due now: BHD 30.000",
    );
  });

  it("says the balance is due on the day of the event for a booking, in Arabic too", () => {
    state.lang = "ar";
    render(
      <AdvancePaymentNotice split={advanceForOrder(order(), rule())} currency="BHD" appointment />,
    );
    expect(screen.getByRole("note")).toHaveTextContent("الدفعة المقدمة (30%) تُدفع الآن");
    expect(screen.getByRole("note")).toHaveTextContent("يوم المناسبة");
  });

  it("is a single line at 100% and nothing at all where the rule does not apply", () => {
    const { container, rerender } = render(
      <AdvancePaymentNotice
        split={advanceForOrder(order({ total: 80 }), rule({ percent: 100 }))}
        currency="BHD"
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent("The full amount is paid now: BHD 80.000");
    rerender(
      <AdvancePaymentNotice
        split={advanceForOrder(order({ fulfillment: "pickup" }), rule({ scope: "delivery" }))}
        currency="BHD"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the database's refusal of cash on delivery", () => {
  it("reads as a request to pay an advance by card or BenefitPay", () => {
    const t = (_ar: string, en: string) => en;
    const failure = placeOrderFailure("ADVANCE_PAYMENT_REQUIRED", t);
    expect(failure.message).toMatch(/advance payment by card or BenefitPay/);
    expect(failure.clearPromo).toBe(false);
  });
});
