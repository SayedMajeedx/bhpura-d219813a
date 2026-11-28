import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { guideHref, helpGuides, supportChatUrl, supportMessage } from "../src/lib/help/guides";

// Help inside the admin (the ease-of-use review of 2026-11-28): the admin had no guide and no way
// to reach Boutq. Five short guides open where the job is done, only for a reader who may open
// that page, and a WhatsApp chat says which store and page it is about.

const state = vi.hoisted(() => ({
  profile: { role: "brand_admin", status: "active", permissions: [] as string[] },
  number: "97339955508" as string | null,
  navigate: vi.fn(),
}));

const settingsMock = vi.hoisted(() => () => ({
  systemSettingsQueries: {
    supportNumber: () => ({
      queryKey: ["system-settings", "support-number"],
      queryFn: async () => state.number,
    }),
  },
}));
vi.mock("../src/lib/data/system-settings", settingsMock);
vi.mock("@/lib/data/system-settings", settingsMock);
const profileMock = vi.hoisted(() => () => ({ useProfile: () => ({ profile: state.profile }) }));
vi.mock("../src/lib/profile-context", profileMock);
vi.mock("@/lib/profile-context", profileMock);
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate }));

const { OsHelpPanel } = await import("../src/components/os/os-help");

const ids = (caller: Parameters<typeof helpGuides>[0], services = false) =>
  helpGuides(caller, { services }).map((g) => g.id);

describe("the guides", () => {
  it("are the five first jobs of a shop, and a services store's own", () => {
    const admin = { role: "brand_admin", status: "active" };
    expect(ids(admin)).toEqual([
      "add-product",
      "handle-order",
      "delivery-payment",
      "discount-code",
      "store-look",
    ]);
    expect(ids(admin, true)).toEqual([
      "add-service",
      "handle-booking",
      "payment",
      "discount-code",
      "store-look",
    ]);
  });

  it("never send a member of staff to a page that turns them away", () => {
    const packer = { role: "staff", status: "active", permissions: ["manage_orders"] };
    expect(ids(packer)).toEqual(["handle-order"]);
    expect(ids({ role: "courier", status: "active" })).toEqual(["handle-order"]);
    expect(ids({ role: "staff", status: "suspended", permissions: ["manage_orders"] })).toEqual([]);
  });

  it("open under the store's admin", () => {
    const [product] = helpGuides({ role: "admin", status: "active" });
    expect(guideHref(product, "pura")).toBe("/admin/b/pura/inventory?action=new");
  });

  it("start the chat with the store and the page, in the reader's language", () => {
    expect(supportMessage({ storeName: "Pura", pageName: "Orders", lang: "en" })).toBe(
      "Hello Boutq, I need help with my store Pura (the Orders page).",
    );
    expect(supportMessage({ storeName: "بيورا", lang: "ar" })).toBe(
      "مرحباً Boutq، أحتاج مساعدة في متجر بيورا.",
    );
    expect(supportChatUrl("+973 3995 5508", "Hi there")).toBe(
      "https://wa.me/97339955508?text=Hi%20there",
    );
    expect(supportChatUrl(null, "Hi")).toBeNull();
  });
});

const renderPanel = (lang: "ar" | "en" = "en") =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OsHelpPanel
        open
        onOpenChange={() => undefined}
        lang={lang}
        slug="pura"
        storeName="Pura"
        pageName="Orders"
      />
    </QueryClientProvider>,
  );

describe("the help panel", () => {
  beforeEach(() => {
    state.profile = { role: "brand_admin", status: "active", permissions: [] };
    state.number = "97339955508";
    state.navigate.mockReset();
  });

  it("opens a guide's steps and takes the merchant where the job is done", () => {
    renderPanel();
    const guide = screen.getByRole("button", { name: "Make a discount code" });
    expect(guide.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(guide);
    expect(guide.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/like EID10/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Make a code" }));
    expect(state.navigate).toHaveBeenCalledWith({ href: "/admin/b/pura/discounts?action=new" });
  });

  it("chats with Boutq's number as the super admin set it, saying the store and page", async () => {
    state.number = "+973 3300 0000";
    renderPanel();
    const chat = await waitFor(() => screen.getByRole("link", { name: /Chat with Boutq/ }));
    expect(chat.getAttribute("href")).toBe(
      `https://wa.me/97333000000?text=${encodeURIComponent(
        "Hello Boutq, I need help with my store Pura (the Orders page).",
      )}`,
    );
  });

  it("speaks Arabic on an Arabic page, and shows a member only their guides", () => {
    state.profile = { role: "staff", status: "active", permissions: ["manage_orders"] };
    renderPanel("ar");
    expect(screen.getByRole("button", { name: "تابع طلباً جديداً" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "أضف منتجاً" })).toBeNull();
  });
});
