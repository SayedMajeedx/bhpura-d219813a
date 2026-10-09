import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductRow } from "../src/lib/data/storefront";

const storefrontMock = vi.hoisted(() => () => ({
  useStorefront: () => ({ t: (ar: string, en: string) => en }),
  useIsServicesStore: () => false,
}));
vi.mock("../src/lib/storefront-context", storefrontMock);
vi.mock("@/lib/storefront-context", storefrontMock);
vi.mock("../src/components/storefront/product-card", () => ({
  ProductCard: ({ product }: { product: { id: string } }) => (
    <div data-testid="card">{product.id}</div>
  ),
}));

const { ProductGrid, PAGE_SIZE, SHOW_ALL_UP_TO } =
  await import("../src/components/storefront/product-grid");

const products = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}` })) as unknown as ProductRow[];
const grid = (n: number) => (
  <ProductGrid products={products(n)} loading={false} categoryEmpty={false} onViewAll={vi.fn()} />
);

beforeEach(() => sessionStorage.clear());

describe("a long product list", () => {
  it("shows a list up to the limit whole, with no button", () => {
    render(grid(SHOW_ALL_UP_TO));
    expect(screen.getAllByTestId("card")).toHaveLength(SHOW_ALL_UP_TO);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("shows a page at a time past the limit and says how far it has got", () => {
    render(grid(SHOW_ALL_UP_TO + 14));
    expect(screen.getAllByTestId("card")).toHaveLength(PAGE_SIZE);
    expect(screen.getByText(`Showing ${PAGE_SIZE} of ${SHOW_ALL_UP_TO + 14}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getAllByTestId("card")).toHaveLength(PAGE_SIZE * 2);
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getAllByTestId("card")).toHaveLength(SHOW_ALL_UP_TO + 14);
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("remembers how far the shopper went when the page is visited again", () => {
    const first = render(grid(SHOW_ALL_UP_TO + 14));
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    first.unmount();
    render(grid(SHOW_ALL_UP_TO + 14));
    expect(screen.getAllByTestId("card")).toHaveLength(PAGE_SIZE * 2);
  });
});
