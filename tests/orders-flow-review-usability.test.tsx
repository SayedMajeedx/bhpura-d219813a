import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The usability part of the owner's review of the orders flow (2026-10-28): an order that has
// waited on the team says so, the discount says what it is made of, "Edit fees & discounts" is one
// tap from view mode, and the Discounts page shows its two kinds one at a time.

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
const profileContext = {
  useProfile: () => ({ canViewFinancials: true }),
  useProfileOptional: () => ({ canViewFinancials: true }),
};
vi.mock("../src/lib/profile-context", () => profileContext);
vi.mock("@/lib/profile-context", () => profileContext);

const { orderWaiting } = await import("../src/features/orders/lib/order-card");
const { OrderWaitingBadge } = await import("../src/features/orders/components/OrderWaitingBadge");
const { discountLines } = await import("../src/features/orders/lib/discount-parts");
const { OrderFinancialCard } = await import("../src/features/orders/components/OrderFinancialCard");
const { orderTotals } = await import("../src/features/orders/lib/order-editor");
const { DiscountsKindSwitcher } = await import("../src/components/discounts/DiscountsKindSwitcher");
const transferLib = await import("../src/features/orders/lib/transfer-approval");
const { PendingTransferReview } =
  await import("../src/features/orders/components/PendingTransferReview");

const NOW = new Date("2026-10-28T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("an order waiting on the team", () => {
  const open = (patch: Record<string, unknown> = {}) => ({
    status: "confirmed",
    fulfillment_status: "NEEDS_PACKING",
    fulfillment_method: "delivery",
    payment_status: "paid",
    payment_method: "card",
    total: 30,
    advance_paid: 30,
    order_items: [{ location: "main" }],
    created_at: daysAgo(10),
    updated_at: daysAgo(3),
    ...patch,
  });

  it("counts from the last change, marks two days, and calls five days late", () => {
    expect(orderWaiting(open(), { now: NOW })).toEqual({ days: 3, late: false });
    expect(orderWaiting(open({ updated_at: daysAgo(1) }), { now: NOW })).toBeNull();
    expect(orderWaiting(open({ updated_at: daysAgo(6) }), { now: NOW })).toEqual({
      days: 6,
      late: true,
    });
  });

  it("is silent when nothing is waiting on the team", () => {
    expect(orderWaiting(open({ fulfillment_status: "COMPLETED" }), { now: NOW })).toBeNull();
    expect(orderWaiting(open({ status: "cancelled" }), { now: NOW })).toBeNull();
    // A card payment still to come is the customer's turn.
    expect(
      orderWaiting(open({ payment_status: "unpaid", advance_paid: 0 }), { now: NOW }),
    ).toBeNull();
    // An appointment before its day.
    expect(
      orderWaiting(
        open({
          fulfillment_method: "appointment",
          bookings: [{ starts_at: new Date(NOW.getTime() + 86_400_000).toISOString() }],
        }),
        { now: NOW },
      ),
    ).toBeNull();
  });

  it("counts an appointment from its day, not from when it was booked", () => {
    const waiting = orderWaiting(
      open({
        fulfillment_method: "appointment",
        created_at: daysAgo(20),
        updated_at: daysAgo(20),
        bookings: [{ starts_at: daysAgo(3) }],
      }),
      { now: NOW },
    );
    expect(waiting).toEqual({ days: 3, late: false });
  });

  it("is a chip that says so in both languages", () => {
    vi.useFakeTimers({ now: NOW });
    const { rerender } = render(<OrderWaitingBadge order={open() as never} lang="en" />);
    expect(screen.getByText("Waiting 3 days")).toBeTruthy();
    rerender(<OrderWaitingBadge order={open() as never} lang="ar" />);
    expect(screen.getByText("بانتظار الإجراء منذ 3 أيام")).toBeTruthy();
    vi.useRealTimers();
  });
});

