import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A home page section (best sellers) with its banner: the picture and title the merchant chose
// stay, the band's height follows the store's banner size, and a few products sit centred.

const state = vi.hoisted(() => ({
  size: undefined as string | null | undefined,
  lang: "en" as "ar" | "en",
}));
const storefrontMock = vi.hoisted(() => () => ({
  useStorefront: () => ({
    get lang() {
      return state.lang;
    },
    settings: {
      show_new_arrivals: true,
      best_sellers_title_en: null,
      best_sellers_title_ar: null,
      secondary_banner_parallax_enabled: false,
      secondary_banner_parallax_mobile_enabled: false,
      secondary_banner_parallax_breakpoint: 768,
      get storefront_banner_size() {
        return state.size;
      },
      homepage_editorial_sections: {
        best: {
          enabled: true,
          banner_image_url: "https://cdn.test/banner.jpg",
          background_color: null,
          background_image_url: null,
        },
        sale: { enabled: true, banner_image_url: null },
        trending: { enabled: true, banner_image_url: null },
      },
    },
  }),
}));
vi.mock("../src/lib/storefront-context", storefrontMock);
vi.mock("@/lib/storefront-context", storefrontMock);
const cardMock = vi.hoisted(() => () => ({
  ProductCard: ({ product, className }: { product: { id: string }; className?: string }) => (
    <div data-testid="card" data-id={product.id} className={className} />
  ),
}));
vi.mock("../src/components/storefront/product-card", cardMock);
vi.mock("@/components/storefront/product-card", cardMock);
const parallaxMock = vi.hoisted(() => () => ({
  SecondaryBannerParallax: ({
    className,
    children,
    background,
  }: {
    className?: string;
    children: React.ReactNode;
    background: React.ReactNode;
  }) => (
    <div data-testid="banner" className={className}>
      {background}
      {children}
    </div>
  ),
}));
vi.mock("../src/components/storefront/secondary-banner-parallax", parallaxMock);
vi.mock("@/components/storefront/secondary-banner-parallax", parallaxMock);
vi.mock("../src/components/responsive-media", () => ({ ResponsiveImage: () => <img alt="" /> }));
vi.mock("@/components/responsive-media", () => ({ ResponsiveImage: () => <img alt="" /> }));

const { MerchandisingSection } =
  await import("../src/features/storefront-home/components/MerchandisingSection");

const products = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}` })) as unknown as Parameters<
    typeof MerchandisingSection
  >[0]["products"];

const renderSection = (n: number) =>
  render(<MerchandisingSection kind="best" products={products(n)} />);

beforeEach(() => {
  state.size = undefined;
  state.lang = "en";
});

describe("a home page section's banner", () => {
  it("is compact when the store has not chosen, and keeps its title", () => {
    renderSection(5);
    expect(screen.getByTestId("banner").className).toContain("min-h-[clamp(8rem,14vw,11rem)]");
    const title = screen.getByRole("heading", { name: "Best sellers" });
    expect(title.className).toContain("text-[clamp(1.5rem,3vw,2.25rem)]");
  });

  it("follows the store's banner size, large being the original band", () => {
    state.size = "large";
    const { unmount } = renderSection(5);
    expect(screen.getByTestId("banner").className).toContain("min-h-[clamp(14rem,30vw,24rem)]");
    expect(screen.getByRole("heading", { name: "Best sellers" }).className).toContain(
      "text-[clamp(2rem,5vw,4rem)]",
    );
    unmount();
    state.size = "medium";
    renderSection(5);
    expect(screen.getByTestId("banner").className).toContain("min-h-[clamp(11rem,22vw,16rem)]");
  });

  it("keeps the merchant's picture and the Arabic title", () => {
    state.lang = "ar";
    renderSection(5);
    expect(screen.getByRole("heading", { name: "الأكثر مبيعاً" })).toBeInTheDocument();
    expect(screen.getByTestId("banner").querySelector("img")).not.toBeNull();
  });
});

describe("a home page section's products", () => {
  it("sit centred, at a grid column's width, when there are only a few", () => {
    renderSection(2);
    const cards = screen.getAllByTestId("card");
    expect(cards).toHaveLength(2);
    expect(cards[0].parentElement?.className).toContain("md:justify-center");
    expect(cards[0].className).toContain("lg:w-[calc((100%-4.5rem)/4)]");
  });

  it("fill the grid from four products", () => {
    renderSection(5);
    const cards = screen.getAllByTestId("card");
    expect(cards).toHaveLength(5);
    expect(cards[0].parentElement?.className).toContain("lg:grid-cols-4");
    expect(cards[0].parentElement?.className).not.toContain("md:justify-center");
    expect(cards[0].className).toContain("md:w-auto");
  });
});
