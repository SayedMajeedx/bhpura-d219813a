import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  catalogFacets,
  compareSizes,
  filterProducts,
  filtersFromSearch,
  filtersToSearch,
  type FilterState,
} from "../src/lib/category-filters";
import type { ProductRow } from "../src/lib/data/storefront";

type V = {
  size?: string | null;
  color?: string | null;
  price?: number;
  stock?: number;
  unit?: string | null;
};
const product = (id: string, variants: V[], over: Partial<ProductRow> = {}): ProductRow =>
  ({
    id,
    name: id,
    product_variants: variants.map((v, i) => ({
      id: `${id}-${i}`,
      size: v.size ?? null,
      size_unit: v.unit ?? null,
      color: v.color ?? null,
      selling_price: v.price ?? 20,
      original_price: null,
      stock_main: v.stock ?? 1,
      stock_incubator: 0,
    })),
    ...over,
  }) as unknown as ProductRow;

const filters = (over: Partial<FilterState> = {}): FilterState => ({ ...EMPTY_FILTERS, ...over });
const ids = (list: ProductRow[]) => list.map((p) => p.id);

// Two abayas and a dress, as in a listing.
const A = product("a", [
  { size: "52", color: "Black" },
  { size: "54", color: "Navy" },
]);
const B = product("b", [
  { size: "52", color: "Navy", stock: 0 },
  { size: "54", color: "Black", stock: 0 },
]);
const C = product("c", [{ size: "Standard", color: "Black", price: 45 }]);
const ALL = [A, B, C];

