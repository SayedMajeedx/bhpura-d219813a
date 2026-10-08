import { beforeEach, describe, expect, it, vi } from "vitest";

// Every database round trip costs about a quarter of a second (the database is far from the
// visitors), so the store's inner pages take what the layout already read instead of asking again:
// the home page and category pages ask the database for nothing, and the product page asks once.

const stubs = vi.hoisted(() => ({
  fetchStorefrontPageData: vi.fn(),
  fetchStorefrontPageMeta: vi.fn(),
  fetchCategoryBySlug: vi.fn(),
  fetchActiveBrandIdentity: vi.fn(),
  fetchRecommendationCatalog: vi.fn(),
  fetchProductDetail: vi.fn(),
  fetchProductDetailByBrandSlug: vi.fn(),
  fetchBestSellerRows: vi.fn(),
}));
const client = { supabase: {} };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);
const storefrontData = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  ...stubs,
});
vi.mock("../src/lib/data/storefront", (io) => storefrontData(io));
vi.mock("@/lib/data/storefront", (io) => storefrontData(io));

type Loader = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
const loaderOf = async (path: string): Promise<Loader> => {
  const module = (await import(path)) as { Route: { options: { loader: Loader } } };
  return module.Route.options.loader;
};
const homeLoader = await loaderOf("../src/routes/$slug.index");
const categoryLoader = await loaderOf("../src/routes/$slug.$category");
const productLoader = await loaderOf("../src/routes/$slug.product.$id");

const products = [
  { id: "p1", name: "Abaya", product_variants: [{ id: "v1", selling_price: 40 }] },
  { id: "p2", name: "Scarf", product_variants: [] },
];
const categories = [
  { id: "c1", slug: "abayas", name_en: "Abayas", name_ar: "عبايات", parent_id: null },
];
const bestSellerRows = [{ product_id: "p1" }];
const layoutLoaderData = {
  brand: { id: "b1", slug: "pura", name_en: "Pura", name_ar: "بيورا", logo_url: "l.png" },
  settings: {
    pages: [{ slug: "about", title_en: "About", meta_title: "About Pura" }],
    favicon_url: "f.png",
    logo_url: "s.png",
  },
  bootstrapData: { products, categories, bestSellerRows, trendingRows: [] },
  isSuspended: false,
};
const parent = (loaderData: unknown = layoutLoaderData) => ({
  parentMatchPromise: Promise.resolve({ loaderData }),
});
const NO_DATABASE_CALLS = [
  "fetchStorefrontPageData",
  "fetchStorefrontPageMeta",
  "fetchCategoryBySlug",
  "fetchActiveBrandIdentity",
  "fetchRecommendationCatalog",
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  stubs.fetchProductDetailByBrandSlug.mockResolvedValue({ id: "p1", name: "Abaya" });
  stubs.fetchProductDetail.mockResolvedValue(null);
  stubs.fetchBestSellerRows.mockResolvedValue(bestSellerRows);
});

const expectNoDatabaseCalls = () => {
  for (const name of NO_DATABASE_CALLS) expect(stubs[name]).not.toHaveBeenCalled();
};

describe("the home page", () => {
  it("takes its lists from the store layout and asks the database for nothing", async () => {
    const data = await homeLoader({ params: { slug: "pura" }, ...parent() });
    expect(data).toEqual({ products, categories, bestSellerRows, trendingRows: [] });
    expectNoDatabaseCalls();
  });

  it("is empty, not broken, for a store the layout could not load", async () => {
    expect(await homeLoader({ params: { slug: "pura" }, ...parent({}) })).toEqual({
      products: [],
      categories: [],
      bestSellerRows: [],
      trendingRows: [],
    });
  });
});

describe("a category page", () => {
  const run = (category: string, loaderData?: unknown) =>
    categoryLoader({
      params: { slug: "pura", category },
      location: { search: "" },
      ...parent(loaderData),
    });

  it("finds a category in the layout's list, with the store's brand and icon, and asks nothing", async () => {
    const data = await run("abayas");
    expect(data).toMatchObject({
      page: null,
      category: { slug: "abayas" },
      brand: { slug: "pura" },
      faviconUrl: "f.png",
      initialLang: "ar",
    });
    expectNoDatabaseCalls();
  });

  it("finds a CMS page and a smart collection", async () => {
    expect(await run("about")).toMatchObject({ page: { slug: "about" }, category: null });
    expect(await run("new-arrivals")).toMatchObject({ page: null, category: null });
    expectNoDatabaseCalls();
  });

  it("answers 404 for a slug that is no page, collection or category", async () => {
    await expect(run("nope")).rejects.toMatchObject({ isNotFound: true });
  });

  it("does not 404 a suspended store, whose answer carries no catalog", async () => {
    const data = await run("nope", { brand: layoutLoaderData.brand, isSuspended: true });
    expect(data).toMatchObject({ category: null, brand: { slug: "pura" } });
  });

  it("has nothing for a store the layout could not load", async () => {
    expect(await run("abayas", {})).toMatchObject({ brand: null, category: null });
  });
});

describe("a product page", () => {
  const run = (id = "p1") =>
    productLoader({
      params: { slug: "pura", id },
      location: { search: { lang: "en" } },
      ...parent(),
    });

  it("asks once, for the product by the store's slug and the best sellers, and takes the rest from the layout", async () => {
    const data = await run();
    expect(stubs.fetchProductDetailByBrandSlug).toHaveBeenCalledWith("pura", "p1");
    expect(stubs.fetchBestSellerRows).toHaveBeenCalledWith("pura", expect.any(Number));
    expect(data).toMatchObject({
      brand: { slug: "pura" },
      product: { id: "p1" },
      recommendationCatalog: products,
      bestSellerRows,
      initialLang: "en",
    });
    expect(stubs.fetchActiveBrandIdentity).not.toHaveBeenCalled();
    expect(stubs.fetchRecommendationCatalog).not.toHaveBeenCalled();
    expect(stubs.fetchProductDetail).not.toHaveBeenCalled();
  });

  it("falls back to the name lookup when the id finds nothing, and 404s when that finds nothing too", async () => {
    stubs.fetchProductDetailByBrandSlug.mockResolvedValue(null);
    stubs.fetchProductDetail.mockResolvedValueOnce({ id: "p9", name: "Black abaya" });
    expect(await run("black-abaya")).toMatchObject({ product: { id: "p9" } });
    expect(stubs.fetchProductDetail).toHaveBeenCalledWith("b1", "black-abaya");

    await expect(run("missing")).rejects.toMatchObject({ isNotFound: true });
  });

  it("still ends cleanly when a request fails after the loader has already finished", async () => {
    stubs.fetchProductDetailByBrandSlug.mockResolvedValue({ id: "p1" });
    stubs.fetchBestSellerRows.mockResolvedValue([]);
    await expect(run()).resolves.toMatchObject({ bestSellerRows: [] });
  });
});
