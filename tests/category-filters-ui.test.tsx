import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_FILTERS,
  catalogFacets,
  filterProducts,
  type FilterState,
} from "../src/lib/category-filters";
import type { ProductRow } from "../src/lib/data/storefront";

// The listing's filter panel: pick several sizes or colours, see what each would show, and never
// land on an empty page by picking an option with nothing behind it.

const state = vi.hoisted(() => ({ lang: "en" as "ar" | "en", swatches: true }));
const storefrontMock = vi.hoisted(() => () => ({
  useIsServicesStore: () => false,
  useStorefront: () => ({
    settings: { currency: "BHD" },
    get lang() {
      return state.lang;
    },
    t: (ar: string, en: string) => (state.lang === "ar" ? ar : en),
  }),
}));
vi.mock("../src/lib/storefront-context", storefrontMock);
vi.mock("@/lib/storefront-context", storefrontMock);
const axesMock = vi.hoisted(() => () => ({
  isColorSwatchAxis: () => state.swatches,
  useStoreAxisDefaults: () => ({}),
}));
vi.mock("../src/lib/variant-axes", axesMock);
vi.mock("@/lib/variant-axes", axesMock);

const { CategoryFilters } = await import("../src/components/storefront/CategoryFilters");

const variant = (size: string, color: string | null, stock = 1, price = 20) => ({
  size,
  color,
  selling_price: price,
  stock_main: stock,
});
const product = (id: string, variants: ReturnType<typeof variant>[]) =>
  ({
    id,
    product_variants: variants.map((v, i) => ({ id: `${id}${i}`, stock_incubator: 0, ...v })),
  }) as unknown as ProductRow;

const PRODUCTS = [
  product("a", [variant("52", "Black"), variant("54", "Navy")]),
  product("b", [variant("52", "Navy", 0), variant("56", "Black", 1, 35)]),
  product("c", [variant("Standard", "Black")]),
];

/** The panel wired to the real filter logic, the way the listing page wires it. */
function Panel({ onState }: { onState?: (filters: FilterState, shown: number) => void }) {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const shown = filterProducts(PRODUCTS, filters).length;
  onState?.(filters, shown);
  return (
    <CategoryFilters
      filters={filters}
      onChange={setFilters}
      facets={catalogFacets(PRODUCTS, filters)}
      totalFilteredCount={shown}
    />
  );
}

beforeEach(() => {
  state.lang = "en";
  state.swatches = true;
});

describe("the listing's filter panel", () => {
  it("offers real sizes in order, never the 'Standard' placeholder", () => {
    render(<Panel />);
    const sizes = within(screen.getByRole("region", { name: "Size / Option" }));
    expect(sizes.getAllByRole("button").map((b) => b.textContent)).toEqual(["52", "54", "56"]);
  });

  it("takes several sizes at once and says how many products that shows", () => {
    let last = { filters: EMPTY_FILTERS, shown: 0 };
    render(<Panel onState={(filters, shown) => (last = { filters, shown })} />);
    const sizes = within(screen.getByRole("region", { name: "Size / Option" }));
    fireEvent.click(sizes.getByRole("button", { name: "52" }));
    fireEvent.click(sizes.getByRole("button", { name: "56" }));
    expect(last.filters.sizes).toEqual(["52", "56"]);
    expect(last.shown).toBe(2);
    expect(sizes.getByRole("button", { name: "52" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("matches a size and a colour on one variant, and greys out a colour that has none", () => {
    render(<Panel />);
    fireEvent.click(
      within(screen.getByRole("region", { name: "Size / Option" })).getByRole("button", {
        name: "56",
      }),
    );
    const colors = within(screen.getByRole("region", { name: "Color" }));
    // Only a black 56 exists: navy stays visible but cannot be picked.
    expect(colors.getByRole("button", { name: "Black" })).not.toHaveAttribute("aria-disabled");
    const navy = colors.getByRole("button", { name: "Navy" });
    expect(navy).toHaveAttribute("aria-disabled", "true");
    expect(navy).toHaveAttribute("title", expect.stringContaining("0 items"));
    fireEvent.click(navy);
    expect(navy).toHaveAttribute("aria-pressed", "false");
  });

  it("names the colours chosen under the swatches, and 'All colours' when none", () => {
    render(<Panel />);
    const colors = within(screen.getByRole("region", { name: "Color" }));
    expect(colors.getByText("All colours")).toBeInTheDocument();
    fireEvent.click(colors.getByRole("button", { name: "Navy" }));
    fireEvent.click(colors.getByRole("button", { name: "Black" }));
    expect(colors.getByText("Navy, Black")).toBeInTheDocument();
  });

  it("clears one group, or everything, and counts a group once", () => {
    let last = EMPTY_FILTERS;
    render(<Panel onState={(filters) => (last = filters)} />);
    const sizes = within(screen.getByRole("region", { name: "Size / Option" }));
    fireEvent.click(sizes.getByRole("button", { name: "52" }));
    fireEvent.click(sizes.getByRole("button", { name: "54" }));
    fireEvent.click(sizes.getByRole("button", { name: "Clear" }));
    expect(last.sizes).toEqual([]);
    fireEvent.click(sizes.getByRole("button", { name: "52" }));
    fireEvent.click(screen.getByRole("switch"));
    expect(last.inStockOnly).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(last).toEqual(EMPTY_FILTERS);
  });

  it("puts a price range typed the wrong way round right when the field is left", () => {
    let last = EMPTY_FILTERS;
    render(<Panel onState={(filters) => (last = filters)} />);
    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");
    fireEvent.change(from, { target: { value: "40" } });
    fireEvent.change(to, { target: { value: "10" } });
    fireEvent.blur(to);
    expect([last.minPrice, last.maxPrice]).toEqual([10, 40]);
    // The page's own range is the hint, with the store's currency.
    expect(from).toHaveAttribute("placeholder", "20");
    expect(to).toHaveAttribute("placeholder", "35");
    expect(screen.getAllByText("BHD")).toHaveLength(2);
  });

  it("shows colours as text chips when the store's colour axis is not a colour", () => {
    state.swatches = false;
    render(<Panel />);
    const colors = within(screen.getByRole("region", { name: "Color" }));
    expect(colors.getByRole("button", { name: "Navy" })).toHaveTextContent("Navy");
    expect(colors.queryByText("All colours")).not.toBeInTheDocument();
  });

  it("reads in Arabic", () => {
    state.lang = "ar";
    render(<Panel />);
    expect(screen.getByText("تصفية المنتجات")).toBeInTheDocument();
    expect(screen.getByText("نطاق السعر")).toBeInTheDocument();
    expect(screen.getByLabelText("من")).toBeInTheDocument();
    expect(screen.getByLabelText("إلى")).toBeInTheDocument();
  });
});
