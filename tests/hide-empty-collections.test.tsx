import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  collectionShownNote,
  emptyCollectionWords,
  emptyCollections,
  shownCategories,
} from "../src/lib/smart-collections";
import { NEW_ARRIVALS_WINDOW_MS } from "../src/lib/smart-categories";
import type { StoreOffer } from "../src/lib/offers";
import type { ProductRow } from "../src/lib/data/storefront";

// The owner's request of 2026-11-22: Pura's "تنزيلات" opened "no products" while nothing was on
// sale. A menu shows an automatic collection only while its page would list something.

const NOW = Date.parse("2026-11-22T10:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

const product = (
  id: string,
  fields: { original?: number | null; createdDaysAgo?: number } = {},
): ProductRow =>
  ({
    id,
    category: "abayas",
    created_at: daysAgo(fields.createdDaysAgo ?? 90),
    product_variants: [
      {
        id: `${id}-v`,
        selling_price: 30,
        original_price: fields.original ?? null,
        stock_main: 2,
        stock_incubator: 0,
        size: "54",
      },
    ],
  }) as ProductRow;

const offer = (patch: Partial<StoreOffer> = {}): StoreOffer => ({
  id: "o1",
  kind: "discount",
  name_ar: "الجمعة البيضاء",
  name_en: "White Friday",
  ends_at: null,
  min_subtotal: null,
  min_items: null,
  product_ids: [],
  category_slugs: [],
  exclude_sale_items: false,
  discount_type: "percentage",
  discount_value: 20,
  max_discount: null,
  buy_quantity: null,
  get_quantity: null,
  get_product_ids: [],
  get_category_slugs: [],
  get_percent: null,
  max_sets: null,
  local_only: true,
  pieces: "all",
  ...patch,
});

const puraCategories = [
  { id: "c1", slug: "abayas", name_ar: "عبايات", name_en: "Abayas", parent_id: null },
  {
    id: "c2",
    slug: "new-arrivals",
    name_ar: "وصل حديثا",
    name_en: "New arrivals",
    parent_id: null,
  },
  {
    id: "c3",
    slug: "most-selling",
    name_ar: "الاكثر مبيعا",
    name_en: "Most selling",
    parent_id: null,
  },
  { id: "c4", slug: "sale", name_ar: "تنزيلات", name_en: "Sale", parent_id: null },
];

describe("which automatic collections would be empty", () => {
  it("finds the sale empty while no product is on sale, as Pura's was", () => {
    const empty = emptyCollections({
      products: [product("a"), product("b")],
      bestSellerCount: 8,
      offers: [],
      now: NOW,
    });
    expect(empty.has("offers")).toBe(true);
    expect(shownCategories(puraCategories, empty).map((c) => c.slug)).toEqual([
      "abayas",
      "most-selling",
    ]);
  });

  it("brings the sale back with a price on sale, or an offer that lowers a price", () => {
    const ownSale = emptyCollections({
      products: [product("a"), product("b", { original: 40 })],
      bestSellerCount: 8,
      offers: [],
      now: NOW,
    });
    expect(ownSale.has("offers")).toBe(false);

    const byOffer = emptyCollections({
      products: [product("a")],
      bestSellerCount: 8,
      offers: [offer()],
      now: NOW,
    });
    expect(byOffer.has("offers")).toBe(false);
  });

  it("does not count an offer that leaves the price as it is (a minimum, free delivery)", () => {
    const empty = emptyCollections({
      products: [product("a")],
      bestSellerCount: 8,
      offers: [offer({ min_subtotal: 50 }), offer({ id: "o2", kind: "free_delivery" })],
      now: NOW,
    });
    expect(empty.has("offers")).toBe(true);
  });

  it("finds new arrivals empty once the last new piece is older than the page's window", () => {
    const windowDays = NEW_ARRIVALS_WINDOW_MS / (24 * 60 * 60 * 1000);
    expect(windowDays).toBe(30);
    const recent = emptyCollections({
      products: [product("a", { createdDaysAgo: 29 })],
      bestSellerCount: 8,
      offers: [],
      now: NOW,
    });
    expect(recent.has("new")).toBe(false);
    const old = emptyCollections({
      products: [product("a", { createdDaysAgo: 31 })],
      bestSellerCount: 8,
      offers: [],
      now: NOW,
    });
    expect(old.has("new")).toBe(true);
  });

  it("finds best sellers empty with no sales, and all products with no product", () => {
    const empty = emptyCollections({ products: [], bestSellerCount: 0, offers: [], now: NOW });
    expect([...empty].sort()).toEqual(["all", "best", "new", "offers"]);
  });

  it("hides nothing it cannot know", () => {
    const empty = emptyCollections({ products: null, bestSellerCount: null, offers: [] });
    expect(empty.size).toBe(0);
    expect(shownCategories(puraCategories, empty)).toHaveLength(4);
  });

  it("keeps a category of the store's own that only shares a word with a sale", () => {
    // A category the store fills itself is never an automatic collection, whatever it is called.
    const own = [{ id: "x", slug: "eid-offers-2026", name_ar: "عروض العيد", parent_id: null }];
    const empty = emptyCollections({ products: [product("a")], bestSellerCount: 1, offers: [] });
    expect(shownCategories(own, empty)).toHaveLength(1);
  });
});

describe("what an empty collection's page and the admin say", () => {
  it("says why the page is empty, in the collection's own words", () => {
    expect(emptyCollectionWords("offers", false)?.title.ar).toBe("لا توجد تنزيلات حالياً");
    expect(emptyCollectionWords("new", false)?.body.ar).toContain("آخر 30 يوماً");
    expect(emptyCollectionWords("new", true)?.title.ar).toBe("لا توجد خدمات جديدة حالياً");
    expect(emptyCollectionWords("best", false)?.title.en).toBe("No best sellers yet");
    expect(emptyCollectionWords(null, false)).toBeNull();
    expect(emptyCollectionWords("all", false)).toBeNull();
  });

  it("tells the merchant when a collection shows and whether it does now", () => {
    expect(collectionShownNote("offers", true, "ar")).toBe(
      "يظهر في المتجر ما دام فيه منتج مخفّض · مخفي الآن: لا منتجات مخفّضة",
    );
    expect(collectionShownNote("offers", false, "en")).toBe(
      "Shown on the store while something is on sale · Shown now",
    );
    expect(collectionShownNote("new", null, "ar")).toBe(
      "يظهر في المتجر ما دام فيه منتج أُضيف خلال آخر 30 يوماً",
    );
    expect(collectionShownNote("all", true, "ar")).toBeNull();
    expect(collectionShownNote(null, true, "ar")).toBeNull();
  });
});

// --- The menus' hook, with the storefront's data mocked -------------------------------------

const mocks = vi.hoisted(() => {
  const state: { offers: unknown[]; categories: unknown[] } = { offers: [], categories: [] };
  return {
    state,
    storefront: () => ({
      useStorefront: () => ({
        brand: { id: "b1", slug: "pura" },
        initialCategories: state.categories,
        settings: {},
      }),
    }),
    offers: () => ({ useLiveOffers: () => state.offers }),
    data: () => ({
      storefrontQueries: {
        categories: (brand: { slug: string }) => ({
          queryKey: ["storefront", brand.slug, "categories"],
          queryFn: async () => state.categories,
          staleTime: Infinity,
        }),
      },
    }),
  };
});
vi.mock("../src/lib/storefront-context", mocks.storefront);
vi.mock("@/lib/storefront-context", mocks.storefront);
vi.mock("../src/hooks/use-live-offers", mocks.offers);
vi.mock("@/hooks/use-live-offers", mocks.offers);
vi.mock("../src/lib/data/storefront", mocks.data);
vi.mock("@/lib/data/storefront", mocks.data);
mocks.state.categories = puraCategories;

const { useStorefrontCategories } = await import("../src/lib/use-storefront-categories");
const { StoreCollectionsProvider } = await import("../src/lib/store-collections");
const { CategoriesWorkQueue } = await import("../src/components/categories/CategoriesWorkQueue");

function wrapper(products: ProductRow[], bestSellerCount = 8) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <StoreCollectionsProvider products={products} bestSellerCount={bestSellerCount}>
        {children}
      </StoreCollectionsProvider>
    </QueryClientProvider>
  );
}

