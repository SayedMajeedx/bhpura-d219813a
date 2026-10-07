import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

// Loyalty at checkout is decided by the server: it checks the order is the signed-in shopper's,
// takes the amounts and the idempotency key from the order, and calls the database as the service
// role. The browser can only say which order and how many points.

const state = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
const adminClient = {
  get supabaseAdmin() {
    return state.admin;
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);

const { redeemLoyaltyForOrder, awardLoyaltyForOrder } =
  (await import("../src/lib/loyalty-checkout.functions")) as unknown as {
    redeemLoyaltyForOrder: ServerFn;
    awardLoyaltyForOrder: ServerFn;
  };
const middleware = await import("../src/integrations/supabase/auth-middleware");

const ORDER = "00000000-0000-4000-8000-0000000000d1";
const BRAND = "00000000-0000-4000-8000-0000000000b1";

function shopper(ownsOrder: boolean) {
  return fakeSupabase({ rpc: { storefront_user_owns_order: ownsOrder } });
}
function server(results: Record<string, unknown>, order: unknown = { brand_id: BRAND }) {
  const rpc = vi.fn(async (name: string) => ({ data: results[name] ?? null, error: null }));
  const fake = fakeSupabase({ rows: { orders: order } });
  state.admin = { ...fake.supabase, rpc };
  return { rpc, fake };
}

beforeEach(() => vi.clearAllMocks());

describe("redeeming points at checkout", () => {
  it("runs only for a signed-in shopper", () => {
    expect(redeemLoyaltyForOrder.middleware).toEqual([middleware.requireSupabaseAuth]);
    expect(awardLoyaltyForOrder.middleware).toEqual([middleware.requireSupabaseAuth]);
  });

  it("does nothing for an order that is not the shopper's", async () => {
    const { rpc } = server({});
    const caller = shopper(false);
    await expect(
      redeemLoyaltyForOrder({ data: { orderId: ORDER, points: 100 }, context: caller }),
    ).rejects.toThrow("FORBIDDEN_ORDER");
    expect(caller.supabase.rpc).toHaveBeenCalledWith("storefront_user_owns_order", {
      p_order_id: ORDER,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("asks the database to take the points and lower the order, with nothing from the browser but the order and the points", async () => {
    const { rpc } = server({
      redeem_loyalty_points_for_order: {
        success: true,
        points_redeemed: 500,
        discount_amount: "5.000",
        new_total: "33.000",
      },
    });
    const result = await redeemLoyaltyForOrder({
      data: { orderId: ORDER, points: 500 },
      context: shopper(true),
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("redeem_loyalty_points_for_order", {
      p_order_id: ORDER,
      p_points: 500,
    });
    expect(result).toEqual({ applied: true, discount: 5, total: 33 });
  });

  it("says it was not applied, with the reason, when the database refuses", async () => {
    server({
      redeem_loyalty_points_for_order: {
        success: false,
        error: "Insufficient active points balance",
      },
    });
    await expect(
      redeemLoyaltyForOrder({ data: { orderId: ORDER, points: 500 }, context: shopper(true) }),
    ).resolves.toEqual({ applied: false, error: "Insufficient active points balance" });
  });

  it("refuses points that are not a whole positive number", () => {
    const validate = (redeemLoyaltyForOrder as unknown as { validate: (raw: unknown) => unknown })
      .validate;
    for (const points of [0, -5, 1.5, 2_000_000, "10", null]) {
      expect(() => validate({ orderId: ORDER, points })).toThrow();
    }
    expect(() => validate({ orderId: "not-an-id", points: 10 })).toThrow();
    expect(() => validate({ orderId: ORDER, points: 10 })).not.toThrow();
  });
});

describe("awarding points for an order", () => {
  it("does nothing for an order that is not the shopper's", async () => {
    const { rpc } = server({});
    await expect(
      awardLoyaltyForOrder({ data: { orderId: ORDER }, context: shopper(false) }),
    ).rejects.toThrow("FORBIDDEN_ORDER");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("makes its key from the order and its brand from the order, so asking again gives nothing more", async () => {
    const { rpc } = server({
      rpc_award_order_loyalty_points: { success: true, points_awarded: 12 },
    });
    for (let i = 0; i < 3; i += 1) {
      await expect(
        awardLoyaltyForOrder({ data: { orderId: ORDER }, context: shopper(true) }),
      ).resolves.toEqual({ awarded: true });
    }
    const keys = rpc.mock.calls.map(
      ([, args]) => (args as { p_idempotency_key: string }).p_idempotency_key,
    );
    expect(new Set(keys)).toEqual(new Set([`award:${ORDER}`]));
    expect(rpc).toHaveBeenCalledWith("rpc_award_order_loyalty_points", {
      p_brand_id: BRAND,
      p_order_id: ORDER,
      p_idempotency_key: `award:${ORDER}`,
    });
  });

  it("reports nothing awarded for an order it cannot find, or when the database says no", async () => {
    server({}, null);
    await expect(
      awardLoyaltyForOrder({ data: { orderId: ORDER }, context: shopper(true) }),
    ).resolves.toEqual({ awarded: false });
    server({ rpc_award_order_loyalty_points: { success: false } });
    await expect(
      awardLoyaltyForOrder({ data: { orderId: ORDER }, context: shopper(true) }),
    ).resolves.toEqual({ awarded: false });
  });
});
