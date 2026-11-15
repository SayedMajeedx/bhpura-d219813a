import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { phoneMenuLinks } from "../src/features/storefront-shell/lib/phone-menu";

// The phone header review of 2026-11-15: the menu was a wide box with a grid icon, a word and an
// arrow, which pushed the logo 12px aside; its panel was boxed categories with made-up icons; and
// a shopper on a phone had no way to the wishlist or the currency, and reached the account only
// through the footer.

const state = vi.hoisted(() => ({
  lang: "ar" as "ar" | "en",
  signedIn: false,
  services: false,
  giftCards: true,
  settings: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params: _p, search: _s, ...props }: Record<string, unknown>) => (
    <a href={String(to)} {...(props as object)}>
      {children as React.ReactNode}
    </a>
  ),
  useLocation: () => ({ pathname: "/pura" }),
}));

const storefrontModule = vi.hoisted(() => async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => ({
    brand: { id: "b1", slug: "pura", name_ar: "بيورا", name_en: "Pura" },
    settings: {
      pages: [{ slug: "terms", title_ar: "الشروط", title_en: "Terms" }],
      menu_show_pages: true,
      menu_show_home: true,
      menu_show_account: true,
      menu_show_orders: true,
      ...state.settings,
    },
    lang: state.lang,
    setLang: () => undefined,
    currency: "BHD",
    t: (ar: string, en: string) => (state.lang === "ar" ? ar : en),
    cartCount: 0,
    wishlistCount: 3,
    session: state.signedIn ? { user: { email: "a@b.c" } } : null,
    isStoreMember: state.signedIn,
  }),
  useIsServicesStore: () => state.services,
}));
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));

const giftCardsModule = vi.hoisted(() => () => ({
  giftCardOnlineQueries: {
    offer: (slug: string) => ({
      queryKey: ["gift-card-offer", slug],
      queryFn: async () => (state.giftCards ? { amounts: [10] } : null),
    }),
  },
}));
vi.mock("../src/lib/data/gift-cards/online", giftCardsModule);
vi.mock("@/lib/data/gift-cards/online", giftCardsModule);

const currencyModule = vi.hoisted(() => () => ({
  CurrencySwitcher: () => <select aria-label="currency" />,
}));
vi.mock("../src/components/storefront/CurrencySwitcher", currencyModule);
vi.mock("@/components/storefront/CurrencySwitcher", currencyModule);

const cartModule = vi.hoisted(() => () => ({
  CartDrawer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../src/components/storefront/StorefrontCartDrawer", cartModule);
vi.mock("@/components/storefront/StorefrontCartDrawer", cartModule);

const categoriesModule = vi.hoisted(() => () => ({
  useStorefrontCategories: () => ({
    data: [
      { id: "c1", slug: "abayas", name_ar: "عبايات", name_en: "Abayas", parent_id: null },
      { id: "c2", slug: "evening", name_ar: "سهرة", name_en: "Evening", parent_id: "c1" },
    ],
  }),
}));
vi.mock("../src/lib/use-storefront-categories", categoriesModule);
vi.mock("@/lib/use-storefront-categories", categoriesModule);

const { MobileStorefrontDropdown } =
  await import("../src/components/storefront/StorefrontNavigation");
const { HeaderShoppingIcons } = await import("../src/components/storefront/HeaderActions");

function openMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MobileStorefrontDropdown />
    </QueryClientProvider>,
  );
  const trigger = screen.getByRole("button", { name: state.lang === "ar" ? "القائمة" : "Menu" });
  fireEvent.click(trigger);
  return { trigger, panel: screen.getByRole("dialog") };
}

beforeEach(() => {
  state.lang = "ar";
  state.signedIn = false;
  state.services = false;
  state.giftCards = true;
  state.settings = {};
});

describe("the shopper's links in the phone's menu", () => {
  const store = {
    signedIn: false,
    showAccount: true,
    showOrders: true,
    servicesStore: false,
    sellsGiftCards: false,
  };

  it("offers sign in, the wishlist and tracking an order", () => {
    expect(phoneMenuLinks(store).map((l) => l.key)).toEqual(["sign-in", "wishlist", "track-order"]);
  });

  it("goes to the account once signed in, and to bookings in a services store", () => {
    expect(phoneMenuLinks({ ...store, signedIn: true })[0]).toMatchObject({
      key: "account",
      en: "My account",
    });
    const services = phoneMenuLinks({ ...store, signedIn: true, servicesStore: true });
    expect(services[0].en).toBe("My bookings & account");
    expect(services.map((l) => l.key)).not.toContain("track-order");
  });

  it("follows the store's menu settings, and offers gift cards while it sells them", () => {
    expect(
      phoneMenuLinks({ ...store, showAccount: false, showOrders: false }).map((l) => l.key),
    ).toEqual(["wishlist"]);
    expect(phoneMenuLinks({ ...store, sellsGiftCards: true }).map((l) => l.key)).toContain(
      "gift-cards",
    );
  });
});

describe("the phone's menu", () => {
  it("opens from three thin lines, an icon with a name and no word beside it", () => {
    const { trigger } = openMenu();
    expect(trigger.textContent).toBe("");
  });

  it("lists the categories plainly, then the shopper's links, the pages and the language", async () => {
    const { panel } = openMenu();
    const categories = within(panel).getByRole("navigation", { name: "الأقسام" });
    expect(
      within(categories)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual(["الرئيسية", "عبايات"]);
    // A sub-category opens under its category.
    fireEvent.click(within(panel).getByRole("button", { name: "عرض أقسام عبايات" }));
    expect(within(panel).getByRole("link", { name: "سهرة" })).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "كل عبايات" })).toBeTruthy();

    expect(within(panel).getByRole("link", { name: "تسجيل الدخول" }).getAttribute("href")).toBe(
      "/$slug/auth",
    );
    expect(within(panel).getByRole("link", { name: /المفضلة/ }).textContent).toContain("3");
    expect(within(panel).getByRole("link", { name: "تتبّع طلبك" })).toBeTruthy();
    expect(await within(panel).findByRole("link", { name: "بطاقات الهدايا" })).toBeTruthy();
    expect(within(panel).getByRole("link", { name: "الشروط" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "تغيير اللغة إلى الإنجليزية" })).toBeTruthy();
    expect(within(panel).getByRole("combobox", { name: "currency" })).toBeTruthy();
  });

  it("follows the store's own switches for Home and the account", () => {
    state.settings = { menu_show_home: false, menu_show_account: false };
    const { panel } = openMenu();
    expect(within(panel).queryByRole("link", { name: "الرئيسية" })).toBeNull();
    expect(within(panel).queryByRole("link", { name: "تسجيل الدخول" })).toBeNull();
    expect(within(panel).getByRole("link", { name: /المفضلة/ })).toBeTruthy();
  });
});

describe("the phone's bar", () => {
  it("holds the wishlist and the bag; the account is in the menu", () => {
    render(<HeaderShoppingIcons account={false} />);
    expect(screen.getByRole("link", { name: "المفضلة" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "سلة التسوق" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "تسجيل الدخول" })).toBeNull();
  });
});