describe("what a discount is made of, as the summary reads it", () => {
  const order = {
    discount: 20,
    offer_discount: 8,
    loyalty_discount: 2,
    promo_code: "EID10",
    applied_offers: [
      { kind: "percent_off", amount: 8, name_en: "Eid sale", name_ar: "عرض العيد" },
      { kind: "free_delivery", amount: 1, name_en: "Free delivery" },
    ],
  };

  it("lists the offers by name, the points and the code, when more than one made it up", () => {
    expect(discountLines(order, "en")).toEqual([
      { key: "offers", label: "Eid sale", amount: 8 },
      { key: "points", label: "Loyalty points", amount: 2 },
      { key: "code", label: "Promo: EID10", amount: 10 },
    ]);
    expect(discountLines(order, "ar").map((line) => line.label)).toEqual([
      "عرض العيد",
      "نقاط الولاء",
      "رمز EID10",
    ]);
  });

  it("says nothing extra when the whole discount has one source", () => {
    expect(discountLines({ discount: 10, promo_code: "EID10" }, "en")).toEqual([]);
    expect(discountLines({ discount: 5, offer_discount: 5 }, "en")).toEqual([]);
    expect(discountLines(null, "en")).toEqual([]);
  });

  it("calls an amount staff typed a manual discount", () => {
    expect(
      discountLines({ discount: 12, offer_discount: 4 }, "en").map((line) => line.label),
    ).toEqual(["Store offer", "Manual discount"]);
  });
});

describe("the order's money card", () => {
  const card = (props: Record<string, unknown> = {}) =>
    render(
      <OrderFinancialCard
        {...({
          appliedPromo: null,
          benefit: {
            approveBenefitPayment: vi.fn(),
            approvingBenefit: false,
            rejectBenefitPayment: vi.fn(),
            rejectReason: "",
            rejectReasonOpen: false,
            rejectingBenefit: false,
            setRejectReason: vi.fn(),
            setRejectReasonOpen: vi.fn(),
          },
          bomItemsQ: { data: [] },
          checkingPromo: false,
          currency: "BHD",
          discountMode: "fixed",
          discountPercentInput: "",
          isEditingFees: false,
          isReadOnly: true,
          items: [{ line_total: 100, quantity: 1, description: "Abaya", location: "main" }],
          lang: "en",
          mobileTab: "items",
          order: {
            id: "o1",
            payment_method: "cod",
            currency: "BHD",
            order_date: "2026-10-28",
            discount: 20,
            offer_discount: 8,
            loyalty_discount: 2,
            promo_code: "EID10",
            applied_offers: [{ kind: "percent_off", amount: 8, name_en: "Eid sale" }],
            shipping: 0,
            tax_rate: 0,
            total: 80,
            advance_paid: 0,
            status: "pending",
            payment_status: "unpaid",
          },
          packagingMaterialsQ: { data: [] },
          paymentBadge: "unpaid",
          productsQ: { data: [] },
          promoInput: "",
          receiptViewQ: { isLoading: false, data: null },
          setIsEditingFees: vi.fn(),
          storeTaxRate: 0,
          t: (key: string) => key,
          totals: orderTotals([{ line_total: 100 } as never], { discount: 20 }, false),
          variantsQ: { data: [] },
          ...props,
        } as never)}
      />,
    );

  it("shows the offers, the points and the code apart under the discount", () => {
    card();
    expect(screen.getByText("Eid sale")).toBeTruthy();
    expect(screen.getByText("Loyalty points")).toBeTruthy();
    expect(screen.getByText("Promo: EID10")).toBeTruthy();
  });

  it("opens the order for editing and the fees panel in one tap from view mode", () => {
    const onUnlockEditing = vi.fn();
    const setIsEditingFees = vi.fn();
    card({ onUnlockEditing, setIsEditingFees });
    fireEvent.click(screen.getByRole("button", { name: /Edit Fees & Discounts/ }));
    expect(onUnlockEditing).toHaveBeenCalledTimes(1);
    expect(setIsEditingFees).toHaveBeenCalledWith(true);
  });

  it("offers no such button when the order cannot be reopened", () => {
    card();
    expect(screen.queryByRole("button", { name: /Edit Fees & Discounts/ })).toBeNull();
  });

  it("locks the tax field, with the reason, for a store that charges none", () => {
    card({ isReadOnly: false, isEditingFees: true });
    expect(
      screen.getByText("The store charges no tax: add its VAT number in settings."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Charge tax|Make tax-exempt/ })).toBeNull();
  });
});

