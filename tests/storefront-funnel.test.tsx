import React from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A store's own count of visits and how far they go: the storefront sends each visit's furthest
// step once, and the dashboard shows the funnel and the conversion rate.

const data = vi.hoisted(() => ({
  recordFunnelStep: vi.fn(async () => undefined),
  counts: null as null | Record<string, number>,
  sources: [] as { source: string; visits: number; orders: number }[],
}));
vi.mock("../src/lib/data/storefront-funnel", () => ({
  recordFunnelStep: data.recordFunnelStep,
  storefrontFunnelQueries: {
    period: (brandId: string, from: string, to: string) => ({
      queryKey: ["storefront-funnel", brandId, from, to],
      queryFn: async () => data.counts,
    }),
    sources: (brandId: string, from: string, to: string) => ({
      queryKey: ["storefront-funnel", "sources", brandId, from, to],
      queryFn: async () => data.sources,
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
    sources: (brandId: string, from: string, to: string) => ({
      queryKey: ["storefront-funnel", "sources", brandId, from, to],
      queryFn: async () => data.sources,
    }),
  },
}));

const { stepToSend, funnelStages, conversionRate, share, visitSource } =
  await import("../src/lib/funnel");
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

describe("where a visit came from", () => {
  const from = (over: Partial<Parameters<typeof visitSource>[0]> = {}) =>
    visitSource({
      search: "",
      referrer: "",
      userAgent: "Mozilla/5.0 Chrome",
      host: "pura.boutq.store",
      ...over,
    });

  it("is direct with nothing to go on, or from the store's own pages", () => {
    expect(from()).toBe("direct");
    expect(from({ referrer: "https://pura.boutq.store/pura" })).toBe("direct");
  });

  it("knows a link in an Instagram bio by Instagram's own browser, with no referrer", () => {
    expect(from({ userAgent: "Mozilla/5.0 (iPhone) Instagram 300.0" })).toBe("instagram");
    expect(from({ referrer: "https://l.instagram.com/" })).toBe("instagram");
  });

  it("takes a link the store tagged before anything else", () => {
    expect(from({ search: "?utm_source=ig", userAgent: "Mozilla FBAV/1" })).toBe("instagram");
    expect(from({ search: "?utm_source=newsletter" })).toBe("other");
  });

  it("tells Instagram's browser from Facebook's, though both add fbclid", () => {
    expect(from({ search: "?fbclid=x", userAgent: "Instagram 300" })).toBe("instagram");
    expect(from({ search: "?fbclid=x" })).toBe("facebook");
  });

  it("names the other apps and sites, and never keeps the address", () => {
    expect(from({ referrer: "https://wa.me/973" })).toBe("whatsapp");
    expect(from({ referrer: "https://www.google.com.bh/" })).toBe("google");
    expect(from({ referrer: "https://notgoogle.example/" })).toBe("other");
    expect(from({ referrer: "not an address" })).toBe("direct");
  });
});

describe("the card's sources", () => {
  const show = async (isAr: boolean) => {
    data.counts = { visits: 130, product_views: 52, carts: 13, checkouts: 12, orders: 5 };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <StoreFunnelCard brandId="b1" isAr={isAr} />
      </QueryClientProvider>,
    );
    await screen.findAllByText(isAr ? "زيارات" : "Visits");
  };

  it("say how many visits and orders each source brought", async () => {
    data.sources = [
      { source: "instagram", visits: 90, orders: 4 },
      { source: "direct", visits: 40, orders: 1 },
    ];
    await show(false);
    const row = (await screen.findByText("Instagram")).closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("90");
    expect(row).toHaveTextContent("4");
    expect(screen.getByText("Direct")).toBeInTheDocument();
  });

  it("are left out until a visit has a source", async () => {
    data.sources = [];
    await show(true);
    expect(screen.queryByText("من وين جاءت الزيارات")).toBeNull();
  });

  it("holds the card's place while its figures come, so the dashboard does not jump", async () => {
    // The admin audit of 2026-11-12: drawn only once loaded, it pushed the page down (0.13).
    data.counts = { visits: 10, product_views: 5, carts: 2, checkouts: 1, orders: 1 };
    let answer: (value: unknown) => void = () => undefined;
    const slow = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    slow.setQueryDefaults(["storefront-funnel"], {
      queryFn: () => new Promise((resolve) => (answer = resolve)),
    });
    render(
      <QueryClientProvider client={slow}>
        <StoreFunnelCard brandId="b2" isAr={false} />
      </QueryClientProvider>,
    );
    const placeholder = screen.getByRole("status", { name: "Loading visits" });
    expect(placeholder.className).toContain("min-h-24");
    answer(data.counts);
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

  it("sends one source for the whole visit, and marks the order", () => {
    setFunnelRecording({ slug: "pura", allowed: true });
    trackStorefrontEvent("page_view");
    trackStorefrontEvent("purchase");
    const calls = data.recordFunnelStep.mock.calls as unknown as Array<
      [string, string, number, string]
    >;
    expect(calls.map(([, , step]) => step)).toEqual([1, 5]);
    expect(new Set(calls.map(([, , , source]) => source)).size).toBe(1);
    expect(calls[0][3]).toBe("direct");
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
