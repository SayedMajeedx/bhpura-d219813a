import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The card's quick add and its quick view, read through `quickAddPlan` with Pura's products.
const store = vi.hoisted(() => ({
  lang: "ar" as "ar" | "en",
  modules: { made_to_order: true } as Record<string, boolean>,
  addToCart: vi.fn(),
  navigate: vi.fn(),
  openCart: vi.fn(() => true),
  mode: "shop",
}));
const storefront = () => ({
  lang: store.lang,
  t: (ar: string, en: string) => (store.lang === "ar" ? ar : en),
  settings: { store_vertical: "abayas", storefront_mode: store.mode },
  currency: "BHD",
  addToCart: store.addToCart,
  brand: { id: "b1", slug: "pura" },
});
const context = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: storefront,
  useIsServicesStore: () => false,
  useStoreModules: () => store.modules,
});
vi.mock("../src/lib/storefront-context", (importOriginal) => context(importOriginal));
vi.mock("@/lib/storefront-context", (importOriginal) => context(importOriginal));
const addons = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useAddons: () => ({ addons: [], isInstalled: () => false, isLoading: false }),
});
vi.mock("../src/components/addons/AddonsProvider", (importOriginal) => addons(importOriginal));
vi.mock("@/components/addons/AddonsProvider", (importOriginal) => addons(importOriginal));
const drawer = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  openCartDrawer: () => store.openCart(),
});
vi.mock("../src/lib/cart-drawer", (importOriginal) => drawer(importOriginal));
vi.mock("@/lib/cart-drawer", (importOriginal) => drawer(importOriginal));
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
vi.mock("../src/hooks/use-live-offers", () => ({ useLiveOffers: () => [] }));
vi.mock("@/hooks/use-live-offers", () => ({ useLiveOffers: () => [] }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => store.navigate,
}));

const { QuickAddPopover } = await import("../src/components/storefront/QuickAddPopover");
const { QuickViewModal } = await import("../src/components/storefront/QuickViewModal");

const variant = (id: string, size: string, stock: number, color: string | null = null) => ({
  id,
  size,
  size_unit: null,
  color,
  fabric: null,
  selling_price: 30,
  original_price: null,
  stock_main: stock,
  stock_incubator: 0,
  image_url: null,
});
const abaya = (variants: ReturnType<typeof variant>[]) => ({
  id: "p1",
  name: "عباية",
  name_ar: "عباية",
  name_en: "Abaya",
  base_price: 30,
  is_made_to_order: true,
  custom_fields: [{ key: "fit_length", required: true }],
  product_variants: variants,
});

beforeEach(() => {
  store.lang = "ar";
  store.modules = { made_to_order: true };
  store.mode = "shop";
  store.addToCart.mockReset();
  store.navigate.mockReset();
  store.openCart.mockReset();
  store.openCart.mockReturnValue(true);
});

describe("card quick add", () => {
  it("adds the chosen ready size of a made-to-order piece as ready and opens the bag", () => {
    const variants = [variant("v56", "56", 1), variant("v54", "54", 2), variant("v52", "52", 0)];
    render(<QuickAddPopover product={abaya(variants)} variants={variants} />);
    const chips = screen.getAllByRole("button", { name: /^إضافة \d+ إلى السلة$/ });
    expect(chips.map((chip) => chip.textContent)).toEqual(["54", "56"]);
    fireEvent.click(screen.getByRole("button", { name: "إضافة 54 إلى السلة" }));
    expect(store.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ variant_id: "v54", tailored: false }),
    );
    expect(store.openCart).toHaveBeenCalled();
  });

  it("offers tailoring beside the ready sizes, opening the page on it", () => {
    const variants = [variant("v54", "54", 2)];
    render(<QuickAddPopover product={abaya(variants)} variants={variants} />);
    fireEvent.click(screen.getByRole("button", { name: /^أو قياسات خاصة/ }));
    expect(store.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { mode: "custom" } }),
    );
  });

  it("a piece with only one size is one button naming it", () => {
    store.lang = "en";
    const variants = [variant("v54", "54", 2)];
    render(<QuickAddPopover product={abaya(variants)} variants={variants} />);
    expect(screen.getByRole("button", { name: "Add 54 to bag" })).toHaveTextContent("Add to bag54");
  });

  it("with every ready size sold out, the one button opens the page on tailoring", () => {
    const variants = [variant("v54", "54", 0)];
    render(<QuickAddPopover product={abaya(variants)} variants={variants} />);
    fireEvent.click(screen.getByRole("button", { name: "قياسات خاصة / حسب الطلب" }));
    expect(store.addToCart).not.toHaveBeenCalled();
    expect(store.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { mode: "custom" } }),
    );
  });

  it("a catalog store has no bag and shows nothing", () => {
    store.mode = "catalog";
    const variants = [variant("v54", "54", 2)];
    const { container } = render(<QuickAddPopover product={abaya(variants)} variants={variants} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("quick view", () => {
  const open = (product: ReturnType<typeof abaya>) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <QuickViewModal open onOpenChange={vi.fn()} product={product} brandSlug="pura" />
      </QueryClientProvider>,
    );

  it("chooses no size for the shopper, offers only those in stock, and adds the chosen one as ready", async () => {
    store.lang = "en";
    open(abaya([variant("v56", "56", 1), variant("v54", "54", 2), variant("v52", "52", 0)]));
    const add = screen.getByRole("button", { name: /Choose/ });
    expect(add).toBeDisabled();
    expect(screen.queryByRole("radio", { checked: true })).not.toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["54", "56"]);

    fireEvent.click(screen.getByRole("radio", { name: "54" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to bag" }));
    expect(store.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ variant_id: "v54", tailored: false }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.openCart).toHaveBeenCalled();
  });

  it("offers tailoring as its own button, and a sold-out made-to-order piece only that", () => {
    open(abaya([variant("v54", "54", 2)]));
    expect(screen.getByRole("button", { name: /^أو قياسات خاصة/ })).toBeInTheDocument();
  });

  it("a piece that can only be tailored goes to its page on tailoring", () => {
    open(abaya([variant("v54", "54", 0)]));
    fireEvent.click(screen.getByRole("button", { name: "قياسات خاصة / حسب الطلب" }));
    expect(store.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { mode: "custom" } }),
    );
    expect(screen.queryByRole("button", { name: /إضافة إلى السلة/ })).not.toBeInTheDocument();
  });
});
