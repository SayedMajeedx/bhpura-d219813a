import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// What a shopper is told about the store's loyalty programme (found 2026-10-14): the account page
// made up its own tier ("Gold VIP" from 350 spent) beside the store's real ones, showed a Rewards
// tab for a store with no programme, filled in default tiers with a discount nothing gives, wrote
// the points in Arabic-Indic digits and the value with a bare currency code.

const client = { supabase: { from: vi.fn(), rpc: vi.fn() } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const i18n = { useI18n: () => ({ lang: "en" }) };
vi.mock("../src/lib/i18n", async (io) => ({ ...(await io()), ...i18n }));
vi.mock("@/lib/i18n", async (io) => ({ ...(await io()), ...i18n }));

const data: Record<string, unknown> = {};
const loyaltyData = async (io: () => Promise<Record<string, unknown>>) => {
  const actual = await io();
  const fixed = (name: string) => (brandId: string) => ({
    queryKey: ["loyalty", brandId, name],
    queryFn: async () => data[name] ?? null,
  });
  return {
    ...actual,
    loyaltyQueries: {
      program: fixed("program"),
      tiers: fixed("tiers"),
      account: fixed("account"),
      customerLedger: fixed("ledger"),
    },
  };
};
vi.mock("../src/lib/data/loyalty", (io) => loyaltyData(io));
vi.mock("@/lib/data/loyalty", (io) => loyaltyData(io));

const { shopperLoyaltyTier } = await import("../src/lib/loyalty-program");
const { CustomerLoyaltySection } = await import("../src/components/loyalty/CustomerLoyaltySection");

const tier = (key: string, name: string, minSpend: number, extra = {}) => ({
  tier_key: key,
  name_ar: name,
  name_en: name,
  min_spend: minSpend,
  min_points: 0,
  points_multiplier: 1,
  free_shipping: false,
  discount_percent: 0,
  badge_color: "#999999",
  ...extra,
});

describe("the tier a shopper's page names", () => {
  const tiers = [tier("bronze", "Bronze", 0), tier("silver", "Silver", 100)];
  it("is the store's own, and only while its programme is on", () => {
    const on = { is_enabled: true };
    expect(shopperLoyaltyTier(on, { current_tier_key: "silver" }, tiers)?.name_en).toBe("Silver");
    expect(shopperLoyaltyTier(on, { current_tier_key: null }, tiers)?.name_en).toBe("Bronze");
    expect(shopperLoyaltyTier(null, { current_tier_key: "silver" }, tiers)).toBeNull();
    expect(
      shopperLoyaltyTier({ is_enabled: false }, { current_tier_key: "silver" }, tiers),
    ).toBeNull();
    expect(shopperLoyaltyTier(on, null, tiers)).toBeNull();
    expect(shopperLoyaltyTier(on, { current_tier_key: "silver" }, [])).toBeNull();
  });
});

describe("the shopper's rewards", () => {
  const show = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CustomerLoyaltySection brandId="b1" customerId="c1" currency="SAR" />
      </QueryClientProvider>,
    );

  it("say what the points are worth in the store's currency, with no tier the store did not make", async () => {
    Object.assign(data, {
      program: { is_enabled: true, redemption_rate: 0.01, holding_period_days: 14 },
      tiers: [],
      account: { active_points: 1250, pending_points: 300, current_tier_key: "bronze" },
      ledger: [],
    });
    show();
    expect(await screen.findByText("1,250")).toBeInTheDocument();
    expect(screen.getByText(/Worth .*12\.50.* off at checkout/)).toBeInTheDocument();
    expect(screen.getByText(/14 days after the order is completed/)).toBeInTheDocument();
    expect(screen.queryByText("Current VIP Tier")).toBeNull();
    expect(screen.queryByText(/Bronze Tier|Gold Tier|Elite VIP/)).toBeNull();
    expect(screen.queryByText(/Discount/)).toBeNull();
  });

  it("name the shopper's tier and the next one by what it takes to spend, never a discount", async () => {
    Object.assign(data, {
      program: { is_enabled: true, redemption_rate: 0.01, holding_period_days: 0 },
      tiers: [
        tier("bronze", "Bronze", 0),
        tier("silver", "Silver", 1000, { discount_percent: 5, free_shipping: true }),
      ],
      account: { active_points: 10, pending_points: 0, current_tier_key: "bronze" },
      ledger: [],
    });
    show();
    expect(await screen.findByText("Current VIP Tier")).toBeInTheDocument();
    expect(screen.getByText(/Next tier: Silver, at .*1,000\.00.* spent/)).toBeInTheDocument();
    expect(screen.getByText("Free Shipping")).toBeInTheDocument();
    expect(screen.queryByText(/Exclusive Discount|5%/)).toBeNull();
  });
});
