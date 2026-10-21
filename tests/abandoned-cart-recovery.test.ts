import { describe, expect, it } from "vitest";
import {
  cartChatUrl,
  isOpenCart,
  recoveredValue,
  recoverySummary,
  storeRecoveryCode,
  type RecoveryCart,
} from "../src/lib/abandoned-cart-recovery";
import { cartReminderMessage } from "../src/features/outreach/lib/outreach-messages";

// The abandoned-carts screen counts carts that were really left and really came back, and lets
// a person write only to a shopper who agreed. It once counted every checkout as a recovery and
// made a 10% code on every press.

const NOW = new Date("2026-10-21T09:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const cart = (overrides: Partial<RecoveryCart> = {}): RecoveryCart => ({
  status: "abandoned",
  subtotal: 40,
  currency: "BHD",
  marketing_consent: true,
  guest_phone: "33001122",
  abandoned_at: daysAgo(2),
  ...overrides,
});

describe("which carts are open", () => {
  it("are the ones a shopper may still come back to", () => {
    expect(["active", "abandoned", "recovering"].map((status) => isOpenCart({ status }))).toEqual([
      true,
      true,
      true,
    ]);
    for (const status of ["recovered", "converted", "expired", "unsubscribed", null]) {
      expect(isOpenCart({ status })).toBe(false);
    }
  });
});

describe("writing to a shopper", () => {
  it("opens WhatsApp only with their agreement and a number WhatsApp can reach", () => {
    expect(cartChatUrl(cart())).toBe("https://wa.me/97333001122");
    expect(cartChatUrl(cart({ marketing_consent: false }))).toBeNull();
    expect(cartChatUrl(cart({ marketing_consent: null }))).toBeNull();
    expect(cartChatUrl(cart({ guest_phone: null }))).toBeNull();
    expect(cartChatUrl(cart({ guest_phone: null, customers: { phone: "+973 3300 9988" } }))).toBe(
      "https://wa.me/97333009988",
    );
  });

  it("offers a code only when the store chose one", () => {
    expect(storeRecoveryCode(null)).toBeNull();
    expect(
      storeRecoveryCode({ default_discount_type: "none", default_discount_value: 10 }),
    ).toBeNull();
    expect(
      storeRecoveryCode({ default_discount_type: "percentage", default_discount_value: 0 }),
    ).toBeNull();
    expect(
      storeRecoveryCode({ default_discount_type: "percentage", default_discount_value: 150 }),
    ).toBeNull();
    expect(
      storeRecoveryCode({
        default_discount_type: "fixed",
        default_discount_value: "3",
        discount_expiry_hours: 24,
      }),
    ).toEqual({ type: "fixed", value: 3, expiryHours: 24 });
    expect(
      storeRecoveryCode({ default_discount_type: "percentage", default_discount_value: 10 }),
    ).toEqual({ type: "percentage", value: 10, expiryHours: 48 });
  });

  it("writes the same reminder as Clients to message, with the code only when there is one", () => {
    const ctx = {
      storeName: "Pura Line",
      cartLink: (token: string) => `https://pura.boutq.store/checkout?recover=${token}`,
      money: (amount: number, currency: string | null) => `${currency} ${amount.toFixed(3)}`,
    };
    const reminder = {
      name: "Noor Ahmed",
      lines: [{ name: "Abaya", size: "52" }],
      subtotal: 45,
      currency: "BHD",
      token: "t1",
    };
    expect(cartReminderMessage(reminder, "en", ctx)).toBe(
      "Hi Noor, your cart at Pura Line is still saved: Abaya (52), BHD 45.000 in all.\n" +
        "To complete your order: https://pura.boutq.store/checkout?recover=t1",
    );
    const withCode = cartReminderMessage({ ...reminder, code: "BACK10" }, "ar", ctx);
    expect(withCode).toContain("كود خصم خاص لهذه السلة: BACK10");
    expect(withCode).toContain("مرحباً Noor،");
  });
});

describe("the screen's figures", () => {
  it("count a recovery only for a cart that was left and became an order still sold", () => {
    const sold = { total: 52, status: "completed" };
    expect(recoveredValue(cart({ status: "recovered", orders: sold }))).toBe(52);
    expect(
      recoveredValue(cart({ status: "recovered", orders: { total: 52, status: "cancelled" } })),
    ).toBe(0);
    expect(recoveredValue(cart({ status: "converted", orders: sold }))).toBe(0);
  });

  it("cover the carts left in the period, and who can be written to", () => {
    const summary = recoverySummary(
      [
        cart({ subtotal: 40 }),
        cart({ subtotal: 20, marketing_consent: false }),
        cart({ subtotal: 30, status: "recovered", orders: { total: 33, status: "completed" } }),
        cart({ subtotal: 10, status: "expired" }), // left, then emptied
        cart({ subtotal: 99, abandoned_at: daysAgo(45) }), // before the period
        cart({ subtotal: 60, status: "converted", abandoned_at: null }), // never left
      ],
      NOW,
      30,
    );
    expect(summary).toEqual({
      left: 4,
      leftValue: 100,
      recovered: 1,
      recoveredValue: 33,
      rate: 25,
      reachable: 1,
      unreachable: 1,
    });
  });

  it("say nothing was recovered when nothing was left", () => {
    expect(recoverySummary([], NOW).rate).toBe(0);
  });
});
