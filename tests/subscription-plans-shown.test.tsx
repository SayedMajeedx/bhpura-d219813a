import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { purchasablePlans } from "../src/lib/saas-billing/purchasable-plans";

// A store whose trial ended saw three plans written by hand in the screen (Starter 15, Growth 35,
// Pro 60 BHD), two of them withdrawn, while the platform sold one plan at 3 BHD; it could only
// open a WhatsApp chat. The screen now shows the subscription hub: the live plans and checkout.

vi.mock("@/components/subscription/BrandSubscriptionHub", () => ({
  BrandSubscriptionHub: ({ brandId }: { brandId: string }) => (
    <div data-testid="subscription-hub">{brandId}</div>
  ),
}));
vi.mock("../src/components/subscription/BrandSubscriptionHub", () => ({
  BrandSubscriptionHub: ({ brandId }: { brandId: string }) => (
    <div data-testid="subscription-hub">{brandId}</div>
  ),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ signOut: vi.fn() }));
vi.mock("../src/lib/auth/session", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ lang: "ar" }) }));
vi.mock("../src/lib/i18n", () => ({ useI18n: () => ({ lang: "ar" }) }));

const { TrialExpiredPaywall } = await import("../src/components/admin/TrialExpiredPaywall");

const plan = (code: string, over: Record<string, unknown>, price = 3) => ({
  code,
  is_active: true,
  is_public: true,
  versions: [
    { is_current: false, price_monthly: 99, price_annual: 990 },
    { is_current: true, price_monthly: price, price_annual: price * 10 },
  ],
  ...over,
});

describe("the plans a store can buy", () => {
  it("are the active, public, priced ones, at their current price", () => {
    const live = [
      plan("starter", { is_active: false, is_public: false }, 15),
      plan("pro", {}),
      plan("trial", {}, 0),
      plan("lifetime_founder", { is_public: false }, 0),
      plan("enterprise", { is_active: false }, 150),
    ];
    expect(purchasablePlans(live).map((p) => p.code)).toEqual(["pro"]);
  });

  it("never offer a private plan, even with a price", () => {
    expect(purchasablePlans([plan("vip", { is_public: false }, 50)])).toEqual([]);
  });
});

describe("the screen a store sees when its trial has ended", () => {
  it("shows the live plans and checkout, and none written by hand", () => {
    render(
      <TrialExpiredPaywall
        brand={{ id: "b-aurora", slug: "aurora", name_ar: "اورورا" }}
        reason="trial_expired"
      />,
    );
    expect(screen.getByTestId("subscription-hub")).toHaveTextContent("b-aurora");
    expect(screen.getByText("انتهت الفترة التجريبية المجانية")).toBeInTheDocument();
    expect(screen.queryByText("باقة النمو")).toBeNull();
    expect(screen.queryByText(/وفّر 20%/)).toBeNull();
    expect(screen.getByRole("link", { name: "+973 3995 5508" })).toHaveAttribute(
      "href",
      "https://wa.me/97339955508",
    );
  });
});
