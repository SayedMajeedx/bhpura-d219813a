import { describe, expect, it } from "vitest";
import {
  availableFirst,
  getDescendantCategories,
  homeGridProducts,
  homeMerchandising,
  homeSectionBackgrounds,
} from "../src/features/storefront-home/lib/home-products";
import type { ProductRow, StorefrontCategory } from "../src/lib/data/storefront";
import type { PublicSettings } from "../src/lib/storefront-context";

const now = Date.UTC(2026, 8, 25);
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

const product = (
  id: string,
  {
    stock = 1,
    sale = false,
    category = null as string | null,
    age = 1,
    photo = true as boolean,
  } = {},
): ProductRow =>
  ({
    id,
    category,
    image_url: photo ? `https://media.example/${id}.jpg` : null,
    created_at: daysAgo(age),
    product_variants: [
      {
        id: `${id}-v`,
        selling_price: 20,
        original_price: sale ? 30 : null,
        stock_main: stock,
        size: null,
        color: null,
      },
    ],
  }) as ProductRow;

const category = (id: string, slug: string, parent_id: string | null = null) =>
  ({ id, slug, name_en: slug, parent_id }) as StorefrontCategory;

const ids = (list: ProductRow[]) => list.map((p) => p.id);

describe("availableFirst", () => {
  it("puts in-stock products first and keeps the order otherwise", () => {
    const list = [
      product("a", { stock: 0 }),
      product("b"),
      product("c", { stock: 0 }),
      product("d"),
    ];
    expect(ids(availableFirst(list))).toEqual(["b", "d", "a", "c"]);
  });
});

describe("getDescendantCategories", () => {
  it("returns every level below a category", () => {
    const cats = [
      category("1", "abayas"),
      category("2", "daily", "1"),
      category("3", "linen", "2"),
      category("4", "scarves"),
    ];
    expect(getDescendantCategories("1", cats).map((c) => c.slug)).toEqual(["daily", "linen"]);
  });
});

describe("homeMerchandising", () => {
  const products = [
    product("sold-out", { stock: 0 }),
    product("a"),
    product("b", { sale: true }),
    product("c"),
  ];

  const none = { new: false, best: false, sale: false, trending: false };

  it("fills the rails from the products and the rankings", () => {
    // No rail drawn, so none claims a product: each holds its whole list.
    const rails = homeMerchandising(
      products,
      [{ product_id: "c" }, { product_id: "sold-out" }, { product_id: "a" }],
      [{ product_id: "b" }],
      none,
    );
    expect(ids(rails.newest)).toEqual(["a", "b", "c", "sold-out"]);
    // Ranked, with sold-out products last.
    expect(ids(rails.bestSellers)).toEqual(["c", "a", "sold-out"]);
    expect(ids(rails.saleProducts)).toEqual(["b"]);
    expect(ids(rails.trending)).toEqual(["b"]);
  });

  it("leaves a product with no photo out of every rail", () => {
    // Pura's "ربطة" showed as a grey "no image" box in three rails.
    const bare = product("bare", { sale: true, photo: false });
    const rails = homeMerchandising(
      [...products, bare],
      [{ product_id: "bare" }],
      [{ product_id: "bare" }],
    );
    for (const rail of Object.values(rails)) expect(ids(rail)).not.toContain("bare");
  });

  it("shows a product in one rail only: sale, then best sellers, trending, the newest", () => {
    // Pura: 11 products drew 22 rail cards, the best sellers again under trending.
    const rails = homeMerchandising(
      products,
      [{ product_id: "c" }, { product_id: "b" }],
      [{ product_id: "b" }, { product_id: "c" }, { product_id: "a" }],
    );
    expect(ids(rails.saleProducts)).toEqual(["b"]);
    expect(ids(rails.bestSellers)).toEqual(["c"]);
    expect(ids(rails.trending)).toEqual(["a"]);
    expect(ids(rails.newest)).toEqual(["sold-out"]);
  });

  it("lets a rail that is not drawn keep nothing from the others", () => {
    // The removed July version counted the hidden new arrivals and emptied every other rail.
    const rails = homeMerchandising(products, [{ product_id: "b" }, { product_id: "a" }], [], {
      new: false,
      best: true,
      sale: false,
      trending: true,
    });
    expect(ids(rails.bestSellers)).toEqual(["b", "a"]);
  });

  it("fills a rail up to 8 from its own list after the others took theirs", () => {
    const many = Array.from({ length: 12 }, (_, i) => product(`p${i}`, { sale: i < 3 }));
    const rails = homeMerchandising(many, undefined, undefined);
    expect(ids(rails.saleProducts)).toEqual(["p0", "p1", "p2"]);
    expect(ids(rails.newest)).toEqual(["p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"]);
  });

  it("puts on sale only what can be bought at the lower price", () => {
    // A sold-out size priced down does not put a product that is sold from stock on sale.
    const soldOutSize = {
      ...product("x"),
      product_variants: [
        {
          id: "x1",
          selling_price: 30,
          original_price: null,
          stock_main: 2,
          size: "54",
          color: null,
        },
        { id: "x2", selling_price: 23, original_price: 30, stock_main: 0, size: "56", color: null },
      ],
    } as ProductRow;
    const madeToOrder = { ...soldOutSize, id: "y", is_made_to_order: true } as ProductRow;
    const rails = homeMerchandising([soldOutSize, madeToOrder], undefined, undefined);
    expect(ids(rails.saleProducts)).toEqual(["y"]);
  });

  it("shows at most 8 per rail", () => {
    const many = Array.from({ length: 12 }, (_, i) => product(`p${i}`));
    expect(homeMerchandising(many, undefined, undefined).newest).toHaveLength(8);
  });
});

