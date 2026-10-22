import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// Each store's own thank-you discount for a review (bug #41). Every store promised "10%" and
// handed out THANKU10, a code only one store has. Now the store chooses one of its own codes, or
// none, and every place that promises the discount says that store's offer, or promises nothing.

const state = vi.hoisted(() => ({
  publicReview: null as unknown,
  submit: vi.fn(async () => null as string | null),
  settings: { review_reward_promo_id: null as string | null, currency: "SAR" },
  promos: [] as Array<Record<string, unknown>>,
  save: vi.fn(async (_brand: string, _promo: string | null) => null),
}));

const reviewsData = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { reviewsQueries: object };
  return {
    ...actual,
    reviewsQueries: {
      ...actual.reviewsQueries,
      publicReview: () => ({ queryKey: ["public"], queryFn: async () => state.publicReview }),
    },
    submitPublicOrderReview: state.submit,
  };
};
vi.mock("../src/lib/data/reviews", (io) => reviewsData(io));
vi.mock("@/lib/data/reviews", (io) => reviewsData(io));
const settingsData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  businessSettingsQueries: {
    detail: () => ({ queryKey: ["reward-settings"], queryFn: async () => state.settings }),
  },
  saveReviewReward: state.save,
  invalidateBusinessSettings: async () => undefined,
});
vi.mock("../src/lib/data/business-settings", (io) => settingsData(io));
vi.mock("@/lib/data/business-settings", (io) => settingsData(io));
const promoData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  promoCodesQueries: {
    list: () => ({ queryKey: ["reward-promos"], queryFn: async () => state.promos }),
  },
});
vi.mock("../src/lib/data/promo-codes", (io) => promoData(io));
vi.mock("@/lib/data/promo-codes", (io) => promoData(io));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useParams: () => ({ token: "t1" }) }),
}));

const rules = await import("../src/lib/review-reward");
const { ReviewRewardCard } = await import("../src/components/reviews/ReviewRewardCard");
const { Route: reviewRoute } = (await import("../src/routes/review.$token")) as unknown as {
  Route: { options: { component: React.ComponentType } };
};

const withQuery = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

const promo = (over: Record<string, unknown>) => ({
  id: "p1",
  code: "THANKS15",
  discount_type: "percentage",
  discount_value: 15,
  is_active: true,
  start_date: null,
  end_date: null,
  max_redemptions: null,
  ...over,
});
const now = new Date("2026-10-22T12:00:00Z");

describe("the offer's words", () => {
  it("says what the code takes off, in the store's currency", () => {
    expect(
      rules.rewardOffer({ discount_type: "percentage", discount_value: 10 }, "en", "BHD"),
    ).toBe("10% off");
    expect(
      rules.rewardOffer({ discount_type: "percentage", discount_value: 10 }, "ar", "BHD"),
    ).toBe("خصم 10٪");
    expect(rules.rewardOffer({ discount_type: "fixed", discount_value: 5 }, "en", "SAR")).toBe(
      "5.00 SAR off",
    );
    expect(rules.rewardOffer({ discount_type: "fixed", discount_value: 2 }, "ar", "BHD")).toBe(
      "خصم 2.000 د.ب",
    );
    expect(rules.rewardOffer(null, "en", "BHD")).toBeNull();
  });

  it("offers only codes anyone can use now", () => {
    const list = [
      promo({ id: "ok" }),
      promo({ id: "off", is_active: false }),
      promo({ id: "ended", end_date: "2026-10-01T00:00:00Z" }),
      promo({ id: "later", start_date: "2026-11-01T00:00:00Z" }),
      promo({ id: "cart", max_redemptions: 1 }),
    ];
    expect(rules.rewardChoices(list, now).map((item) => item.id)).toEqual(["ok"]);
  });

  it("asks for a review promising the store's discount, or none, with no gendered verb", () => {
    const base = {
      customerName: "Sara",
      brandName: "Pura",
      invoiceNumber: 1098,
      reviewUrl: "https://boutq.store/review/t1",
    };
    const withOffer = rules.reviewRequestMessage({ ...base, lang: "ar", offer: "خصم 15٪" });
    expect(withOffer).toContain("لك خصم 15٪ على طلبك القادم");
    expect(withOffer).not.toMatch(/ستحصل|10%/);
    const without = rules.reviewRequestMessage({ ...base, lang: "en", offer: null });
    expect(without).not.toMatch(/off|discount|%/i);
    expect(without).toContain("https://boutq.store/review/t1");
  });
});

describe("the review page", () => {
  const base = {
    brand_name: "Beans",
    brand_logo_url: null,
    invoice_number: 7,
    customer_name: "Sara",
    brand_whatsapp_number: "966500000000",
    reward_code: null,
    currency: "SAR",
  };

  it("promises no discount in a store that gives none, and thanks without a code", async () => {
    state.publicReview = {
      ...base,
      state: "ready",
      reward_discount_type: null,
      reward_discount_value: null,
    };
    const Page = reviewRoute.options.component;
    withQuery(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "5 نجوم" }));
    expect(screen.getByRole("button", { name: "إرسال التقييم" })).toBeInTheDocument();
    expect(screen.queryByText(/خصم/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إرسال التقييم" }));
    expect(await screen.findByText("رأيك وصلنا، ويساعدنا نتطور.")).toBeInTheDocument();
    expect(screen.queryByText("THANKU10")).not.toBeInTheDocument();
  });

  it("names the store's own offer in its currency", async () => {
    state.publicReview = {
      ...base,
      state: "ready",
      reward_discount_type: "fixed",
      reward_discount_value: 5,
    };
    const Page = reviewRoute.options.component;
    withQuery(<Page />);
    expect(await screen.findByText(/30 ثانية فقط • خصم 5.00 ر.س/)).toBeInTheDocument();
  });
});

describe("the thank-you discount on the Reviews page", () => {
  it("offers the store's usable codes and saves the choice", async () => {
    state.settings = { review_reward_promo_id: null, currency: "SAR" };
    state.promos = [promo({ id: "p1" }), promo({ id: "cart", code: "CART-1", max_redemptions: 1 })];
    withQuery(<ReviewRewardCard brandId="b1" isAr={false} canEdit />);
    expect(await screen.findByText("No discount is given after a review")).toBeInTheDocument();
    const picker = screen.getByRole("combobox", { name: "Thank-you discount" });
    await waitFor(() => expect(picker).not.toBeDisabled());
    fireEvent.pointerDown(picker, {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    expect(await screen.findByRole("option", { name: "THANKS15 · 15% off" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /CART-1/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "THANKS15 · 15% off" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith("b1", "p1"));
  });

  it("says a chosen code that ended gives nothing, and shows no picker to a member who may not change it", async () => {
    state.settings = { review_reward_promo_id: "old", currency: "BHD" };
    state.promos = [promo({ id: "old", code: "OLD10", end_date: "2026-01-01T00:00:00Z" })];
    withQuery(<ReviewRewardCard brandId="b1" isAr={false} canEdit={false} />);
    expect(
      await screen.findByText("OLD10 can no longer be used, so no discount is given"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
