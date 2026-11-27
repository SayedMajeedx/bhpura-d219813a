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
  settings: {
    review_reward_promo_id: null as string | null,
    review_reward_points: false,
    currency: "SAR",
  },
  promos: [] as Array<Record<string, unknown>>,
  program: null as Record<string, unknown> | null,
  save: vi.fn(async (_brand: string, _promo: string | null, _points?: boolean) => null),
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
const loyaltyData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  loyaltyQueries: {
    program: () => ({ queryKey: ["reward-program"], queryFn: async () => state.program }),
  },
});
vi.mock("../src/lib/data/loyalty", (io) => loyaltyData(io));
vi.mock("@/lib/data/loyalty", (io) => loyaltyData(io));
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

describe("thanking with loyalty points", () => {
  it("are the programme's review points while the store chose them and the programme is on", () => {
    const on = { is_enabled: true, review_bonus_points: 25 };
    const chose = { review_reward_points: true };
    expect(rules.reviewRewardPoints(chose, on)).toBe(25);
    expect(rules.reviewRewardPoints({ review_reward_points: false }, on)).toBeNull();
    expect(rules.reviewRewardPoints(chose, { ...on, is_enabled: false })).toBeNull();
    expect(rules.reviewRewardPoints(chose, { ...on, review_bonus_points: 0 })).toBeNull();
    expect(rules.reviewRewardPoints(chose, null)).toBeNull();
  });

  it("are worded in the reader's language, counted in Arabic", () => {
    expect(rules.pointsOffer(25, "en")).toBe("25 loyalty points");
    expect(rules.pointsOffer(1, "en")).toBe("1 loyalty point");
    expect(rules.pointsOffer(25, "ar")).toBe("25 نقطة ولاء");
    expect(rules.pointsOffer(5, "ar")).toBe("5 نقاط ولاء");
    expect(rules.pointsOffer(2, "ar")).toBe("نقطتان");
  });

  it("are what the review request promises, never a discount", () => {
    const base = {
      customerName: "Sara",
      brandName: "Pura",
      invoiceNumber: 1098,
      reviewUrl: "https://pura.boutq.store/review/t1",
      points: 25,
    };
    const ar = rules.reviewRequestMessage({ ...base, lang: "ar", offer: "25 نقطة ولاء" });
    expect(ar).toContain("تُضاف 25 نقطة ولاء إلى رصيدك");
    expect(ar).not.toMatch(/خصم|طلبك القادم/);
    const en = rules.reviewRequestMessage({ ...base, lang: "en", offer: null });
    expect(en).toContain("and earn 25 loyalty points");
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

  it("promises the store's points, and says they were added once the review is sent", async () => {
    state.publicReview = {
      ...base,
      state: "ready",
      reward_discount_type: null,
      reward_discount_value: null,
      reward_points: 25,
    };
    const Page = reviewRoute.options.component;
    withQuery(<Page />);
    expect(await screen.findByText(/30 ثانية فقط • 25 نقطة ولاء/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "5 نجوم" }));
    state.publicReview = { ...(state.publicReview as object), state: "completed" };
    fireEvent.click(screen.getByRole("button", { name: "إرسال التقييم واستلام النقاط" }));
    expect(await screen.findByText(/أُضيفت 25 نقطة ولاء إلى رصيدك في Beans/)).toBeInTheDocument();
    expect(screen.queryByText(/كود الخصم/)).not.toBeInTheDocument();
  });
});

describe("the thank-you on the Reviews page", () => {
  it("offers the programme's points and saves them in place of a code", async () => {
    state.settings = { review_reward_promo_id: null, review_reward_points: false, currency: "BHD" };
    state.program = { is_enabled: true, review_bonus_points: 25 };
    state.promos = [promo({ id: "p1" })];
    state.save.mockClear();
    withQuery(<ReviewRewardCard brandId="b1" isAr={false} canEdit />);
    const picker = await screen.findByRole("combobox", { name: "Thank-you for a review" });
    await waitFor(() => expect(picker).not.toBeDisabled());
    fireEvent.pointerDown(picker, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(
      await screen.findByRole("option", { name: "Loyalty points · 25 loyalty points" }),
    );
    await waitFor(() => expect(state.save).toHaveBeenCalledWith("b1", null, true));
  });

  it("says what a review earns once points are chosen, and when the programme gives none", async () => {
    state.settings = { review_reward_promo_id: null, review_reward_points: true, currency: "BHD" };
    state.program = { is_enabled: true, review_bonus_points: 25 };
    const { unmount } = withQuery(<ReviewRewardCard brandId="b1" isAr={false} canEdit />);
    expect(
      await screen.findByText("25 loyalty points added to the customer's balance after a review"),
    ).toBeInTheDocument();
    unmount();
    state.program = { is_enabled: false, review_bonus_points: 25 };
    withQuery(<ReviewRewardCard brandId="b1" isAr={false} canEdit={false} />);
    expect(
      await screen.findByText(/The loyalty programme is off or gives no points/),
    ).toBeInTheDocument();
  });

  it("offers the store's usable codes and saves the choice", async () => {
    state.settings = { review_reward_promo_id: null, review_reward_points: false, currency: "SAR" };
    state.program = null;
    state.promos = [promo({ id: "p1" }), promo({ id: "cart", code: "CART-1", max_redemptions: 1 })];
    withQuery(<ReviewRewardCard brandId="b1" isAr={false} canEdit />);
    expect(await screen.findByText("No discount is given after a review")).toBeInTheDocument();
    const picker = screen.getByRole("combobox", { name: "Thank-you for a review" });
    await waitFor(() => expect(picker).not.toBeDisabled());
    fireEvent.pointerDown(picker, {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });
    expect(await screen.findByRole("option", { name: "THANKS15 · 15% off" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /CART-1/ })).not.toBeInTheDocument();
    // Points need the loyalty programme on first.
    expect(screen.getByRole("option", { name: /Loyalty points \(turn/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.click(screen.getByRole("option", { name: "THANKS15 · 15% off" }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith("b1", "p1", false));
  });

  it("says a chosen code that ended gives nothing, and shows no picker to a member who may not change it", async () => {
    state.settings = {
      review_reward_promo_id: "old",
      review_reward_points: false,
      currency: "BHD",
    };
    state.promos = [promo({ id: "old", code: "OLD10", end_date: "2026-01-01T00:00:00Z" })];
    withQuery(<ReviewRewardCard brandId="b1" isAr={false} canEdit={false} />);
    expect(
      await screen.findByText("OLD10 can no longer be used, so no discount is given"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
