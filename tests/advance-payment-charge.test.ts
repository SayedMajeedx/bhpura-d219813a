import { describe, expect, it } from "vitest";
import { orderChargePlan } from "../src/lib/payments/booking-deposit.server";
import { fakeSupabase } from "./helpers/server-fn";

// What a card payment charges under the advance-payment rule: the percentage kept
// on the order, else a booking's own deposit, else the whole total.

const plan = (rows: Record<string, unknown>, total: number | string | null = 100) =>
  orderChargePlan(fakeSupabase({ rows }).supabase as never, { id: "o1", total }, "b1");

describe("the card charge for an order", () => {
  it("is the advance share of the total when the order was placed under the rule", async () => {
    expect(await plan({ orders: { advance_percent: 30 }, bookings: null })).toEqual({
      kind: "deposit",
      amount: 30,
    });
    // Rounded up to the fils, like depositOf.
    expect(await plan({ orders: { advance_percent: 30 } }, 41.25)).toEqual({
      kind: "deposit",
      amount: 12.375,
    });
    expect(await plan({ orders: { advance_percent: "25.00" } }, "80")).toEqual({
      kind: "deposit",
      amount: 20,
    });
  });

  it("charges everything at 100%", async () => {
    expect(await plan({ orders: { advance_percent: 100 } })).toEqual({ kind: "full", amount: 100 });
  });

  it("uses the stored percentage over a booking's own deposit", async () => {
    expect(
      await plan({ orders: { advance_percent: 50 }, bookings: { deposit_amount: 10 } }),
    ).toEqual({ kind: "deposit", amount: 50 });
  });

  it("falls back to a booking's deposit, then to the whole total, when no rule applied", async () => {
    expect(
      await plan({ orders: { advance_percent: null }, bookings: { deposit_amount: 20 } }),
    ).toEqual({
      kind: "deposit",
      amount: 20,
    });
    expect(await plan({ orders: { advance_percent: null }, bookings: null })).toEqual({
      kind: "full",
      amount: 100,
    });
    expect(await plan({ orders: null, bookings: null })).toEqual({ kind: "full", amount: 100 });
  });
});