describe("filtering a category's products", () => {
  it("keeps everything when nothing is chosen", () => {
    expect(ids(filterProducts(ALL, filters()))).toEqual(["a", "b", "c"]);
  });

  it("matches a size and a colour on ONE variant, not on two different ones", () => {
    // A has a 52 in black and a 54 in navy; B the other way round. "54 in navy" is only A's.
    expect(ids(filterProducts(ALL, filters({ sizes: ["54"], colors: ["Navy"] })))).toEqual(["a"]);
    expect(ids(filterProducts(ALL, filters({ sizes: ["52"], colors: ["Navy"] })))).toEqual(["b"]);
  });

  it("takes several sizes or colours as 'either'", () => {
    expect(ids(filterProducts(ALL, filters({ sizes: ["52", "54"], colors: ["Black"] })))).toEqual([
      "a",
      "b",
    ]);
    expect(ids(filterProducts(ALL, filters({ colors: ["navy", "BLACK"] })))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("holds the price, the stock and the choice to the same variant", () => {
    // In stock only: B has none; C is one placeholder variant in stock.
    expect(ids(filterProducts(ALL, filters({ inStockOnly: true })))).toEqual(["a", "c"]);
    // A navy that is in stock and costs at least 40 does not exist.
    expect(
      ids(filterProducts(ALL, filters({ colors: ["Navy"], inStockOnly: true, minPrice: 40 }))),
    ).toEqual([]);
    expect(ids(filterProducts(ALL, filters({ minPrice: 30, maxPrice: 50 })))).toEqual(["c"]);
  });

  it("treats made-to-order products and services as always in stock", () => {
    const custom = product("m", [{ size: "52", stock: 0 }], { is_made_to_order: true });
    const service = product("s", [{ size: "2 hours", stock: 0 }], { item_kind: "service" });
    expect(ids(filterProducts([custom, service, B], filters({ inStockOnly: true })))).toEqual([
      "m",
      "s",
    ]);
  });

  it("lets a product with no variants through unless a size, colour or price is asked for", () => {
    const bare = product("x", []);
    expect(ids(filterProducts([bare], filters()))).toEqual(["x"]);
    expect(ids(filterProducts([bare], filters({ sizes: ["52"] })))).toEqual([]);
    expect(ids(filterProducts([bare], filters({ minPrice: 1 })))).toEqual([]);
  });
});

describe("what a shopper can pick", () => {
  it("lists sizes in a shopper's order and never the 'Standard' placeholder", () => {
    const facets = catalogFacets(
      [
        product("p", [
          { size: "100" },
          { size: "52" },
          { size: "XL" },
          { size: "S" },
          { size: "قياسي" },
          { size: "Standard" },
          { size: "M" },
        ]),
      ],
      filters(),
    );
    expect(facets.sizes.map((s) => s.value)).toEqual(["52", "100", "S", "M", "XL"]);
  });

  it("offers only what this page's products have, with colours folded by case", () => {
    const facets = catalogFacets(
      [product("p", [{ color: "Black" }, { color: "black" }, { color: "Navy" }, { color: null }])],
      filters(),
    );
    expect(facets.colors.map((c) => c.name)).toEqual(["Black", "Navy"]);
    expect(facets.sizes).toEqual([]);
  });

  it("counts each option against the OTHER filters, so one that would show nothing reads 0", () => {
    const facets = catalogFacets(ALL, filters({ colors: ["Navy"] }));
    // Navy is a 54 in A and a 52 in B.
    expect(Object.fromEntries(facets.sizes.map((s) => [s.value, s.count]))).toEqual({
      "52": 1,
      "54": 1,
    });
    // Colours are counted without the colour filter itself, so the other colour stays pickable.
    expect(Object.fromEntries(facets.colors.map((c) => [c.name, c.count]))).toEqual({
      Black: 3,
      Navy: 2,
    });
    const instock = catalogFacets(ALL, filters({ inStockOnly: true, sizes: ["52"] }));
    expect(Object.fromEntries(instock.colors.map((c) => [c.name, c.count]))).toEqual({
      Black: 1,
      Navy: 0,
    });
  });

  it("gives the page's price range in whole numbers, before any price filter", () => {
    const facets = catalogFacets(
      [product("p", [{ price: 22.5 }, { price: 31.2 }, { price: 0 }])],
      filters({ minPrice: 25 }),
    );
    expect(facets.price).toEqual({ min: 22, max: 32 });
    expect(catalogFacets([], filters()).price).toEqual({ min: 0, max: 0 });
  });

  it("keeps a size's unit for its label", () => {
    const facets = catalogFacets([product("p", [{ size: "250", unit: "g" }])], filters());
    expect(facets.sizes[0]).toMatchObject({ value: "250", unit: "g" });
  });
});

describe("sizes in order", () => {
  it("puts numbers by value, then letter sizes S to XL, then the rest", () => {
    const sorted = ["XL", "M", "100", "Free", "52", "S", "4 hours", "3 hours"].sort(compareSizes);
    expect(sorted).toEqual(["52", "100", "S", "M", "XL", "3 hours", "4 hours", "Free"]);
  });
});

describe("the filters in the address", () => {
  it("reads every filter, several sizes or colours, and a bad value as none", () => {
    expect(
      filtersFromSearch("?size=52&size=54&color=Black&min=10&max=oops&stock=1&sort=price-low"),
    ).toEqual({
      sizes: ["52", "54"],
      colors: ["Black"],
      minPrice: 10,
      maxPrice: null,
      inStockOnly: true,
      sort: "price-low",
    });
    expect(filtersFromSearch("?sort=sideways&min=-5")).toEqual(EMPTY_FILTERS);
    expect(filtersFromSearch("")).toEqual(EMPTY_FILTERS);
  });

  it("writes them back and leaves every other parameter alone", () => {
    const search = filtersToSearch(
      "?utm=mail&size=99&color=Old",
      filters({ sizes: ["52", "54"], colors: ["Navy"], minPrice: 10, sort: "old" }),
    );
    expect(new URLSearchParams(search).getAll("size")).toEqual(["52", "54"]);
    expect(new URLSearchParams(search).get("utm")).toBe("mail");
    expect(new URLSearchParams(search).get("color")).toBe("Navy");
    expect(new URLSearchParams(search).get("sort")).toBe("old");
    expect(filtersToSearch("?utm=mail&size=99", EMPTY_FILTERS)).toBe("utm=mail");
  });

  it("round-trips, and reads an old single-size link", () => {
    const state = filters({
      sizes: ["52"],
      colors: ["Black", "Navy"],
      maxPrice: 40,
      inStockOnly: true,
    });
    expect(filtersFromSearch(filtersToSearch("", state))).toEqual(state);
    expect(filtersFromSearch("?size=52&color=Black").sizes).toEqual(["52"]);
  });

  it("counts each kind of filter once", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(
      activeFilterCount(
        filters({ sizes: ["52", "54"], colors: ["a"], minPrice: 1, inStockOnly: true }),
      ),
    ).toBe(4);
  });
});
