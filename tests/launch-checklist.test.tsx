import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { goLiveSteps, nextSteps } from "../src/features/launch/lib/launch-steps";

// One launch checklist (the ease-of-use review of 2026-11-28): the dashboard said "3 of 3, your
// store is set up" while Settings said "2 / 7", two lists counting different things. Both now
// draw the same steps: Settings' setup steps, the add-ons' checks, then the store shared and its
// first order.

describe("the steps that take a store live", () => {
  const base = {
    lang: "en" as const,
    services: false,
    previewed: false,
    saleMarked: false,
    orders: 0,
    storefrontUrl: "https://pura.boutq.store/pura",
  };

  it("are its link shared and its first order, done by orders or by hand", () => {
    const [share, sale] = goLiveSteps(base);
    expect([share.id, share.isComplete, share.external]).toEqual([
      "share",
      false,
      "https://pura.boutq.store/pura",
    ]);
    expect([sale.title, sale.isComplete, sale.page, sale.manual]).toEqual([
      "Receive your first order",
      false,
      "orders",
      "sale",
    ]);
    const sold = goLiveSteps({ ...base, orders: 3 });
    expect(sold.map((s) => s.isComplete)).toEqual([true, true]);
    expect(sold[1].description).toBe("So far: 3 orders");
    // Done by the data, it is not taken back by hand.
    expect(sold[1].manual).toBeUndefined();
    expect(
      goLiveSteps({ ...base, previewed: true, saleMarked: true }).every((s) => s.isComplete),
    ).toBe(true);
  });

  it("speak of a booking for a store that takes them, and count in Arabic", () => {
    const [, booking] = goLiveSteps({ ...base, lang: "ar", services: true, orders: 2 });
    expect(booking.title).toBe("استقبل أول حجز");
    expect(booking.page).toBe("bookings");
    expect(booking.description).toBe("حتى الآن: حجزان");
  });

  it("offer the next three steps still to do, in the list's order", () => {
    const steps = [true, false, false, true, false, false].map((isComplete, i) => ({
      id: String(i),
      isComplete,
    }));
    expect(nextSteps(steps).map((s) => s.id)).toEqual(["1", "2", "4"]);
  });
});

