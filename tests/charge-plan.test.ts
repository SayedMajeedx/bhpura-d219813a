import { describe, expect, it } from "vitest";
import {
  alreadySettled,
  chargeMatches,
  chargePlan,
  depositOf,
  fulfillmentPaymentBlock,
  paidOrderUpdate,
} from "../src/lib/payments/charge-plan";

describe("what a card payment charges", () => {
  it("charges a booking's deposit, otherwise the order's total", () => {
    expect(chargePlan(100, 30)).toEqual({ kind: "deposit", amount: 30 });
    expect(chargePlan(100, null)).toEqual({ kind: "full", amount: 100 });
    expect(chargePlan(100, 0)).toEqual({ kind: "full", amount: 100 });
    // A "deposit" as large as the order is just the order.
    expect(chargePlan(100, 100)).toEqual({ kind: "full", amount: 100 });
    expect(chargePlan(100, 150)).toEqual({ kind: "full", amount: 100 });
  });

  it("verifies the charged amount to the fils", () => {
    const plan = chargePlan(100, 30.375);
    expect(chargeMatches("30.375", plan)).toBe(true);
    expect(chargeMatches(30.3755, plan)).toBe(true);
    expect(chargeMatches(30.38, plan)).toBe(false);
    expect(chargeMatches(100, plan)).toBe(false);
    expect(chargeMatches("abc", plan)).toBe(false);
  });

  it("never charges twice: a paid deposit settles a deposit charge", () => {
    const deposit = chargePlan(100, 30);
    const full = chargePlan(100, null);
    expect(alreadySettled("paid", full)).toBe(true);
    expect(alreadySettled("PAID", deposit)).toBe(true);
    expect(alreadySettled("partially_paid", deposit)).toBe(true);
    expect(alreadySettled("partially_paid", full)).toBe(false);
    expect(alreadySettled("unpaid", deposit)).toBe(false);
  });

  it("records a deposit as an advance payment, the rest due", () => {
    expect(paidOrderUpdate(chargePlan(100, 30), "chg_1")).toEqual({
      payment_status: "partially_paid",
      advance_paid: 30,
      status: "confirmed",
      payment_gateway_reference: "chg_1",
    });
    expect(paidOrderUpdate(chargePlan(100, null), "chg_1")).toEqual({
      payment_status: "paid",
      status: "confirmed",
      payment_gateway_reference: "chg_1",
    });
  });

  it("works out a deposit like the database (percent of total, rounded up to the fils)", () => {
    // SQL: ceil(total * percent * 10) / 1000
    expect(depositOf(101.25, 30)).toBe(30.375);
    expect(depositOf(55, 33)).toBe(18.15);
    expect(depositOf(10.001, 50)).toBe(5.001);
    expect(depositOf(100, 0)).toBeNull();
    expect(depositOf(100, 100)).toBeNull();
  });
});

describe("what stops an order from being packed or shipped", () => {
  const base = { isCod: false, adminOverride: false, paid: 0, upfront: null };
  const advance = { kind: "deposit" as const, amount: 30 };

  it("nothing, once the order is paid", () => {
    expect(fulfillmentPaymentBlock({ ...base, paymentStatus: "paid" })).toBeNull();
    expect(fulfillmentPaymentBlock({ ...base, paymentStatus: "PAID" })).toBeNull();
  });

  it("an order nobody has paid for", () => {
    expect(fulfillmentPaymentBlock({ ...base, paymentStatus: "unpaid" })).toBe("unpaid");
    expect(fulfillmentPaymentBlock({ ...base, paymentStatus: null })).toBe("unpaid");
  });

  it("nothing, when the advance the order owed is collected: the balance is due on delivery", () => {
    expect(
      fulfillmentPaymentBlock({
        ...base,
        paymentStatus: "partially_paid",
        paid: "30.000",
        upfront: advance,
      }),
    ).toBeNull();
    // More than the advance is fine too.
    expect(
      fulfillmentPaymentBlock({ ...base, paymentStatus: "partial", paid: 45, upfront: advance }),
    ).toBeNull();
  });

  it("a part payment smaller than the advance", () => {
    expect(
      fulfillmentPaymentBlock({
        ...base,
        paymentStatus: "partially_paid",
        paid: 29.99,
        upfront: advance,
      }),
    ).toBe("partially_paid");
  });

  it("a part payment on an order that owed everything up front, or whose advance is unknown", () => {
    const paidPart = { ...base, paymentStatus: "partially_paid", paid: 30 };
    expect(fulfillmentPaymentBlock({ ...paidPart, upfront: { kind: "full", amount: 62 } })).toBe(
      "partially_paid",
    );
    expect(fulfillmentPaymentBlock({ ...paidPart, upfront: null })).toBe("partially_paid");
  });

  it("nothing for cash on delivery or an admin override, whatever is paid", () => {
    expect(fulfillmentPaymentBlock({ ...base, paymentStatus: "unpaid", isCod: true })).toBeNull();
    expect(
      fulfillmentPaymentBlock({ ...base, paymentStatus: "partially_paid", adminOverride: true }),
    ).toBeNull();
  });
});
