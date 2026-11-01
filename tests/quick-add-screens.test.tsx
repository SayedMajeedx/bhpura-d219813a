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
  lowStock: 0,
}));
const storefront = () => ({
  lang: store.lang,
  t: (ar: string, en: string) => (store.lang === "ar" ? ar : en),
  settings: {
    store_vertical: "abayas",
    storefront_mode: store.mode,
    low_stock_threshold: store.lowStock,
  },
  wishlist: [] as string[],
  toggleWishlist: () => undefined,
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
const { QuickAddSheet } = await import("../src/components/storefront/quick-add/QuickAddSheet");
const { ProductCardV2 } = await import("../src/components/storefront/ProductCardV2");
const { useQuickAddPlan } = await import("../src/components/storefront/quick-add/use-quick-add");

/** The popover with the plan its card reads for it. */
function Popover({ product, variants }: { product: any; variants: any[] }) {
  const plan = useQuickAddPlan(product, variants);
  return <QuickAddPopover product={product} variants={variants} plan={plan} />;
}
const withQueries = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

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
  store.lowStock = 0;
  store.addToCart.mockReset();
  store.navigate.mockReset();
  store.openCart.mockReset();
  store.openCart.mockReturnValue(true);
});

describe("card quick add", () => {
  it("adds the chosen ready size of a made-to-order piece as ready and opens the bag", () => {
    const variants = [variant("v56", "56", 1), variant("v54", "54", 2), variant("v52", "52", 0)];
    render(<Popover product={abaya(variants)} variants={variants} />);
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
    render(<Popover product={abaya(variants)} variants={variants} />);
    fireEvent.click(screen.getByRole("button", { name: /^أو قياسات خاصة/ }));
    expect(store.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { mode: "custom" } }),
    );
  });

  it("a piece with only one size is one button naming it", () => {
    store.lang = "en";
    const variants = [variant("v54", "54", 2)];
    render(<Popover product={abaya(variants)} variants={variants} />);
    expect(screen.getByRole("button", { name: "Add 54 to bag" })).toHaveTextContent("Add to bag54");
  });

  it("with every ready size sold out, the one button opens the page on tailoring", () => {
    const variants = [variant("v54", "54", 0)];
    render(<Popover product={abaya(variants)} variants={variants} />);
    fireEvent.click(screen.getByRole("button", { name: "قياسات خاصة / حسب الطلب" }));
    expect(store.addToCart).not.toHaveBeenCalled();
    expect(store.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { mode: "custom" } }),
    );
  });

  it("a catalog store has no bag and shows nothing", () => {
    store.mode = "catalog";
    const variants = [variant("v54", "54", 2)];
    const { container } = render(<Popover product={abaya(variants)} variants={variants} />);
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

describe("the last pieces and a service", () => {
  it("says which sizes are nearly gone, at the store's own level", () => {
    store.lowStock = 2;
    const variants = [variant("v54", "54", 1), variant("v56", "56", 5)];
    render(<Popover product={abaya(variants)} variants={variants} />);
    expect(screen.getByText("54: باقي قطعة واحدة فقط")).toBeInTheDocument();
    expect(screen.queryByText(/56:/)).not.toBeInTheDocument();
  });

  it("says nothing while the store's level is off", () => {
    const variants = [variant("v54", "54", 1)];
    render(<Popover product={abaya(variants)} variants={variants} />);
    expect(screen.queryByText(/باقي/)).not.toBeInTheDocument();
  });

  it("a service is booked on the booking page with it chosen, never put in the bag", () => {
    const service = {
      id: "s1",
      name: "Photo booth",
      item_kind: "service",
      product_variants: [variant("v1", "", 0)],
    };
    render(<Popover product={service} variants={service.product_variants} />);
    fireEvent.click(screen.getByRole("button", { name: "احجز" }));
    expect(store.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/$slug/book", search: { service: "s1" } }),
    );
    expect(store.addToCart).not.toHaveBeenCalled();
  });
});

describe("quick add on a phone", () => {
  it("the card's bag button opens the sheet, which adds the exact piece chosen", async () => {
    const variants = [
      variant("v55b", "55", 1, "Black"),
      variant("v54p", "54", 1, "Purple"),
      variant("v57n", "57", 0, "Navy"),
    ];
    store.lang = "en";
    withQueries(<ProductCardV2 product={abaya(variants)} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Abaya to bag" }));
    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveTextContent("Abaya");
    // Only what can be bought, nothing chosen: the sold-out navy is not offered.
    expect(screen.queryByRole("radio", { name: "Navy" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Choose/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Purple" }));
    fireEvent.click(screen.getByRole("radio", { name: "54" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to bag" }));
    expect(store.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ variant_id: "v54p", tailored: false }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.openCart).toHaveBeenCalled();
  });

  it("a piece that can only be made to measure goes straight to its page on tailoring", () => {
    withQueries(<ProductCardV2 product={abaya([variant("v54", "54", 0)])} />);
    fireEvent.click(screen.getByRole("button", { name: "قياسات خاصة / حسب الطلب: عباية" }));
    expect(store.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ search: { mode: "custom" } }),
    );
  });

  it("the sheet says the chosen piece is the last one", async () => {
    store.lowStock = 3;
    withQueries(
      <QuickAddSheet product={abaya([variant("v54", "54", 1)])} onOpenChange={vi.fn()} />,
    );
    expect(await screen.findByText("باقي قطعة واحدة فقط")).toBeInTheDocument();
  });
});
