import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isServicesProfile, resolveStoreModules } from "../src/lib/store-profile";

// A services store's pages talk about services and bookings: no stock switch, no
// gift box, no "Shop / New Arrivals / Sale" footer, and the right Arabic form.

const state = vi.hoisted(() => ({ services: true, lang: "ar" as "ar" | "en" }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
const storefrontMock = vi.hoisted(() => () => ({
  useIsServicesStore: () => state.services,
  useStorefront: () => ({
    brand: { id: "b1", slug: "aurora", name_en: "Aurora", name_ar: "أورورا" },
    settings: { newsletter_enabled: true, socials: [], footer_logo_size: 32 },
    get lang() {
      return state.lang;
    },
    t: (ar: string, en: string) => (state.lang === "ar" ? ar : en),
  }),
}));
vi.mock("../src/lib/storefront-context", storefrontMock);
vi.mock("@/lib/storefront-context", storefrontMock);
vi.mock("../src/components/storefront/NewsletterForm", () => ({ NewsletterForm: () => <div /> }));
vi.mock("@/components/storefront/NewsletterForm", () => ({ NewsletterForm: () => <div /> }));
vi.mock("../src/components/storefront/TrustBar", () => ({ TrustBar: () => <div /> }));
vi.mock("@/components/storefront/TrustBar", () => ({ TrustBar: () => <div /> }));
vi.mock("../src/lib/variant-axes", () => ({
  isColorSwatchAxis: () => false,
  useStoreAxisDefaults: () => ({}),
}));
vi.mock("@/lib/variant-axes", () => ({
  isColorSwatchAxis: () => false,
  useStoreAxisDefaults: () => ({}),
}));

const { FooterV2 } = await import("../src/components/storefront/FooterV2");
const { CategoryFilters } = await import("../src/components/storefront/CategoryFilters");

beforeEach(() => {
  state.services = true;
  state.lang = "ar";
});

describe("which stores are services stores", () => {
  it("takes bookings and sells no goods", () => {
    expect(isServicesProfile(resolveStoreModules({ store_vertical: "services" }))).toBe(true);
    expect(isServicesProfile(resolveStoreModules({ store_vertical: "fashion" }))).toBe(false);
    // A services store that also keeps stock or ships stays a shop.
    expect(
      isServicesProfile(
        resolveStoreModules({ store_vertical: "services", store_modules: { stock: true } }),
      ),
    ).toBe(false);
    expect(
      isServicesProfile(
        resolveStoreModules({ store_vertical: "services", store_modules: { shipping: true } }),
      ),
    ).toBe(false);
  });
});

describe("a services store's footer", () => {
  it("is about services and booking, with Arabic that suits everyone", () => {
    render(<FooterV2 />);
    expect(screen.getAllByText("خدماتنا").length).toBeGreaterThan(0);
    expect(screen.getByText("تواصل معنا")).toBeInTheDocument();
    expect(screen.queryByText("تواصلي معنا")).toBeNull();
    expect(screen.getByText("كل الخدمات")).toBeInTheDocument();
    expect(screen.getByText("احجز موعدك")).toBeInTheDocument();
    for (const gone of ["تسوّق", "كل المنتجات", "وصل حديثاً", "التخفيضات"]) {
      expect(screen.queryByText(gone), gone).toBeNull();
    }
  });

  it("stays a shop's footer for a shop", () => {
    state.services = false;
    render(<FooterV2 />);
    expect(screen.getAllByText("تسوّق").length).toBeGreaterThan(0);
    expect(screen.getAllByText("كل المنتجات").length).toBeGreaterThan(0);
    expect(screen.getAllByText("وصل حديثاً").length).toBeGreaterThan(0);
    expect(screen.getByText("تواصل معنا")).toBeInTheDocument();
  });

  it("opens the mobile Services section with the booking link", () => {
    state.lang = "en";
    render(<FooterV2 />);
    expect(screen.getAllByText("Our services").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Our services" })[0]);
    expect(screen.getAllByText("Book a date").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sale")).toBeNull();
  });
});

describe("the listing filters", () => {
  const props = {
    filters: {
      sizes: [],
      colors: [],
      occasions: [],
      facts: {},
      minPrice: null,
      maxPrice: null,
      inStockOnly: false,
      sort: "new" as const,
    },
    onChange: vi.fn(),
    facets: {
      sizes: [
        { value: "3 hours", unit: null, count: 2 },
        { value: "4 hours", unit: null, count: 1 },
      ],
      colors: [],
      occasions: [],
      facts: [],
      price: { min: 40, max: 185 },
    },
    totalFilteredCount: 3,
  };

  it("for services: filter services by duration and price, with no stock switch", () => {
    render(<CategoryFilters {...props} />);
    expect(screen.getByText("تصفية الخدمات")).toBeInTheDocument();
    expect(screen.getByText("المدة")).toBeInTheDocument();
    expect(screen.queryByText("المتوفر في المخزون فقط")).toBeNull();
    expect(screen.queryByText("المنتجات", { exact: false })).toBeNull();
  });

  it("for a shop: the stock switch and the product heading stay", () => {
    state.services = false;
    state.lang = "en";
    render(<CategoryFilters {...props} />);
    expect(screen.getByText("Filters")).toBeInTheDocument();
    expect(screen.getByText("In-stock items only")).toBeInTheDocument();
  });
});

describe("a services store's listing, product page and hero (go-live fix 7)", () => {
  const head = async (servicesStore: boolean, lang: "ar" | "en" = "ar") => {
    const { categoryHead } = await import("../src/features/storefront-shell/lib/category-head");
    const result = categoryHead({
      loaderData: {
        brand: { name_en: "Aurora", name_ar: "أورورا", logo_url: null },
        initialLang: lang,
        servicesStore,
      },
      slug: "aurora",
      category: "all",
    }) as { meta: Array<Record<string, string>> };
    const meta = (key: string) =>
      result.meta.find((m) => m.title !== undefined && key === "title")?.title ??
      result.meta.find((m) => m.name === key)?.content;
    return { title: meta("title"), description: meta("description") };
  };

  it("is titled and described as its services, booked rather than shopped", async () => {
    expect(await head(true)).toEqual({
      title: "كل الخدمات | أورورا",
      description: "احجز كل الخدمات من أورورا.",
    });
    expect(await head(true, "en")).toEqual({
      title: "All services | Aurora",
      description: "Book All services with Aurora.",
    });
    // A shop keeps its own words.
    expect(await head(false)).toEqual({
      title: "كل المنتجات | أورورا",
      description: "تسوّق كل المنتجات من أورورا.",
    });
  });

  it("is told apart by the loader with the same rule as the page", async () => {
    const { isServicesStorefront } = await import("../src/lib/storefront-modules");
    expect(isServicesStorefront({ store_vertical: "services" }, [])).toBe(true);
    expect(isServicesStorefront({ store_vertical: "fashion" }, null)).toBe(false);
  });

  it("sends a hero button pointing at the shop's products section to the booking page", async () => {
    const { heroButtonHref, newSlideButton } = await import("../src/lib/hero-link");
    const services = { slug: "aurora", servicesStore: true };
    expect(heroButtonHref("#products", services)).toBe("/aurora/book");
    expect(heroButtonHref("", services)).toBe("/aurora/book");
    expect(heroButtonHref("https://wa.me/97339990016", services)).toBe("https://wa.me/97339990016");
    expect(heroButtonHref("#products", { slug: "pura", servicesStore: false })).toBe("#products");
    expect(newSlideButton("/aurora/book")).toEqual({
      button_en: "Book now",
      button_ar: "احجز الآن",
      button_href: "/aurora/book",
    });
    expect(newSlideButton(null).button_ar).toBe("تسوّق الآن");
  });
});

describe("a services home's trust bar (go-live fix 10)", () => {
  it("shows under the hero by the same rule as the shop's home", async () => {
    const { trustBarBelowHero } = await import("../src/features/storefront-home/lib/home-products");
    expect(trustBarBelowHero({})).toBe(true);
    expect(trustBarBelowHero({ trust_bar_position: "both" })).toBe(true);
    expect(trustBarBelowHero({ trust_bar_position: "above_footer" })).toBe(false);
    expect(trustBarBelowHero({ trust_bar_enabled: false })).toBe(false);
  });

  it("is listed in a services store's home page settings, with one switch", async () => {
    const { SERVICES_HOME_SECTIONS, trustBadgesTurnedOn } =
      await import("../src/features/settings/tabs/storefront/home-page-sections");
    expect(SERVICES_HOME_SECTIONS.slice(0, 2)).toEqual(["hero", "trust_bar"]);
    expect(trustBadgesTurnedOn({ trust_badges: { enabled: false, items: [] } })).toEqual({
      enabled: true,
      items: [],
    });
    expect(trustBadgesTurnedOn({})).toEqual({ items: [], enabled: true });
  });
});
