import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// The loyalty page told every store its programme was «مفعّل» while no store had one saved (the
// database then gives no points), wrote amounts in BHD whatever the store's currency, showed
// default tiers as if they were saved, and offered bonuses and a tier discount that nothing gives
// (found 2026-10-14). The owner chose to hide what is not built yet.

const client = { supabase: { from: vi.fn(), rpc: vi.fn() } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const currencyHooks = {
  useStoreCurrency: () => "SAR",
  useMoneyLabel: (lang: "ar" | "en") => (lang === "ar" ? "ر.س" : "SAR"),
};
vi.mock("../src/hooks/use-store-currency", () => currencyHooks);
vi.mock("@/hooks/use-store-currency", () => currencyHooks);

const profile = { useAdminStoreProfile: () => ({ profile: { modules: { shipping: false } } }) };
vi.mock("../src/hooks/use-store-profile", () => profile);
vi.mock("@/hooks/use-store-profile", () => profile);

const i18n = { useI18n: () => ({ lang: "en" }) };
vi.mock("../src/lib/i18n", async (io) => ({ ...(await io()), ...i18n }));
vi.mock("@/lib/i18n", async (io) => ({ ...(await io()), ...i18n }));

const saved: unknown[] = [];
const members = [
  {
    customer_id: "c1",
    active_points: 120,
    pending_points: 0,
    lifetime_points: 120,
    current_tier_key: "silver",
    customers: { name: "Doaa", phone: "+973 3311 2267" },
  },
  {
    customer_id: "c2",
    active_points: 40,
    pending_points: 200,
    lifetime_points: 240,
    current_tier_key: "bronze",
    customers: { name: "Mariam", phone: "36554433" },
  },
];
const loyaltyData = async (io: () => Promise<Record<string, unknown>>) => {
  const actual = await io();
  return {
    ...actual,
    saveLoyaltyTiers: vi.fn(async (_brand: string, tiers: unknown[]) => saved.push(...tiers)),
    saveLoyaltyProgram: vi.fn(),
    loyaltyQueries: {
      ...(actual.loyaltyQueries as object),
      members: (brandId: string) => ({
        queryKey: ["loyalty", brandId, "members"],
        queryFn: async () => members,
      }),
    },
  };
};
vi.mock("../src/lib/data/loyalty", (io) => loyaltyData(io));
vi.mock("@/lib/data/loyalty", (io) => loyaltyData(io));

const { loyaltyProgramState, starterLoyaltyTiers, loyaltyMembers } =
  await import("../src/lib/loyalty-program");
const { LoyaltyCommandHeader } = await import("../src/components/loyalty/LoyaltyCommandHeader");
const { LoyaltySettingsEditor } = await import("../src/components/loyalty/LoyaltySettingsEditor");
const { LoyaltyTiersManager } = await import("../src/components/loyalty/LoyaltyTiersManager");
const { LoyaltyMembersList } = await import("../src/components/loyalty/LoyaltyMembersList");

const withQueries = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("the programme's state", () => {
  it("is not set up until its settings are saved, then on or off", () => {
    expect(loyaltyProgramState(null)).toBe("not_set_up");
    expect(loyaltyProgramState(undefined)).toBe("not_set_up");
    expect(loyaltyProgramState({ is_enabled: true })).toBe("on");
    expect(loyaltyProgramState({ is_enabled: false })).toBe("off");
  });

  it("is what the heading says, never «active» for a programme nobody saved", () => {
    const { rerender } = render(<LoyaltyCommandHeader state="not_set_up" />);
    expect(screen.getByText("Not set up")).toBeInTheDocument();
    expect(screen.queryByText("Active")).toBeNull();
    rerender(<LoyaltyCommandHeader state="off" />);
    expect(screen.getByText("Off")).toBeInTheDocument();
    rerender(<LoyaltyCommandHeader state="on" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});

describe("the starter tiers", () => {
  it("are in the store's currency and promise only what the system does", () => {
    const sar = starterLoyaltyTiers("SAR", true);
    expect(sar.map((t) => t.min_spend)).toEqual([0, 1000, 3000, 6000]);
    for (const tier of sar) {
      expect(tier.discount_percent).toBe(0);
      expect(tier.perks_ar).toEqual([]);
      expect(tier.perks_en).toEqual([]);
      expect(tier.min_points).toBe(0);
    }
    expect(sar.find((t) => t.tier_key === "gold")?.free_shipping).toBe(true);
    expect(starterLoyaltyTiers("BHD", false).every((t) => !t.free_shipping)).toBe(true);
    expect(starterLoyaltyTiers("BHD", false).map((t) => t.min_spend)).toEqual([0, 100, 300, 600]);
  });
});

describe("the tiers on the page", () => {
  it("are the store's own: none saved shows an empty state, and starting creates the starter set", async () => {
    saved.length = 0;
    withQueries(<LoyaltyTiersManager brandId="b1" tiers={[]} />);
    expect(screen.getByText(/No tiers yet/)).toBeInTheDocument();
    expect(screen.queryByText("Bronze Tier")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create starter tiers" }));
    await waitFor(() => expect(saved).toHaveLength(4));
    // A store that does not ship gets no free-shipping tier; SAR amounts are scaled.
    expect(saved).toContainEqual(
      expect.objectContaining({ tier_key: "silver", min_spend: 1000, free_shipping: false }),
    );
  });

  it("show a tier's multiplier and free shipping, and no discount", () => {
    withQueries(
      <LoyaltyTiersManager
        brandId="b1"
        tiers={[
          {
            id: "t1",
            brand_id: "b1",
            tier_key: "gold",
            name_ar: "ذهبي",
            name_en: "Gold",
            min_spend: 300,
            min_points: 0,
            points_multiplier: 1.5,
            free_shipping: true,
            discount_percent: 10,
            badge_color: "#eab308",
            perks_ar: [],
            perks_en: [],
          } as never,
        ]}
      />,
    );
    expect(screen.getByText("1.5x")).toBeInTheDocument();
    expect(screen.getByText("Free shipping included")).toBeInTheDocument();
    expect(screen.queryByText("10%")).toBeNull();
    expect(screen.queryByText(/Discount/)).toBeNull();
  });
});

describe("the programme's settings", () => {
  it("offer the first-order bonus, not the bonuses nothing gives yet, and write amounts in the store's currency", () => {
    withQueries(<LoyaltySettingsEditor open onOpenChange={() => undefined} brandId="b1" />);
    expect(screen.getByText("First Order Bonus Points")).toBeInTheDocument();
    for (const hidden of [/Review Bonus/, /Welcome/, /Referral/, /discounted\/sale items/]) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
    expect(screen.getByText(/100 pts = .*SAR|100 pts = .*ر\.س/)).toBeInTheDocument();
    expect(screen.queryByText(/BHD/)).toBeNull();
  });
});

describe("the members", () => {
  it("are listed with the most points first, and found by name or phone", () => {
    expect(loyaltyMembers(members).map((m) => m.customerId)).toEqual(["c2", "c1"]);
    expect(loyaltyMembers(members, "doa").map((m) => m.customerId)).toEqual(["c1"]);
    expect(loyaltyMembers(members, "33112267").map((m) => m.customerId)).toEqual(["c1"]);
    expect(loyaltyMembers(members, "nobody")).toEqual([]);
  });

  it("show what each can spend, what is held, and their tier", async () => {
    withQueries(
      <LoyaltyMembersList
        brandId="b1"
        isAr={false}
        tiers={[{ tier_key: "silver", name_ar: "فضي", name_en: "Silver" }]}
      />,
    );
    expect(await screen.findByText("Doaa")).toBeInTheDocument();
    expect(screen.getByText("Silver")).toBeInTheDocument();
    expect(screen.getByText("200 held")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search members" }), {
      target: { value: "mariam" },
    });
    expect(screen.queryByText("Doaa")).toBeNull();
  });
});
