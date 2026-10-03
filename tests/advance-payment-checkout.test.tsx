import React from "react";
import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCheckoutFulfillment } from "../src/features/checkout/hooks/use-checkout-fulfillment";
import { placeOrderFailure } from "../src/features/checkout/lib/place-order";

// The advance-payment rule at checkout: cash on delivery is not offered, the
// customer sees what to pay now and what stays due, and the database's refusal
// reads in plain words.

const state = vi.hoisted(() => ({
  settings: { advance_payment_enabled: true, advance_payment_percent: 30 } as {
    advance_payment_enabled: boolean;
    advance_payment_percent: number;
  },
  lang: "en" as "en" | "ar",
}));
const storefrontMock = vi.hoisted(() => () => ({
  useStorefront: () => ({ settings: state.settings, lang: state.lang }),
  formatPrice: (n: number) => `BHD ${n.toFixed(3)}`,
}));
vi.mock("../src/lib/storefront-context", storefrontMock);
vi.mock("@/lib/storefront-context", storefrontMock);

const { AdvancePaymentNotice } =
  await import("../src/features/checkout/components/AdvancePaymentNotice");

beforeEach(() => {
  state.settings = { advance_payment_enabled: true, advance_payment_percent: 30 };
  state.lang = "en";
  sessionStorage.clear();
});

describe("the checkout's payment methods under the advance rule", () => {
  const shop = (advance: boolean) =>
    ({
      delivery_enabled: true,
      pickup_enabled: true,
      digital_delivery_enabled: false,
      delivery_fee: 2,
      cod_enabled: true,
      card_enabled: true,
      benefit_enabled: true,
      shipping_zones: [],
      advance_payment_enabled: advance,
    }) as unknown as Parameters<typeof useCheckoutFulfillment>[0]["settings"];
  const ids = (advance: boolean, appointment?: { travelFee: number }) =>
    renderHook(() =>
      useCheckoutFulfillment({ settings: shop(advance), lang: "en", appointment }),
    ).result.current.availableMethods.map((m) => m.id);

  it("takes cash on delivery away for a shop, and for a booking's pay-on-the-day", () => {
    expect(ids(true)).toEqual(["card", "benefit"]);
    expect(ids(true, { travelFee: 5 })).toEqual(["card", "benefit"]);
  });

  it("keeps all three while the rule is off", () => {
    expect(ids(false)).toEqual(["cod", "card", "benefit"]);
  });
});

describe("the advance notice", () => {
  it("says what to pay now and the balance due on delivery", () => {
    render(<AdvancePaymentNotice total={100} currency="BHD" />);
    expect(screen.getByRole("note")).toHaveTextContent("Advance payment (30%) due now: BHD 30.000");
    expect(screen.getByRole("note")).toHaveTextContent("Balance BHD 70.000 on delivery");
  });

  it("says the balance is due on the day of the event for a booking, in Arabic too", () => {
    state.lang = "ar";
    render(<AdvancePaymentNotice total={100} currency="BHD" appointment />);
    expect(screen.getByRole("note")).toHaveTextContent("الدفعة المقدمة (30%) تُدفع الآن");
    expect(screen.getByRole("note")).toHaveTextContent("يوم المناسبة");
  });

  it("is a single line at 100% and nothing at all when the rule is off", () => {
    state.settings = { advance_payment_enabled: true, advance_payment_percent: 100 };
    const { container, rerender } = render(<AdvancePaymentNotice total={80} currency="BHD" />);
    expect(screen.getByRole("note")).toHaveTextContent("The full amount is paid now: BHD 80.000");
    state.settings = { advance_payment_enabled: false, advance_payment_percent: 30 };
    rerender(<AdvancePaymentNotice total={80} currency="BHD" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the database's refusal of cash on delivery", () => {
  it("reads as a request to pay an advance by card or BenefitPay", () => {
    const t = (ar: string, en: string) => en;
    const failure = placeOrderFailure("ADVANCE_PAYMENT_REQUIRED", t);
    expect(failure.message).toMatch(/advance payment by card or BenefitPay/);
    expect(failure.clearPromo).toBe(false);
  });
});
