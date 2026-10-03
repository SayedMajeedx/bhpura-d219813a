import { describe, expect, it } from "vitest";
import { orderChargePlan } from "../src/lib/payments/booking-deposit.server";
import { fakeSupabase } from "./helpers/server-fn";

// What a card payment charges: what the database says the order owes in advance
// (order_advance_due), else a booking's own deposit, else the whole total.

const plan = (
  config: { advance?: unknown; booking?: { deposit_amount: number } | null },
  total: number | string | null = 100,
) => {
  const fake = fakeSupabase({
    rows: { bookings: config.booking ?? null },
    rpc: { order_advance_due: config.advance ?? null },
  });
  return orderChargePlan(fake.supabase as never, { id: "o1", total }, "b1");
};

describe("the card charge for an order", () => {
  it("is the advance the database says the order owes", async () => {
    expect(await plan({ advance: 30 })).toEqual({ kind: "deposit", amount: 30 });
    expect(await plan({ advance: "12.375" }, 41.25)).toEqual({ kind: "deposit", amount: 12.375 });
  });

  it("is the whole total when the advance is the whole total", async () => {
    expect(await plan({ advance: 100 })).toEqual({ kind: "full", amount: 100 });
  });

  it("uses the advance over a booking's own deposit", async () => {
    expect(await plan({ advance: 50, booking: { deposit_amount: 10 } })).toEqual({
      kind: "deposit",
      amount: 50,
    });
  });

  it("falls back to a booking's deposit, then to the whole total, when nothing is owed in advance", async () => {
    expect(await plan({ advance: null, booking: { deposit_amount: 20 } })).toEqual({
      kind: "deposit",
      amount: 20,
    });
    expect(await plan({ advance: null })).toEqual({ kind: "full", amount: 100 });
    expect(await plan({ advance: 0 })).toEqual({ kind: "full", amount: 100 });
  });

  it("asks the database about this order and no other", async () => {
    const fake = fakeSupabase({ rpc: { order_advance_due: 30 } });
    await orderChargePlan(fake.supabase as never, { id: "o-77", total: 100 }, "b1");
    expect(fake.supabase.rpc).toHaveBeenCalledWith("order_advance_due", { p_order_id: "o-77" });
  });
});