describe("homeGridProducts", () => {
  const products = [
    product("old", { age: 40, category: "abayas" }),
    product("new", { age: 3, category: "linen", sale: true }),
    product("scarf", { age: 35, category: "Scarves" }),
  ];
  const categories = [category("1", "abayas"), category("2", "linen", "1")];
  const grid = (activeCategorySlugs: string[]) =>
    ids(
      homeGridProducts({
        products,
        activeCategorySlugs,
        categories,
        bestSellerRows: [{ product_id: "scarf" }],
        now,
      }),
    );

  it("shows everything when no category is chosen", () => {
    expect(grid([])).toEqual(["old", "new", "scarf"]);
  });

  it("handles the new, best seller and sale collections", () => {
    expect(grid(["new-arrivals"])).toEqual(["new"]);
    expect(grid(["best-sellers"])).toEqual(["scarf"]);
    expect(grid(["Sale"])).toEqual(["new"]);
  });

  it("includes sub-categories of the chosen category", () => {
    expect(grid(["abayas"])).toEqual(["old", "new"]);
    expect(grid(["abayas", "linen"])).toEqual(["new"]);
  });

  it("matches an unknown slug against the product category", () => {
    expect(grid(["scarves"])).toEqual(["scarf"]);
  });
});

describe("homeSectionBackgrounds", () => {
  const section = (enabled: boolean, background_color: string) => ({ enabled, background_color });
  const editorialSections = {
    best: section(true, "#111"),
    sale: section(true, "#222"),
    trending: section(false, "#333"),
  } as unknown as PublicSettings["homepage_editorial_sections"];
  const base = { editorialSections, bestSellers: [1], saleProducts: [1], trending: [1] };

  it("joins the promo area to the first rail and the grid to the last", () => {
    expect(homeSectionBackgrounds({ ...base, activeCat: null })).toEqual({
      promoAreaBackground: "#111",
      productsAreaBackground: "#222",
    });
  });

  it("skips empty rails and keeps the default when a category is chosen", () => {
    expect(homeSectionBackgrounds({ ...base, saleProducts: [], activeCat: "abayas" })).toEqual({
      promoAreaBackground: "var(--sf-background)",
      productsAreaBackground: "#111",
    });
  });
});
