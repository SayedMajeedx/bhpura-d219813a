import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A store's own count of visits and how far they go: the storefront sends each visit's furthest
// step once, and the dashboard shows the funnel and the conversion rate.

const data = vi.hoisted(() => ({
  recordFunnelStep: vi.fn(async () => undefined),
  counts: null as null | Record<string, number>,
}));
vi.mock("../src/lib/data/storefront-funnel", () => ({
  recordFunnelStep: data.recordFunnelStep,
  storefrontFunnelQueries: {
    period: (brandId: string, from: string, to: string) => ({
      queryKey: ["storefront-funnel", brandId, from, to],
      queryFn: async () => data.counts,
    }),
  },
}));
vi.mock("@/lib/data/storefront-funnel", () => ({
  recordFunnelStep: data.recordFunnelStep,
  storefrontFunnelQueries: {
    period: (brandId: string, from: string, to: string) => ({
      queryKey: ["storefront-funnel", brandId, from, to],
      queryFn: async () => data.counts,
    }),
  },
}));

const { stepToSend, funnelStages, conversionRate, share } = await import("../src/lib/funnel");
const { trackStorefrontEvent, setFunnelRecording } =
  await import("../src/lib/storefront-analytics");
const { StoreFunnelCard, last30Days } =
  await import("../src/features/dashboard/components/StoreFunnelCard");

describe("the funnel's rules", () => {
  it("send a step only when the visit goes further", () => {
    expect(stepToSend("page_view", 0)).toBe(1);
    expect(stepToSend("add_to_cart", 1)).toBe(3);
    expect(stepToSend("view_item", 3)).toBeNull();
    expect(stepToSend("search", 0)).toBeNull();
  });

  it("give each stage its share of the visits, and the conversion rate", () => {
    const counts = { visits: 200, product_views: 120, carts: 30, checkouts: 12, orders: 5 };
    expect(funnelStages(counts).map((s) => [s.key, s.ofVisits])).toEqual([
      ["visits", null],
      ["product_views", 60],
      ["carts", 15],
      ["checkouts", 6],
      ["orders", 2.5],
    ]);
    expect(conversionRate(counts)).toBe(2.5);
    expect(share(1, 0)).toBeNull();
  });

  it("read the last 30 days from midnight, as the dashboard's other figures", () => {
    const { from, to } = last30Days(new Date(2026, 9, 30, 15, 20, 30));
    expect(new Date(from)).toEqual(new Date(2026, 9, 1, 0, 0, 0));
    expect(new Date(to)).toEqual(new Date(2026, 9, 30, 15, 21, 0));
  });
});

describe("the storefront", () => {
  beforeEach(() => {
    sessionStorage.clear();
    data.recordFunnelStep.mockClear();
  });

  it("sends each visit's furthest step once, under one random visit id", () => {
    setFunnelRecording({ slug: "pura", allowed: true });
    trackStorefrontEvent("page_view");
    trackStorefrontEvent("page_view");
    trackStorefrontEvent("view_item");
    trackStorefrontEvent("add_to_cart");
    trackStorefrontEvent("view_item");
    trackStorefrontEvent("search");
    const calls = data.recordFunnelStep.mock.calls as unknown as Array<[string, string, number]>;
    expect(calls.map(([, , step]) => step)).toEqual([1, 2, 3]);
    expect(new Set(calls.map(([slug, visit]) => `${slug}:${visit}`)).size).toBe(1);
    expect(calls[0][1]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sends nothing when the store asks for consent and analytics was not allowed", () => {
    setFunnelRecording({ slug: "pura", allowed: false });
    trackStorefrontEvent("page_view");
    trackStorefrontEvent("add_to_cart");
    setFunnelRecording(null);
    trackStorefrontEvent("page_view");
    expect(data.recordFunnelStep).not.toHaveBeenCalled();
  });
});

describe("the dashboard card", () => {
  const show = (isAr = false) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StoreFunnelCard brandId="b1" isAr={isAr} />
      </QueryClientProvider>,
    );

  it("shows the visits, each step and the conversion rate", async () => {
    data.counts = { visits: 200, product_views: 120, carts: 30, checkouts: 12, orders: 5 };
    show();
    expect(await screen.findByText("2.5%")).toBeInTheDocument();
    expect(screen.getByText("Added to bag")).toBeInTheDocument();
    expect(screen.getByText(/· 15%/)).toBeInTheDocument();
  });

  it("says counting has started when no visit is recorded yet, in Arabic too", async () => {
    data.counts = { visits: 0, product_views: 0, carts: 0, checkouts: 0, orders: 0 };
    show(true);
    expect(await screen.findByText(/تُعدّ الزيارات من الآن/)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
