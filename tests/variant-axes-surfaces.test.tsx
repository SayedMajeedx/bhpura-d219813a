import React from "react";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrandAddonRow } from "../src/lib/addons/addon-types";

// Storefront surfaces read the store vertical and installed packs from context.
const store = vi.hoisted(() => ({
  lang: "ar",
  vertical: "coffee",
  addons: [] as BrandAddonRow[],
}));
const storefront = () => ({
  lang: store.lang,
  t: (ar: string, en: string) => (store.lang === "ar" ? ar : en),
  settings: { store_vertical: store.vertical },
  currency: "BHD",
  addToCart: vi.fn(),
  brand: { id: "b1", slug: "qoffee" },
});
const addonsContext = () => ({ addons: store.addons, isInstalled: () => false, isLoading: false });
vi.mock("../src/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: storefront,
}));
vi.mock("@/lib/storefront-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useStorefront: storefront,
}));
vi.mock("../src/components/addons/AddonsProvider", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAddons: addonsContext,
}));
vi.mock("@/components/addons/AddonsProvider", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAddons: addonsContext,
}));
// Quick view loads the full product; the card's data is enough here.
const storefrontData = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { storefrontQueries: object };
  return {
    ...actual,
    storefrontQueries: {
      ...actual.storefrontQueries,
      product: () => ({ queryKey: ["quick-view-product"], queryFn: async () => null }),
    },
  };
};
vi.mock("../src/lib/data/storefront", (importOriginal) => storefrontData(importOriginal));
vi.mock("@/lib/data/storefront", (importOriginal) => storefrontData(importOriginal));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));

const { ColorDots } = await import("../src/components/storefront/ColorDots");
const { CategoryFilters } = await import("../src/components/storefront/CategoryFilters");
const { QuickViewModal } = await import("../src/components/storefront/QuickViewModal");
const { resolveProductAxes } = await import("../src/features/product-page/lib/variant-options");

const installed = (addon_id: string) => ({ addon_id, status: "installed" }) as BrandAddonRow;
const coffeeStore = () => {
  store.lang = "ar";
  store.vertical = "coffee";
  store.addons = [installed("coffee-roastery")];
};
const fashionStore = () => {
  store.lang = "en";
  store.vertical = "fashion";
  store.addons = [];
};

// The Qoffee product from the bug report: roast in `color`, weight in `size`.
const coffeeVariants = [
  { id: "v1", color: "medium", size: "250", size_unit: "g", selling_price: 5, stock_main: 3 },
];
const fashionVariants = [
  { id: "v1", color: "Black", size: "M", selling_price: 20, stock_main: 3 },
  { id: "v2", color: "Beige", size: "L", selling_price: 20, stock_main: 3 },
];

beforeEach(coffeeStore);

describe("storefront surfaces use the store's option axes", () => {
  it("product page: a roast is never drawn as a colour swatch", () => {
    const offered = { size: ["250"], color: ["medium"], fabric: [], four: [], five: [] };
    const coffee = resolveProductAxes({
      product: null,
      addons: [installed("coffee-roastery")],
      storeVertical: "coffee",
      lang: "ar",
      offered,
    });
    expect(coffee.axes.color.label).toBe("درجة التحميص");
    expect(coffee.axes.color.visible).toBe(true);
    expect(coffee.isVisualColorAxis).toBe(false);

    const fashion = resolveProductAxes({
      product: null,
      addons: [],
      storeVertical: "fashion",
      lang: "en",
      offered: { ...offered, size: ["M"], color: ["Black", "Beige"] },
    });
    expect(fashion.isVisualColorAxis).toBe(true);
  });

  it("colour dots: none for a roastery, one per colour for fashion", () => {
    const coffee = render(<ColorDots variants={coffeeVariants} />);
    expect(coffee.container).toBeEmptyDOMElement();
    coffee.unmount();

    fashionStore();
    render(<ColorDots variants={fashionVariants} />);
    const group = screen.getByRole("group");
    expect(within(group).getByLabelText("Black")).toBeInTheDocument();
    expect(within(group).getByLabelText("Beige")).toBeInTheDocument();
  });

  it("category filters: headings follow the store, roasts are text chips", () => {
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
      minCatalogPrice: 0,
      maxCatalogPrice: 100,
      totalFilteredCount: 1,
    };
    const coffee = render(
      <CategoryFilters
        {...props}
        availableSizes={["250"]}
        sizeUnits={{ "250": "g" }}
        availableColors={[{ name: "medium", hex: null }]}
      />,
    );
    expect(screen.getByText("درجة التحميص")).toBeInTheDocument();
    expect(screen.getByText("الوزن / الحجم")).toBeInTheDocument();
    expect(screen.queryByText("اللون")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("medium")).not.toBeInTheDocument();
    coffee.unmount();

    fashionStore();
    render(
      <CategoryFilters
        {...props}
        availableSizes={["M"]}
        availableColors={[{ name: "Black", hex: null }]}
      />,
    );
    // A swatch: named by the colour, painted with it, no text.
    const swatch = screen.getByRole("button", { name: "Black" });
    expect(swatch.style.backgroundColor).not.toBe("");
    expect(swatch).toHaveTextContent("");
  });

  it("quick view: option groups carry the store's labels", () => {
    const product = { id: "p1", name: "Qoffee", base_price: 5, product_variants: coffeeVariants };
    const view = (p: typeof product) =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <QuickViewModal open onOpenChange={vi.fn()} product={p} brandSlug="qoffee" />
        </QueryClientProvider>,
      );
    const coffee = view(product);
    const roast = screen.getByRole("radiogroup", { name: "درجة التحميص" });
    expect(within(roast).getByRole("radio")).not.toHaveAttribute("aria-label");
    expect(screen.getByRole("radiogroup", { name: "الوزن / الحجم" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "اللون" })).not.toBeInTheDocument();
    coffee.unmount();

    fashionStore();
    view({ ...product, product_variants: fashionVariants });
    const colours = screen.getByRole("radiogroup", { name: "Color" });
    expect(within(colours).getByRole("radio", { name: "Black" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Size" })).toBeInTheDocument();
  });
});
