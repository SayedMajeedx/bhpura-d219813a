import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  filterInventoryProducts,
  productNeedsAttention,
  productStockStatus,
  type InventoryScope,
} from "../src/features/inventory/lib/product-list";
import {
  exportStockStatus,
  matchesExportStockFilter,
} from "../src/features/import-export/lib/export-stock-status";
import type { Product } from "../src/features/inventory/types";

// A made-to-order piece with no ready stock is "made to order" on every admin surface, never
// "out of stock": the inventory tabs, "needs attention", the list badge and the export.

vi.mock("../src/hooks/use-vocabulary", () => ({
  useVocabulary: () => ({
    vocabulary: { made_to_order: { ar: "تفصيل حسب الطلب", en: "Tailoring" } },
  }),
}));
vi.mock("@/hooks/use-vocabulary", () => ({
  useVocabulary: () => ({
    vocabulary: { made_to_order: { ar: "تفصيل حسب الطلب", en: "Tailoring" } },
  }),
}));

const { StockLevelBadge } = await import("../src/components/inventory/StockLevelBadge");

const product = (id: string, over: Partial<Product> = {}): Product =>
  ({
    id,
    name: id,
    name_ar: id,
    name_en: id,
    category: null,
    image_url: "https://x/a.jpg",
    media: [],
    is_active: true,
    featured_trending: false,
    is_made_to_order: false,
    item_kind: "product",
    base_price: 10,
    ...over,
  }) as Product;

const tailored = product("tailored", { is_made_to_order: true });
const tailoredWithReady = product("tailored-ready", { is_made_to_order: true });
const soldOut = product("sold-out");
const fewLeft = product("few-left");
const plenty = product("plenty");
const service = product("service", { is_made_to_order: true, item_kind: "service" });
const all = [tailored, tailoredWithReady, soldOut, fewLeft, plenty, service];
const stock: Record<string, number> = {
  tailored: 0,
  "tailored-ready": 2,
  "sold-out": 0,
  "few-left": 3,
  plenty: 40,
  service: 0,
};

const inScope = (scope: InventoryScope) =>
  filterInventoryProducts({
    products: all,
    variantsByProduct: {},
    search: "",
    category: "all",
    scope,
    sortBy: "newest",
    productStock: (id) => stock[id],
    productWeeklySales: () => 0,
  }).map((p) => p.id);

describe("the inventory tabs", () => {
  it("'Out of stock' lists only products sold from stock", () => {
    expect(inScope("out")).toEqual(["sold-out"]);
  });

  it("'Low stock' does not list a made-to-order piece with a few ready sizes", () => {
    expect(inScope("low")).toEqual(["few-left"]);
  });

  it("'Needs attention' leaves made-to-order pieces and services out", () => {
    expect(inScope("attention")).toEqual(["sold-out", "few-left"]);
    expect(productNeedsAttention(tailored, 0, 0)).toBe(false);
    // A made-to-order piece with no photo still needs attention.
    expect(productNeedsAttention({ ...tailored, image_url: null }, 0, 0)).toBe(true);
  });

  it("names each product's stock status", () => {
    expect(all.map((p) => productStockStatus(p, stock[p.id]))).toEqual([
      "made_to_order",
      "made_to_order",
      "out",
      "low",
      "available",
      "service",
    ]);
  });
});

describe("the list badge", () => {
  it("says made to order in the store's word for a piece with no ready stock", () => {
    render(<StockLevelBadge product={tailored} totalStock={0} lang="en" />);
    expect(screen.getByText("Tailoring")).toBeInTheDocument();
    expect(screen.queryByText("Out of Stock")).toBeNull();
  });

  it("adds the ready pieces beside it", () => {
    render(<StockLevelBadge product={tailoredWithReady} totalStock={2} lang="ar" />);
    expect(screen.getByText("تفصيل حسب الطلب")).toBeInTheDocument();
    expect(screen.getByText("جاهز: 2")).toBeInTheDocument();
  });

  it("still says out of stock for a product sold from stock", () => {
    render(<StockLevelBadge product={soldOut} totalStock={0} lang="en" />);
    expect(screen.getByText("Out of Stock")).toBeInTheDocument();
  });
});

describe("the product export", () => {
  it("writes the status by the same rule", () => {
    expect(exportStockStatus(tailored, 0)).toBe("Made to Order");
    expect(exportStockStatus(service, 0)).toBe("Service");
    expect(exportStockStatus(soldOut, 0)).toBe("Out of Stock");
    expect(exportStockStatus(fewLeft, 3)).toBe("Low Stock");
    expect(exportStockStatus(plenty, 40)).toBe("In Stock");
  });

  it("filters by what a shopper can buy", () => {
    expect(matchesExportStockFilter("in_stock", "Made to Order")).toBe(true);
    expect(matchesExportStockFilter("in_stock", "Out of Stock")).toBe(false);
    expect(matchesExportStockFilter("out_of_stock", "Made to Order")).toBe(false);
    expect(matchesExportStockFilter("out_of_stock", "Out of Stock")).toBe(true);
    expect(matchesExportStockFilter("low_stock", "Low Stock")).toBe(true);
    expect(matchesExportStockFilter("low_stock", "Made to Order")).toBe(false);
    expect(matchesExportStockFilter("active_only", "Out of Stock")).toBe(true);
  });
});
