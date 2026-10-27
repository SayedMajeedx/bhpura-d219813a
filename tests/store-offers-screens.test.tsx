import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// A store's automatic offers on screen: the Discounts page's section (list, switch, new offer,
// the combining rule), the product page's line and the cart's free-delivery nudge. The rule
// itself is the database's (tests/store-offers-migration.test.ts).

const state = vi.hoisted(() => ({
  offers: [] as Array<Record<string, unknown>>,
  live: [] as Array<Record<string, unknown>>,
  combine: "best",
  create: vi.fn(async (..._args: unknown[]) => undefined),
  update: vi.fn(async (..._args: unknown[]) => undefined),
  remove: vi.fn(async (..._args: unknown[]) => undefined),
  saveCombine: vi.fn(async (..._args: unknown[]) => undefined),
  storefront: {} as Record<string, unknown>,
}));

const offersData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  offersQueries: {
    list: () => ({ queryKey: ["offers-list"], queryFn: async () => state.offers }),
    combine: () => ({ queryKey: ["offers-combine"], queryFn: async () => state.combine }),
    live: (_slug: string, enabled = true) => ({
      queryKey: ["offers-live"],
      queryFn: async () => state.live,
      enabled,
    }),
  },
  createStoreOffer: state.create,
  updateStoreOffer: state.update,
  deleteStoreOffer: state.remove,
  saveOffersCombine: state.saveCombine,
  invalidateStoreOffers: async () => undefined,
});
vi.mock("../src/lib/data/offers", (io) => offersData(io));
vi.mock("@/lib/data/offers", (io) => offersData(io));
const catalogData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  catalogQueries: {
    products: () => ({
      queryKey: ["products"],
      queryFn: async () => [{ id: "p1", name: "Abaya", name_ar: "عباية", name_en: "Abaya" }],
    }),
  },
});
vi.mock("../src/lib/data/catalog", (io) => catalogData(io));
vi.mock("@/lib/data/catalog", (io) => catalogData(io));
const categoryData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  categoriesQueries: {
    active: () => ({
      queryKey: ["categories"],
      queryFn: async () => [
        { id: "c1", slug: "abayas", name_ar: "عبايات", name_en: "Abayas" },
        { id: "c2", slug: "sale", name_ar: "تنزيلات", name_en: "Sale" },
      ],
    }),
  },
});
vi.mock("../src/lib/data/categories", (io) => categoryData(io));
vi.mock("@/lib/data/categories", (io) => categoryData(io));
vi.mock("../src/hooks/use-store-currency", () => ({ useStoreCurrency: () => "BHD" }));
vi.mock("@/hooks/use-store-currency", () => ({ useStoreCurrency: () => "BHD" }));
const storefrontContext = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => state.storefront,
});
vi.mock("../src/lib/storefront-context", (io) => storefrontContext(io));
vi.mock("@/lib/storefront-context", (io) => storefrontContext(io));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { StoreOffersSection } = await import("../src/features/offers/components/StoreOffersSection");
const { ProductOffers } = await import("../src/features/product-page/components/ProductOffers");
const { FreeDeliveryNudge } = await import("../src/components/storefront/FreeDeliveryNudge");
type ProductProp = React.ComponentProps<typeof ProductOffers>["product"];

