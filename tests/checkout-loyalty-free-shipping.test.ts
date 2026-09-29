import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Bug #37: a loyalty tier with free shipping must give it at checkout, to the
// signed-in member only, and only while the store's program is on.

const state = vi.hoisted(() => ({
  program: { is_enabled: true } as Record<string, unknown> | null,
  account: { current_tier_key: "gold", active_points: 0 } as Record<string, unknown> | null,
  tier: { tier_key: "gold", free_shipping: true, points_multiplier: 1 } as Record<
    string,
    unknown
  > | null,
}));
const loyalty = {
  fetchLoyaltyProgram: vi.fn(async () => state.program),
  fetchLoyaltyAccount: vi.fn(async () => state.account),
  fetchLoyaltyTier: vi.fn(async () => state.tier),
};
vi.mock("../src/lib/data/loyalty", () => loyalty);
vi.mock("@/lib/data/loyalty", () => loyalty);
const loyaltyFunctions = { calculateOrderLoyaltyPoints: () => 0 };
vi.mock("../src/lib/loyalty.functions", () => loyaltyFunctions);
vi.mock("@/lib/loyalty.functions", () => loyaltyFunctions);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { useCheckoutLoyalty } = await import("../src/features/checkout/hooks/use-checkout-loyalty");

const render = (customerId: string | null) =>
  renderHook(() =>
    useCheckoutLoyalty({
      brand: { id: "b1" },
      customerId,
      cartTotal: 40,
      promoDiscount: 0,
      currency: "BHD",
      lang: "en",
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  state.program = { is_enabled: true };
  state.account = { current_tier_key: "gold", active_points: 0 };
  state.tier = { tier_key: "gold", free_shipping: true, points_multiplier: 1 };
});

describe("free shipping for loyalty members", () => {
  it("gives a member whose tier has it free shipping", async () => {
    const { result } = render("c1");
    await waitFor(() => expect(result.current.freeShipping).toBe(true));
    expect(loyalty.fetchLoyaltyTier).toHaveBeenCalledWith("b1", "gold");
  });

  it("gives none to a shopper who is not signed in", async () => {
    const { result } = render(null);
    await waitFor(() => expect(loyalty.fetchLoyaltyProgram).toHaveBeenCalled());
    expect(result.current.freeShipping).toBe(false);
    expect(loyalty.fetchLoyaltyAccount).not.toHaveBeenCalled();
  });

  it("gives none when the tier has no such perk or the program is off", async () => {
    state.tier = { tier_key: "silver", free_shipping: false, points_multiplier: 1 };
    const silver = render("c1");
    await waitFor(() => expect(loyalty.fetchLoyaltyTier).toHaveBeenCalled());
    expect(silver.result.current.freeShipping).toBe(false);

    state.tier = { tier_key: "gold", free_shipping: true, points_multiplier: 1 };
    state.program = { is_enabled: false };
    const off = render("c1");
    await waitFor(() => expect(loyalty.fetchLoyaltyTier).toHaveBeenCalledTimes(2));
    expect(off.result.current.freeShipping).toBe(false);
  });
});
