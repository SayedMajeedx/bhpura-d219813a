import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { getAdminNavItems } from "../src/config/admin-navigation";
import { SETTINGS_TABS } from "../src/features/settings/registry";
import { resolveStoreModules } from "../src/lib/store-profile";

// One Notifications (the ease-of-use review of 2026-11-28): Settings → Notifications and a
// Store page also called Notifications both listed the store's alert recipients. Settings is now
// where notifications are set (what messages say, who gets alerts), and the page shows what went
// out, under its own name: Sent messages.

const state = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  useNavigate: () => state.navigate,
}));
const brandMock = vi.hoisted(() => () => ({ useBrand: () => ({ id: "b1", slug: "pura" }) }));
vi.mock("../src/lib/brand-context", brandMock);
vi.mock("@/lib/brand-context", brandMock);
const i18nMock = vi.hoisted(() => () => ({
  useI18n: () => ({ lang: "en" }),
  useT: () => (key: string) => key,
}));
vi.mock("../src/lib/i18n", i18nMock);
vi.mock("@/lib/i18n", i18nMock);
const recipientsMock = vi.hoisted(() => () => ({
  notificationRecipientsQueries: {
    activity: () => ({ queryKey: ["activity"], queryFn: async () => [] }),
    list: () => ({ queryKey: ["recipients"], queryFn: async () => [] }),
  },
}));
vi.mock("../src/lib/data/notification-recipients", recipientsMock);
vi.mock("@/lib/data/notification-recipients", recipientsMock);
const numberMock = vi.hoisted(() => () => ({ useOrderNumber: () => (n: number) => `#${n}` }));
vi.mock("../src/hooks/use-order-number", numberMock);
vi.mock("@/hooks/use-order-number", numberMock);
const pushMock = vi.hoisted(() => () => ({ CustomerPushCenter: () => <p>push centre</p> }));
vi.mock("../src/components/communications/CustomerPushCenter", pushMock);
vi.mock("@/components/communications/CustomerPushCenter", pushMock);

const { Route } =
  (await import("../src/routes/_authenticated/admin.b.$slug.communications")) as unknown as {
    Route: { options: { component: React.ComponentType } };
  };

describe("notifications", () => {
  it("are named once in the admin: the Settings tab, beside a page of what was sent", () => {
    const items = getAdminNavItems({
      activeSlug: "pura",
      isCourier: false,
      isAdmin: true,
      hasPermission: () => true,
      t: (key) => key,
      lang: "en",
      storefrontMode: "shop",
      storeModules: resolveStoreModules({ store_vertical: "fashion" }),
    });
    const names = [
      ...items.flatMap((item) => [item.labelEn, item.labelAr]),
      ...SETTINGS_TABS.flatMap((t) => [t.label.en, t.label.ar]),
    ];
    expect(names.filter((name) => name === "Notifications")).toHaveLength(1);
    expect(names.filter((name) => name === "الإشعارات")).toHaveLength(1);
    const page = items.find((item) => item.id === "communications");
    expect([page?.labelEn, page?.labelAr]).toEqual(["Sent messages", "الرسائل المرسلة"]);
  });

  it("show what was sent, never the recipients a second time, and lead to their settings", () => {
    const Page = Route.options.component;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Sent messages" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Emails sent/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.queryByText(/Alert Recipient/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Customer app notifications/ }));
    expect(screen.getByText("push centre")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Notification settings/ }));
    expect(state.navigate).toHaveBeenCalledWith({
      href: "/admin/b/pura/settings?tab=notifications&group=templates",
    });
  });
});