describe("the menus' categories", () => {
  beforeEach(() => {
    mocks.state.offers = [];
  });

  it("leave the sale out of a menu while nothing is on sale, and keep it for a page's lookup", async () => {
    const products = [product("a", { createdDaysAgo: 2 })];
    const menu = renderHook(() => useStorefrontCategories({ menu: true }), {
      wrapper: wrapper(products),
    });
    await waitFor(() => expect(menu.result.current.data).toBeDefined());
    expect(menu.result.current.data?.map((c) => c.slug)).toEqual([
      "abayas",
      "new-arrivals",
      "most-selling",
    ]);

    const lookup = renderHook(() => useStorefrontCategories(), { wrapper: wrapper(products) });
    await waitFor(() => expect(lookup.result.current.data).toHaveLength(4));
  });

  it("show the sale again once a price is on sale or a live offer lowers one", async () => {
    const onSale = renderHook(() => useStorefrontCategories({ menu: true }), {
      wrapper: wrapper([product("a", { original: 40, createdDaysAgo: 2 })]),
    });
    await waitFor(() => expect(onSale.result.current.data?.map((c) => c.slug)).toContain("sale"));

    mocks.state.offers = [offer()];
    const byOffer = renderHook(() => useStorefrontCategories({ menu: true }), {
      wrapper: wrapper([product("a", { createdDaysAgo: 2 })]),
    });
    await waitFor(() => expect(byOffer.result.current.data?.map((c) => c.slug)).toContain("sale"));
  });
});

describe("the admin's categories list", () => {
  it("writes under the sale when it shows and that it is hidden now", () => {
    render(
      <CategoriesWorkQueue
        lang="ar"
        categories={puraCategories.map((c) => ({ ...c, is_smart: c.slug !== "abayas" }))}
        isLoading={false}
        onEdit={() => {}}
        onDelete={() => {}}
        onReorder={() => {}}
        emptyCollections={new Set(["offers"])}
      />,
    );
    expect(
      screen.getAllByText("يظهر في المتجر ما دام فيه منتج مخفّض · مخفي الآن: لا منتجات مخفّضة"),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByText("يظهر في المتجر ما دام فيه منتج أُضيف خلال آخر 30 يوماً · ظاهر الآن"),
    ).not.toHaveLength(0);
  });
});
