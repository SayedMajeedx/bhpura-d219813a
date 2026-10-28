import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectedAdvance } from "../src/features/orders/lib/expected-advance";
import { AdvanceRequirementNotice } from "../src/features/orders/components/AdvanceRequirementNotice";
import { BenefitReceiptReview } from "../src/features/orders/components/BenefitReceiptReview";

const line = (line_total: number, over: Record<string, unknown> = {}) => ({
  line_total,
  location: "main",
  product_id: "p1",
  ...over,
});

const half = { kind: "percent", value: 50, include_fee: true };

const placed = (over: Record<string, unknown> = {}) => ({
  total: 24,
  shipping: 0,
  fulfillment_method: "pickup",
  advance_rules: [half],
  advance_paid: 0,
  payment_status: "pending",
  status: "pending",
  order_items: [line(24)],
  ...over,
});

describe("what an order was placed to pay now", () => {
  it("reads a 50% advance before the transfer is approved", () => {
    const result = expectedAdvance(placed());
    expect(result?.split.dueNow).toBe(12);
    expect(result?.split.balance).toBe(12);
    expect(result?.split.percent).toBe(50);
    expect(result?.payInFull).toBe(false);
    expect(result?.standing).toBe("awaiting");
  });

  it("reads the shopper's choice to pay in full", () => {
    const result = expectedAdvance(
      placed({ advance_rules: [{ kind: "percent", value: 100, include_fee: true }] }),
    );
    expect(result?.split.dueNow).toBe(24);
    expect(result?.payInFull).toBe(true);
  });

  it("puts the delivery fee in the advance only when the rule asks for it", () => {
    const delivered = placed({ total: 12, shipping: 2, fulfillment_method: "delivery" });
    expect(expectedAdvance({ ...delivered, order_items: [line(10)] })?.split.dueNow).toBe(6);
    const noFee = [{ kind: "percent", value: 50, include_fee: false }];
    expect(
      expectedAdvance({ ...delivered, advance_rules: noFee, order_items: [line(10)] })?.split
        .dueNow,
    ).toBe(5);
  });

  it("falls back to the percentage of an order placed before rules were kept on it", () => {
    const result = expectedAdvance(
      placed({ advance_rules: null, advance_percent: 30, advance_scope: "all", total: 10 }),
      undefined,
    );
    expect(result?.split.dueNow).toBe(3);
  });

  it("says nothing about an order no rule reached, a cancelled one or a refunded one", () => {
    expect(expectedAdvance(placed({ advance_rules: null, advance_percent: null }))).toBeNull();
    expect(expectedAdvance(placed({ advance_rules: [] }))).toBeNull();
    expect(expectedAdvance(placed({ status: "cancelled" }))).toBeNull();
    expect(expectedAdvance(placed({ payment_status: "refunded" }))).toBeNull();
    expect(expectedAdvance(null)).toBeNull();
  });

  it("asks a made-to-order rule only of the made-to-order lines", () => {
    const mto = [{ kind: "percent", value: 50, made_to_order: true, include_fee: false }];
    const result = expectedAdvance(
      placed({
        advance_rules: mto,
        total: 30,
        order_items: [line(10), line(20, { location: "custom", product_id: "p2" })],
      }),
    );
    expect(result?.split.dueNow).toBe(10);
    expect(result?.split.balance).toBe(20);
  });

  it("needs the products' categories to read a category rule, and does not guess without them", () => {
    const rule = [{ kind: "percent", value: 50, category_slugs: ["abayas"], include_fee: false }];
    const order = placed({ advance_rules: rule });
    expect(expectedAdvance(order)).toBeNull();
    expect(expectedAdvance(order, () => "abayas")?.split.dueNow).toBe(12);
    expect(expectedAdvance(order, () => "scarves")).toBeNull();
  });

  it("reads a booking's own deposit when no advance is asked", () => {
    const result = expectedAdvance(
      placed({
        advance_rules: null,
        fulfillment_method: "appointment",
        bookings: [{ deposit_amount: 8 }],
      }),
    );
    expect(result?.isDeposit).toBe(true);
    expect(result?.split.dueNow).toBe(8);
    expect(result?.split.balance).toBe(16);
  });

  it("follows what has been collected", () => {
    expect(expectedAdvance(placed({ payment_status: "partially_paid" }))?.standing).toBe(
      "advance_paid",
    );
    expect(expectedAdvance(placed({ payment_status: "paid" }))?.standing).toBe("paid");
  });
});

describe("the advance notice on the order page", () => {
  it("tells staff what approving the transfer will record", () => {
    const expected = expectedAdvance(placed());
    if (!expected) throw new Error("expected an advance");
    render(<AdvanceRequirementNotice expected={expected} currency="BHD" lang="en" />);
    expect(screen.getByText("Advance payment required")).toBeTruthy();
    expect(screen.getByText(/Advance payment \(50%\) due now: .*12\.000/)).toBeTruthy();
    expect(screen.getByText(/Balance .*12\.000 on delivery/)).toBeTruthy();
    expect(screen.getByText(/records .*12\.000.* only/)).toBeTruthy();
    expect(screen.getByText("Not collected yet")).toBeTruthy();
  });

  it("says so in Arabic and for an order paid in full", () => {
    const expected = expectedAdvance(
      placed({ advance_rules: [{ kind: "percent", value: 100, include_fee: true }] }),
    );
    if (!expected) throw new Error("expected an advance");
    render(<AdvanceRequirementNotice expected={expected} currency="BHD" lang="ar" />);
    expect(screen.getByText("العميل يدفع المبلغ كاملاً الآن")).toBeTruthy();
    expect(screen.getByText("لم تُحصَّل بعد")).toBeTruthy();
  });

  it("names the appointment's balance as due on the day", () => {
    const expected = expectedAdvance(placed({ fulfillment_method: "appointment" }));
    if (!expected) throw new Error("expected an advance");
    render(<AdvanceRequirementNotice expected={expected} currency="BHD" lang="en" appointment />);
    expect(screen.getByText(/on the day of the booking/)).toBeTruthy();
  });

  it("shows the amount a transfer receipt should match beside the approve button", () => {
    const expected = expectedAdvance(placed());
    render(
      <BenefitReceiptReview
        currency="BHD"
        expected={expected}
        approveBenefitPayment={vi.fn()}
        approvingBenefit={false}
        lang="en"
        order={placed({ payment_method: "benefit" }) as never}
        receiptViewQ={{ isLoading: false, data: null } as never}
        rejectBenefitPayment={vi.fn()}
        rejectReason=""
        rejectReasonOpen={false}
        rejectingBenefit={false}
        setRejectReason={vi.fn()}
        setRejectReasonOpen={vi.fn()}
      />,
    );
    expect(screen.getByText(/Amount the receipt should show: .*12\.000/)).toBeTruthy();
    expect(screen.getByText(/12\.000.* stays due/)).toBeTruthy();
  });
});
