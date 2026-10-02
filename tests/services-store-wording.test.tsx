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
      size: null,
      color: null,
      minPrice: null,
      maxPrice: null,
      inStockOnly: false,
      sort: "new" as const,
    },
    onChange: vi.fn(),
    availableSizes: ["3 hours", "4 hours"],
    availableColors: [],
    minCatalogPrice: 40,
    maxCatalogPrice: 185,
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
