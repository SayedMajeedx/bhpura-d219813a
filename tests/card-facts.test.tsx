import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductRow } from "../src/lib/data/storefront";

// A card's one fact under the name, and a listing's filters by the store's facts (a roast, a scent
// family, a metal): migration 20261024130000 gives the home page's products their facts.

const store = vi.hoisted(() => ({
  lang: "en" as "ar" | "en",
  settings: { store_vertical: "coffee", currency: "BHD" } as Record<string, unknown>,
}));
const storefront = vi.hoisted(() => () => ({
  useStorefront: () => ({
    lang: store.lang,
    settings: store.settings,
    t: (ar: string, en: string) => (store.lang === "ar" ? ar : en),
  }),
  useIsServicesStore: () => false,
}));
vi.mock("../src/lib/storefront-context", storefront);
vi.mock("@/lib/storefront-context", storefront);
const axes = vi.hoisted(() => () => ({
  useStoreAxisDefaults: () => ({}),
  isColorSwatchAxis: () => false,
}));
vi.mock("../src/lib/variant-axes", axes);
vi.mock("@/lib/variant-axes", axes);

const { cardFact, factValues, filterableFacts, hasCardFact } =
  await import("../src/lib/product-facts");
const { CardFactLine } = await import("../src/components/storefront/CardFactLine");
const { EMPTY_FILTERS, catalogFacets, filterProducts, filtersFromSearch, filtersToSearch } =
  await import("../src/lib/category-filters");
const { CategoryFilters } = await import("../src/components/storefront/CategoryFilters");

const product = (id: string, details: Record<string, unknown>, size = "250g"): ProductRow =>
  ({
    id,
    name: id,
    details,
    product_variants: [
      { id: `${id}-v`, size, size_unit: null, color: null, selling_price: 5, stock_main: 3 },
    ],
  }) as unknown as ProductRow;

beforeEach(() => {
  store.lang = "en";
  store.settings = { store_vertical: "coffee", currency: "BHD" };
});

describe("a card's one fact", () => {
  it("is what matters to the store's kind, in the reader's language", () => {
    expect(cardFact({ concentration: "edp", family: "oud" }, "fragrance", "en")).toBe(
      "Eau de Parfum · Oud",
    );
    expect(cardFact({ origin: "Ethiopia", roast: "light" }, "coffee", "en")).toBe(
      "Ethiopia · Light",
    );
    expect(cardFact({ karat: "21k", metal: "gold", weight: 4.2 }, "jewelry", "ar")).toBe(
      "عيار 21 · ذهب · 4.2 غ",
    );
    expect(cardFact({ width: 120, depth: 60, height: 75 }, "home", "en")).toBe("120 × 60 × 75 cm");
    expect(cardFact({ serves: "6 - 8" }, "food", "en")).toBe("Serves 6 - 8");
    expect(cardFact({ skin_type: ["dry", "oily", "sensitive"] }, "beauty", "en")).toBe("Dry, Oily");
  });

  it("is nothing when the kind says none or the product has none", () => {
    expect(hasCardFact("abayas")).toBe(false);
    expect(cardFact({ fit: "relaxed" }, "fashion", "en")).toBeNull();
    expect(hasCardFact("coffee")).toBe(true);
    expect(cardFact({}, "coffee", "en")).toBeNull();
  });

  it("keeps its line on a grid's card even when empty, and leaves it out of a list's row", () => {
    const { container, rerender } = render(<CardFactLine details={{ roast: "dark" }} />);
    expect(container.textContent).toBe("Dark");
    rerender(<CardFactLine details={{}} />);
    expect(container.querySelector("p")).not.toBeNull();
    rerender(<CardFactLine details={{}} reserve={false} />);
    expect(container.querySelector("p")).toBeNull();
    store.settings = { store_vertical: "abayas" };
    rerender(<CardFactLine details={{ fit: "relaxed" }} />);
    expect(container.querySelector("p")).toBeNull();
  });
});

describe("a listing's filters by the store's facts", () => {
  const light = product("light", { roast: "light", process: "washed" }, "250g");
  const dark = product("dark", { roast: "dark", process: "natural" }, "1kg");
  const darkWashed = product("dark-washed", { roast: "dark", process: "washed" }, "250g");
  const none = product("none", {});
  const all = [light, dark, darkWashed, none];

  it("offer the store's choices, not its allergens", () => {
    expect(filterableFacts("coffee").map((field) => field.key)).toEqual(["process", "roast"]);
    expect(filterableFacts("food").map((field) => field.key)).toEqual([]);
    expect(factValues({ skin_type: ["dry"], roast: "light" }, "skin_type")).toEqual(["dry"]);
  });

  it("filter by a fact, and count each option with the other filters", () => {
    const roasts = filtersFromSearch("?f_roast=dark");
    expect(roasts.facts).toEqual({ roast: ["dark"] });
    expect(filterProducts(all, roasts).map((p) => p.id)).toEqual(["dark", "dark-washed"]);

    const facets = catalogFacets(
      all,
      { ...EMPTY_FILTERS, facts: { process: ["washed"] } },
      "coffee",
    );
    expect(facets.facts).toEqual([
      // Process counts leave out its own pick; roast counts take it in.
      {
        key: "process",
        options: [
          { value: "washed", count: 2 },
          { value: "natural", count: 1 },
        ],
      },
      {
        key: "roast",
        options: [
          { value: "light", count: 1 },
          { value: "dark", count: 1 },
        ],
      },
    ]);
    // A size's count follows the facts picked too.
    expect(facets.sizes.find((size) => size.value === "1kg")?.count).toBe(0);
  });

  it("keep the facts in the address", () => {
    const search = filtersToSearch("?utm=x&f_old=gone", {
      ...EMPTY_FILTERS,
      facts: { roast: ["light", "dark"] },
    });
    const sp = new URLSearchParams(search);
    expect(sp.getAll("f_roast")).toEqual(["light", "dark"]);
    expect(sp.has("f_old")).toBe(false);
    expect(sp.get("utm")).toBe("x");
    expect(filtersFromSearch("?f_Bad=1&f_=2").facts).toEqual({});
  });

  it("show as a group of chips named in the store's words", () => {
    const onChange = vi.fn();
    render(
      <CategoryFilters
        filters={EMPTY_FILTERS}
        onChange={onChange}
        facets={catalogFacets(all, EMPTY_FILTERS, "coffee")}
        totalFilteredCount={4}
      />,
    );
    expect(screen.getByText("Roast")).toBeTruthy();
    const dark = screen.getByRole("button", { name: "Dark" });
    fireEvent.click(dark);
    const update = onChange.mock.calls[0][0] as (
      prev: typeof EMPTY_FILTERS,
    ) => typeof EMPTY_FILTERS;
    expect(update(EMPTY_FILTERS).facts).toEqual({ roast: ["dark"] });
    expect(within(document.body).getByRole("button", { name: "Washed" })).toBeTruthy();
  });
});
