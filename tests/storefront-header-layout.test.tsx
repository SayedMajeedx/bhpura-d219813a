import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ONE_ROW_MAX_LINKS,
  isCurrentMenuLink,
  menuFitsOneRow,
} from "../src/features/storefront-shell/lib/header-layout";

// The header review of 2026-11-15: on a laptop the header was six labelled buttons of one weight
// (English, BHD, Sign in, Notifications, Wishlist, Cart), a large grey search box, and a second
// row of boxed links with a dashed "Home". It read like an app's toolbar.

const state = vi.hoisted(() => ({
  lang: "ar" as "ar" | "en",
  signedIn: false,
  catalog: false,
  categories: [] as Array<Record<string, unknown>>,
  pathname: "/pura",
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to: _to,
    params: _params,
    search: _search,
    ...props
  }: Record<string, unknown>) => (
    <a href="#" {...(props as object)}>
      {children as React.ReactNode}
    </a>
  ),
  useLocation: () => ({ pathname: state.pathname }),
}));

const storefrontModule = vi.hoisted(() => async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => ({
    brand: { id: "b1", slug: "pura", name_ar: "بيورا", name_en: "Pura" },
    settings: { storefront_mode: state.catalog ? "catalog" : "shop" },
    lang: state.lang,
    setLang: () => undefined,
    currency: "BHD",
    t: (ar: string, en: string) => (state.lang === "ar" ? ar : en),
    cartCount: 2,
    wishlistCount: 0,
    session: state.signedIn ? { user: { email: "a@b.c" } } : null,
    isStoreMember: state.signedIn,
  }),
}));
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));

const cartModule = vi.hoisted(() => () => ({
  CartDrawer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../src/components/storefront/StorefrontCartDrawer", cartModule);
vi.mock("@/components/storefront/StorefrontCartDrawer", cartModule);

const currencyModule = vi.hoisted(() => () => ({
  CurrencySwitcher: () => <select aria-label="currency" />,
}));
vi.mock("../src/components/storefront/CurrencySwitcher", currencyModule);
vi.mock("@/components/storefront/CurrencySwitcher", currencyModule);

const categoriesModule = vi.hoisted(() => () => ({
  useStorefrontCategories: () => ({ data: state.categories }),
}));
vi.mock("../src/lib/use-storefront-categories", categoriesModule);
vi.mock("@/lib/use-storefront-categories", categoriesModule);

const { HeaderShoppingIcons, HeaderStoreSettings } =
  await import("../src/components/storefront/HeaderActions");
const { DesktopStoreNavigation } =
  await import("../src/components/storefront/StorefrontNavigation");

beforeEach(() => {
  state.lang = "ar";
  state.signedIn = false;
  state.catalog = false;
  state.pathname = "/pura";
  state.categories = [
    { id: "c1", slug: "abayas", name_ar: "عبايات", name_en: "Abayas", parent_id: null },
    { id: "c2", slug: "dresses", name_ar: "فساتين", name_en: "Dresses", parent_id: null },
    { id: "c3", slug: "sale", name_ar: "تنزيلات", name_en: "Sale", parent_id: null },
  ];
});

describe("when the menu shares the logo's row", () => {
  it("fits a few short names, as Pura's four", () => {
    expect(menuFitsOneRow(["عبايات", "فساتين", "وصل حديثا", "الأكثر مبيعًا"], false)).toBe(true);
    expect(
      menuFitsOneRow(["Abayas", 'Dresses "Under Abaya"', "New arrivals", "Most selling"], false),
    ).toBe(true);
  });

  it("gives a long or a large menu its own row, and a centred logo too", () => {
    const many = Array.from({ length: ONE_ROW_MAX_LINKS + 1 }, (_, i) => `Cat ${i}`);
    expect(menuFitsOneRow(many, false)).toBe(false);
    expect(
      menuFitsOneRow(["Evening abayas and kaftans", "Everyday dresses and sets", "Gifts"], false),
    ).toBe(false);
    expect(menuFitsOneRow(["Abayas"], true)).toBe(false);
    expect(menuFitsOneRow([], false)).toBe(false);
  });

  it("knows the page being shown, whatever the address's spelling", () => {
    expect(isCurrentMenuLink("/pura/abayas", "pura", "abayas")).toBe(true);
    expect(isCurrentMenuLink("/pura/abayas/", "pura", "abayas")).toBe(true);
    expect(isCurrentMenuLink("/pura/%D8%B9%D8%A8%D8%A7%D9%8A%D8%A7%D8%AA", "pura", "عبايات")).toBe(
      true,
    );
    expect(isCurrentMenuLink("/pura/abayas-sale", "pura", "abayas")).toBe(false);
    expect(isCurrentMenuLink("/pura", "pura", "abayas")).toBe(false);
  });
});

describe("the header's icons", () => {
  it("are icons named for screen readers, with no word beside them", () => {
    render(<HeaderShoppingIcons onSearch={() => undefined} />);
    for (const name of ["البحث", "تسجيل الدخول", "المفضلة", "سلة التسوق"]) {
      const control = screen.queryByRole("button", { name }) ?? screen.getByRole("link", { name });
      // Only the bag's count may be written in it.
      expect(control.textContent?.replace(/\d/g, "").trim()).toBe("");
    }
  });

  it("offers no notifications button: the store sends a shopper none", () => {
    render(<HeaderShoppingIcons onSearch={() => undefined} />);
    expect(screen.queryByRole("button", { name: /الإشعارات|Notifications/ })).toBeNull();
  });

  it("goes to the account once signed in, and has no bag in a catalog", () => {
    state.signedIn = true;
    state.catalog = true;
    state.lang = "en";
    render(<HeaderShoppingIcons />);
    expect(screen.getByRole("link", { name: "My account" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Shopping cart" })).toBeNull();
  });

  it("writes the other language in itself, beside the currency", () => {
    render(<HeaderStoreSettings />);
    const button = screen.getByRole("button", { name: "تغيير اللغة إلى الإنجليزية" });
    expect(button.textContent).toBe("English");
    expect(button.querySelector("[lang]")?.getAttribute("lang")).toBe("en");
    expect(screen.getByRole("combobox", { name: "currency" })).toBeTruthy();
  });
});

describe("the menu", () => {
  it("has no Home link (the logo is the way home) and marks the page being shown", () => {
    state.pathname = "/pura/dresses";
    render(<DesktopStoreNavigation />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["عبايات", "فساتين", "تنزيلات"]);
    expect(screen.getByRole("link", { name: "فساتين" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "عبايات" }).getAttribute("aria-current")).toBeNull();
  });

  it("draws no box and no lift, only a line", () => {
    render(<DesktopStoreNavigation variant="inline" />);
    const link = screen.getByRole("link", { name: "عبايات" });
    expect(link.className).not.toMatch(/border-dashed|-translate-y/);
    expect(link.className).toMatch(/after:h-px/);
    expect(screen.getByRole("navigation", { name: "الأقسام" }).className).not.toMatch(/border-t/);
  });

  it("is not drawn for a store with no categories", () => {
    state.categories = [];
    const { container } = render(<DesktopStoreNavigation />);
    expect(container.innerHTML).toBe("");
  });
});