const withQuery = (node: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

const row = (over: Record<string, unknown>) => ({
  id: "o1",
  brand_id: "b1",
  kind: "discount",
  name_ar: "",
  name_en: "Eid offer",
  is_active: true,
  starts_at: null,
  ends_at: null,
  min_subtotal: 40,
  min_items: null,
  product_ids: [],
  category_slugs: [],
  exclude_sale_items: false,
  discount_type: "percentage",
  discount_value: 10,
  max_discount: null,
  buy_quantity: null,
  get_quantity: null,
  get_product_ids: [],
  get_category_slugs: [],
  get_percent: null,
  max_sets: null,
  local_only: true,
  created_at: "2026-10-27T00:00:00Z",
  updated_at: "2026-10-27T00:00:00Z",
  ...over,
});

describe("the Discounts page's automatic offers", () => {
  it("lists each offer with its terms and switches it off in place", async () => {
    state.offers = [row({})];
    withQuery(<StoreOffersSection brandId="b1" isAr={false} />);
    expect(await screen.findByText("Eid offer")).toBeTruthy();
    expect(screen.getByText(/10% off on orders of/)).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Eid offer on" }));
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith("b1", "o1", { is_active: false }),
    );
  });

  it("makes a free-delivery offer and shows what shoppers will read", async () => {
    state.offers = [];
    withQuery(<StoreOffersSection brandId="b1" isAr={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /New offer/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Free delivery/ }));
    expect(
      within(dialog).getByText(/Shoppers read: Free local delivery on orders of/),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save offer" }));
    await waitFor(() =>
      expect(state.create).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ kind: "free_delivery", min_subtotal: 30, local_only: true }),
      ),
    );
  });

  it("offers real categories only, never an automatic collection", async () => {
    state.offers = [];
    withQuery(<StoreOffersSection brandId="b1" isAr={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /New offer/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Chosen products or categories" }));
    expect(await within(dialog).findByText("Abayas")).toBeTruthy();
    expect(within(dialog).queryByText("Sale")).toBeNull();
  });

  it("does not save an offer the table would refuse", async () => {
    state.offers = [];
    withQuery(<StoreOffersSection brandId="b1" isAr />);
    fireEvent.click(await screen.findByRole("button", { name: /عرض جديد/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("النسبة (%)"), { target: { value: "150" } });
    expect(within(dialog).getByText("لا تزيد النسبة على 100%.")).toBeTruthy();
    expect(
      (within(dialog).getByRole("button", { name: "حفظ العرض" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("saves the store's combining rule", async () => {
    state.offers = [];
    withQuery(<StoreOffersSection brandId="b1" isAr={false} />);
    fireEvent.click(await screen.findByLabelText("The code and the offer together"));
    await waitFor(() => expect(state.saveCombine).toHaveBeenCalledWith("b1", "together"));
  });
});

const shop = (over: Record<string, unknown> = {}) => ({
  brand: { id: "b1", slug: "store" },
  settings: { storefront_mode: "shop", primary_color: "#000" },
  lang: "en",
  currency: "BHD",
  cart: [],
  ...over,
});
const live = (over: Record<string, unknown>) => ({ ...row(over), id: String(over.id ?? "l1") });

describe("what a shopper sees", () => {
  it("names the offers that reach a product under its price", async () => {
    state.storefront = shop();
    state.live = [
      live({ id: "a", kind: "buy_x_get_y", buy_quantity: 2, get_quantity: 1, get_percent: 100 }),
      live({ id: "b", category_slugs: ["dresses"] }),
      live({ id: "c", kind: "free_delivery", min_subtotal: 30 }),
    ];
    const product = {
      id: "p1",
      category: "abayas",
      product_variants: [],
    } as unknown as ProductProp;
    withQuery(<ProductOffers product={product} />);
    expect(await screen.findByText("Buy 2, get 1 free")).toBeTruthy();
    expect(screen.getByText(/Free local delivery on orders of/)).toBeTruthy();
    expect(screen.queryByText(/10% off/)).toBeNull();
  });

  it("says nothing in a catalog store", async () => {
    state.storefront = shop({ settings: { storefront_mode: "catalog" } });
    state.live = [live({})];
    const product = { id: "p1", category: null, product_variants: [] } as unknown as ProductProp;
    const { container } = withQuery(<ProductOffers product={product} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe("");
  });

  it("names the offers on a service too, which its booking takes when they save more", async () => {
    state.storefront = shop();
    state.live = [live({})];
    const service = {
      id: "s1",
      category: null,
      item_kind: "service",
      product_variants: [],
    } as unknown as ProductProp;
    withQuery(<ProductOffers product={service} />);
    expect(await screen.findByText(/10% off/)).toBeTruthy();
  });

  it("tells the cart how far free delivery is", async () => {
    state.storefront = shop({ cart: [{ price: 13, qty: 2 }] });
    state.live = [live({ kind: "free_delivery", min_subtotal: 30 })];
    withQuery(<FreeDeliveryNudge />);
    expect(await screen.findByText(/Add .*4\.000.* more for free local delivery/)).toBeTruthy();
  });
});