const state = vi.hoisted(() => ({ navigate: vi.fn(), orders: 0 }));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const client = vi.hoisted(() => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const q = vi.hoisted(() => (key: string, value: () => unknown) => (...args: unknown[]) => ({
  queryKey: [key, ...args],
  queryFn: async () => value(),
}));
const data = vi.hoisted(() => ({
  settings: {
    logo_url: "https://media/logo.png",
    cod_enabled: true,
    delivery_enabled: true,
    store_vertical: "fashion",
    pages: [],
  },
}));
const settingsMock = vi.hoisted(() => () => ({
  businessSettingsQueries: { detail: q("bs", () => data.settings) },
}));
vi.mock("../src/lib/data/business-settings", settingsMock);
vi.mock("@/lib/data/business-settings", settingsMock);
const brandsMock = vi.hoisted(() => () => ({
  brandQueries: { profile: q("brand", () => ({ slug: "pura", logo_url: null })) },
}));
vi.mock("../src/lib/data/brands", brandsMock);
vi.mock("@/lib/data/brands", brandsMock);
const returnsMock = vi.hoisted(() => () => ({
  returnsQueries: { policy: q("policy", () => null) },
}));
vi.mock("../src/lib/data/returns", returnsMock);
vi.mock("@/lib/data/returns", returnsMock);
const catalogMock = vi.hoisted(() => () => ({
  catalogInsightQueries: {
    activeCount: q("active", () => 2),
    withoutPhoto: q("photo", () => 0),
  },
}));
vi.mock("../src/lib/data/catalog", catalogMock);
vi.mock("@/lib/data/catalog", catalogMock);
const ordersMock = vi.hoisted(() => () => ({
  ordersQueries: { count: q("count", () => state.orders) },
}));
vi.mock("../src/lib/data/orders", ordersMock);
vi.mock("@/lib/data/orders", ordersMock);
const policiesMock = vi.hoisted(() => () => ({
  bookingPoliciesQueries: { policy: q("bpolicy", () => null) },
}));
vi.mock("../src/lib/data/booking-policies", policiesMock);
vi.mock("@/lib/data/booking-policies", policiesMock);
const contentMock = vi.hoisted(() => () => ({ storeContentQueries: { faq: q("faq", () => []) } }));
vi.mock("../src/lib/data/store-content", contentMock);
vi.mock("@/lib/data/store-content", contentMock);
const profileMock = vi.hoisted(() => () => ({
  useAdminStoreProfile: () => ({
    profile: { modules: { bookings: false, stock: true, shipping: true } },
  }),
}));
vi.mock("../src/hooks/use-store-profile", profileMock);
vi.mock("@/hooks/use-store-profile", profileMock);
const addonsMock = vi.hoisted(() => () => ({ useAddons: () => ({ addons: [] }) }));
vi.mock("../src/components/addons/AddonsProvider", addonsMock);
vi.mock("@/components/addons/AddonsProvider", addonsMock);

const { StoreReadinessChecklist } =
  await import("../src/components/settings/StoreReadinessChecklist");
const { LaunchChecklistCard } =
  await import("../src/features/launch/components/LaunchChecklistCard");
const { useLaunchChecklist } = await import("../src/features/launch/hooks/use-launch-checklist");

function DashboardCard({ mayOpenSettings = true }: { mayOpenSettings?: boolean }) {
  const launch = useLaunchChecklist({ brandId: "b1", slug: "pura", lang: "en", dashboard: true });
  if (!launch.ready) return null;
  return (
    <LaunchChecklistCard
      checklist={launch}
      lang="en"
      slug="pura"
      mayOpenSettings={mayOpenSettings}
    />
  );
}

const withQueries = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("the dashboard and Settings", () => {
  beforeEach(() => {
    state.navigate.mockReset();
    state.orders = 0;
    window.localStorage.clear();
  });

  it("show the same steps and the same count", async () => {
    // Logo, kind, products, payment and delivery set; no colour, no policy; not shared, no order.
    withQueries(<DashboardCard />);
    expect(await screen.findByText("5 of 9 done")).toBeTruthy();
    // The next three, in order: the colour, the policy, sharing the store.
    expect(screen.getByText("Brand colour set")).toBeTruthy();
    expect(screen.getByText("Publish return policy or terms page")).toBeTruthy();
    expect(screen.getByText("Preview and share your store")).toBeTruthy();
    expect(screen.queryByText("Receive your first order")).toBeNull();

    withQueries(
      <StoreReadinessChecklist brandId="b1" slug="pura" lang="en" onNavigateTab={vi.fn()} />,
    );
    // Past half done, Settings folds it to one line, the same count; opened, every step.
    expect(await screen.findByText("5 / 9")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByText("Receive your first order")).toBeTruthy();
  });

  it("opens a setting, every step, and the store, from the dashboard", async () => {
    withQueries(<DashboardCard />);
    const colour = await screen.findByText("Brand colour set");
    fireEvent.click(colour.closest("div.rounded-lg")!.querySelector("button")!);
    expect(state.navigate).toHaveBeenCalledWith({
      href: "/admin/b/pura/settings?tab=identity&group=palette",
    });
    fireEvent.click(screen.getByRole("button", { name: /All 9 steps/ }));
    expect(state.navigate).toHaveBeenLastCalledWith({
      href: "/admin/b/pura/settings?checklist=open",
    });
    const preview = screen.getByRole("link", { name: /Preview store/ });
    expect(preview.getAttribute("href")).toMatch(/\/pura$/);
    fireEvent.click(preview);
    expect(window.localStorage.getItem("boutq_onboarding_previewed_b1")).toBe("true");
  });

  it("takes a first order as the store shared, and lists every step only for Settings' readers", async () => {
    state.orders = 4;
    withQueries(<DashboardCard mayOpenSettings={false} />);
    expect(await screen.findByText("7 of 9 done")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /All 9 steps/ })).toBeNull();
  });

  it("rests once the store has done every step, and reads nothing after", async () => {
    window.localStorage.setItem("boutq_launch_done_b1", "true");
    withQueries(<DashboardCard />);
    await waitFor(() => expect(screen.queryByText(/of 9 done/)).toBeNull());
  });
});