describe("the Discounts page's two kinds", () => {
  it("shows one kind at a time and switches between them", () => {
    const onKindChange = vi.fn();
    render(
      <DiscountsKindSwitcher
        lang="en"
        kind="codes"
        onKindChange={onKindChange}
        counts={{ codes: 3, offers: 2 }}
        slug="pura"
        bookings={false}
      />,
    );
    expect(screen.getByRole("tab", { name: /Promo codes/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText(/the one that saves more is used/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Automatic offers/ }));
    expect(onKindChange).toHaveBeenCalledWith("offers");
    expect(screen.queryByText(/Booking offers/)).toBeNull();
  });

  it("points a store that books to its booking offers", () => {
    render(
      <DiscountsKindSwitcher
        lang="ar"
        kind="offers"
        onKindChange={vi.fn()}
        counts={{ codes: 0, offers: 0 }}
        slug="aurora"
        bookings
      />,
    );
    expect(screen.getByText(/عروض الحجز/)).toBeTruthy();
  });
});

describe("the transfer receipt on the order page", () => {
  const { receiptOnTop } = transferLib;
  const base = { payment_method: "benefit", benefit_receipt_key: "brands/b/receipts/a.png" };

  it("is at the top while it is still to be checked", () => {
    expect(receiptOnTop({ ...base, payment_status: "unpaid" })).toBe(true);
    expect(receiptOnTop({ ...base, payment_status: "pending" })).toBe(true);
  });

  it("goes down to the money card once approved, in full or as the advance", () => {
    expect(receiptOnTop({ ...base, payment_status: "paid" })).toBe(false);
    expect(receiptOnTop({ ...base, payment_status: "partially_paid" })).toBe(false);
  });

  it("is not there for an order with no receipt or another way of paying", () => {
    expect(receiptOnTop({ payment_method: "benefit", payment_status: "unpaid" })).toBe(false);
    expect(receiptOnTop({ ...base, payment_method: "card", payment_status: "unpaid" })).toBe(false);
    expect(receiptOnTop(null)).toBe(false);
  });

  const benefit = {
    approveBenefitPayment: vi.fn(),
    approvingBenefit: false,
    rejectBenefitPayment: vi.fn(),
    rejectReason: "",
    rejectReasonOpen: false,
    rejectingBenefit: false,
    setRejectReason: vi.fn(),
    setRejectReasonOpen: vi.fn(),
  };
  const top = (order: Record<string, unknown>, mobileTab = "items") =>
    render(
      <PendingTransferReview
        benefit={benefit as never}
        currency="BHD"
        lang="en"
        mobileTab={mobileTab as never}
        order={{ id: "o1", total: 30, ...base, ...order } as never}
        productsQ={{ data: [] } as never}
        receiptViewQ={{ isLoading: false, data: null } as never}
      />,
    );

  it("shows the receipt with the amount it should match and the way to approve it", () => {
    top({
      payment_status: "unpaid",
      advance_rules: [{ kind: "percent", value: 50, include_fee: true }],
      order_items: [{ line_total: 30, location: "main" }],
    });
    expect(screen.getByText("Benefit transfer receipt")).toBeTruthy();
    expect(screen.getByText(/Amount the receipt should show: .*15\.000/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Approve Payment/ })).toBeTruthy();
  });

  it("shows nothing at the top once the payment is approved", () => {
    top({ payment_status: "partially_paid" });
    expect(screen.queryByText("Benefit transfer receipt")).toBeNull();
  });
});
