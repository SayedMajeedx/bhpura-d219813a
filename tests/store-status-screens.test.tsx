import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

// The busy pause and the opening hours on screen: the dashboard's card pauses and reopens in one
// tap, and the storefront's banner says what a shopper is told. The rules are the database's
// (tests/opening-hours-parity.test.ts).

const state = vi.hoisted(() => ({
  status: { orders_paused_until: null as string | null, opening_hours: {} as unknown },
  setPause: vi.fn(async (..._args: unknown[]) => undefined),
  storefront: {} as Record<string, unknown>,
}));

const statusData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  storeStatusQueries: {
    detail: () => ({ queryKey: ["store-status"], queryFn: async () => state.status }),
  },
  setOrdersPause: state.setPause,
  invalidateStoreStatus: async () => undefined,
});
vi.mock("../src/lib/data/store-status", (io) => statusData(io));
vi.mock("@/lib/data/store-status", (io) => statusData(io));
const storefrontContext = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => state.storefront,
});
vi.mock("../src/lib/storefront-context", (io) => storefrontContext(io));
vi.mock("@/lib/storefront-context", (io) => storefrontContext(io));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { StoreStatusCard, pauseUntil } =
  await import("../src/features/dashboard/components/StoreStatusCard");
const { StoreStatusBanner } =
  await import("../src/features/storefront-shell/components/StoreStatusBanner");

const withQuery = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

afterEach(() => {
  state.setPause.mockClear();
  vi.useRealTimers();
});

describe("the dashboard's store status", () => {
  it("pauses new orders for the chosen time, or until reopened", async () => {
    state.status = { orders_paused_until: null, opening_hours: {} };
    withQuery(<StoreStatusCard brandId="b1" isAr={false} canChange />);
    expect(await screen.findByText("The store is taking orders")).toBeTruthy();
    const before = Date.now();
    fireEvent.click(screen.getByRole("button", { name: "30 min" }));
    await waitFor(() => expect(state.setPause).toHaveBeenCalled());
    const [brand, until] = state.setPause.mock.calls[0] as [string, string];
    expect(brand).toBe("b1");
    const minutes = (new Date(until).getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(29.9);
    expect(minutes).toBeLessThan(30.5);
    fireEvent.click(screen.getByRole("button", { name: "Until I reopen" }));
    await waitFor(() => expect(state.setPause).toHaveBeenLastCalledWith("b1", "infinity"));
    expect(pauseUntil(null, new Date())).toBe("infinity");
  });

  it("says a paused store is paused and reopens it", async () => {
    state.status = { orders_paused_until: "infinity", opening_hours: {} };
    withQuery(<StoreStatusCard brandId="b1" isAr canChange />);
    expect(await screen.findByText("الطلبات الجديدة متوقفة حتى تعيد فتحها")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /استقبل الطلبات الآن/ }));
    await waitFor(() => expect(state.setPause).toHaveBeenCalledWith("b1", null));
  });

  it("offers no buttons to a member who may not change the store's settings", async () => {
    state.status = { orders_paused_until: null, opening_hours: {} };
    withQuery(<StoreStatusCard brandId="b1" isAr={false} canChange={false} />);
    expect(await screen.findByText("The store is taking orders")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("the storefront's banner", () => {
  const shop = (settings: Record<string, unknown>) => ({
    settings: { storefront_mode: "shop", ...settings },
    lang: "en",
  });

  it("says nothing while the store takes orders", async () => {
    state.storefront = shop({});
    const { container } = render(<StoreStatusBanner />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(container.textContent).toBe("");
  });

  it("says a busy store is not taking orders", async () => {
    state.storefront = shop({ orders_paused_until: "infinity" });
    render(<StoreStatusBanner />);
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByText("We're not taking new orders right now. Back soon.")).toBeTruthy();
  });

  it("says when a closed store handles the order", async () => {
    // Sunday 23:00 in Bahrain; open 10:00-22:00 every day.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-25T20:00:00Z") });
    const days = Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), [{ from: "10:00", to: "22:00" }]]),
    );
    state.storefront = shop({ opening_hours: { enabled: true, days } });
    render(<StoreStatusBanner />);
    expect(
      await screen.findByText(
        "We're closed now. Your order will be handled from tomorrow at 10:00.",
      ),
    ).toBeTruthy();
  });

  it("says nothing in a catalog store", async () => {
    state.storefront = shop({ storefront_mode: "catalog", orders_paused_until: "infinity" });
    const { container } = render(<StoreStatusBanner />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(container.textContent).toBe("");
  });
});
