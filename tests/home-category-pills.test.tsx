import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductRow, StorefrontCategory } from "../src/lib/data/storefront";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
const storefrontMock = vi.hoisted(() => () => ({
  useStorefront: () => ({
    t: (ar: string, en: string) => en,
    lang: "en",
    brand: { slug: "zh" },
    settings: { pages: [] },
  }),
}));
vi.mock("../src/lib/storefront-context", storefrontMock);
vi.mock("@/lib/storefront-context", storefrontMock);

const { Categories } = await import("../src/features/storefront-home/components/Categories");

const category = (id: string, slug: string, parent: string | null = null) =>
  ({
    id,
    slug,
    name_en: slug,
    name_ar: slug,
    parent_id: parent,
    image_url: null,
  }) as unknown as StorefrontCategory;
const product = (id: string, categorySlug: string | null) =>
  ({ id, category: categorySlug }) as unknown as ProductRow;

const categories = [
  category("c1", "daily"),
  category("c2", "occasion"),
  category("c3", "evening", "c2"),
];
const setPath = vi.fn();
const pills = (products: ProductRow[], active: string[] = []) =>
  render(
    <Categories
      products={products}
      categories={categories}
      activeCategorySlugs={active}
      setActiveCategorySlugs={setPath}
    />,
  );

beforeEach(() => setPath.mockClear());

describe("the home page's category pills", () => {
  it("lists only categories that have products, with an All pill first", () => {
    pills([product("a", "daily"), product("b", "evening")]);
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["All", "daily", "occasion"]);
  });

  it("leaves out a category that has nothing in it", () => {
    pills([product("a", "daily")]);
    expect(screen.queryByRole("button", { name: "occasion" })).toBeNull();
  });

  it("shows no pills at all when no product is in any category", () => {
    const { container } = pills([product("a", null), product("b", null)]);
    expect(container).toBeEmptyDOMElement();
  });

  it("chooses a category, and All (or the active pill again) clears it", () => {
    pills([product("a", "daily"), product("b", "evening")]);
    fireEvent.click(screen.getByRole("button", { name: "daily" }));
    expect(setPath).toHaveBeenLastCalledWith(["daily"]);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(setPath).toHaveBeenLastCalledWith([]);
  });

  it("marks the chosen pill as pressed", () => {
    pills([product("a", "daily"), product("b", "evening")], ["daily"]);
    expect(screen.getByRole("button", { name: "daily" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });
});
