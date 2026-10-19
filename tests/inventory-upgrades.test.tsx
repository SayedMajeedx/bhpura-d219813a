import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product, Variant } from "../src/features/inventory/types";
import { ATTENTION_KEYS, productAttentionReasons } from "../src/features/inventory/lib/attention";
import {
  DEFAULT_INVENTORY_VIEW,
  activeFilterCount,
  inventoryViewFromSearch,
  inventoryViewToSearch,
} from "../src/features/inventory/lib/list-view";
import { planStockChange } from "../src/features/inventory/lib/stock-change";
import { stockTotals } from "../src/features/inventory/lib/stock-totals";
import { inventoryScopeTabs } from "../src/features/inventory/lib/inventory-scope-tabs";
import { productFiguresFrom } from "../src/features/inventory/lib/product-list";
import { lowStockLevel } from "../src/lib/inventory-health";
import { productAvailability } from "../src/lib/product-availability";
import { exportStockStatus } from "../src/features/import-export/lib/export-stock-status";
import { productListFilterOptions } from "../src/features/import-export/lib/store-columns";
import { inventoryIntelFor } from "../src/features/dashboard/lib/dashboard-metrics";

// Step 4 of the inventory plan: the store's own low-stock level, one attention rule, a list
// whose view lives in the address, stock totals, and a stock change that says why.

const vocabulary = {
  useVocabulary: () => ({ vocabulary: { made_to_order: { ar: "تفصيل", en: "Tailoring" } } }),
};
vi.mock("../src/hooks/use-vocabulary", () => vocabulary);
vi.mock("@/hooks/use-vocabulary", () => vocabulary);

const { StockChangeControl } =
  await import("../src/features/inventory/components/StockChangeControl");
const { StockOverviewStrip } =
  await import("../src/features/inventory/components/StockOverviewStrip");
const { InventoryMobileCard } = await import("../src/components/inventory/InventoryMobileCard");
const { InventoryToolbar } = await import("../src/components/inventory/InventoryToolbar");
const { useInventoryList } = await import("../src/features/inventory/hooks/use-inventory-list");

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: "p1",
    name: "Abaya",
    name_ar: "عباية",
    name_en: "Abaya",
    category: "abayas",
    image_url: "https://x/a.jpg",
    media: [],
    is_active: true,
    featured_trending: false,
    is_made_to_order: false,
    item_kind: "product",
    base_price: 30,
    cost_price: 0,
    ...over,
  }) as Product;

const variant = (over: Partial<Variant> = {}): Variant =>
  ({
    id: "v1",
    product_id: "p1",
    sku: "AB-S",
    size: "S",
    color: "Black",
    fabric: null,
    cost_price: 10,
    selling_price: 30,
    original_price: null,
    stock: 0,
    stock_main: 0,
    stock_incubator: 0,
    barcode: null,
    size_unit: null,
    image_url: null,
    ...over,
  }) as Variant;

const keys = (reasons: Array<{ key: string }>) => reasons.map((reason) => reason.key);

describe("the store's own low-stock level", () => {
  it("reads a whole number from 0 to 1000 and falls back to 5", () => {
    expect(lowStockLevel(2)).toBe(2);
    expect(lowStockLevel("12")).toBe(12);
    expect(lowStockLevel(0)).toBe(0);
    for (const bad of [null, undefined, "", "abc", 2.5, -1, 1001]) {
      expect(lowStockLevel(bad)).toBe(5);
    }
  });

  it("decides 'low' wherever the availability rule is read", () => {
    const sold = { is_made_to_order: false, item_kind: "product" };
    expect(productAvailability(sold, 4).status).toBe("low");
    expect(productAvailability(sold, 4, 0, 2).status).toBe("available");
    expect(productAvailability(sold, 12, 0, 20).status).toBe("low");
    // 0 turns the warning off; a product with nothing left is still out.
    expect(productAvailability(sold, 1, 0, 0).status).toBe("available");
    expect(productAvailability(sold, 0, 0, 0).status).toBe("out");
    // Never for what is not sold from stock.
    expect(productAvailability({ is_made_to_order: true }, 1, 0, 20).status).toBe("made_to_order");
  });

  it("is the export's number, in its filter and its label", () => {
    expect(exportStockStatus(product(), 4)).toBe("Low Stock");
    expect(exportStockStatus(product(), 4, 2)).toBe("In Stock");
    const low = (level?: number) =>
      productListFilterOptions(true, level).find((option) => option.value === "low_stock");
    expect(low()?.labelEn).toBe("Low Stock (≤ 5)");
    expect(low(12)?.labelEn).toBe("Low Stock (≤ 12)");
    expect(low(12)?.labelAr).toContain("12");
  });

  it("is the dashboard's number", () => {
    const rows = {
      productRows: [product()] as never,
      variantRows: [variant({ stock_main: 4 })] as never,
      validRevenueOrders: [] as never,
      lang: "en",
      now: new Date("2026-10-11T00:00:00Z"),
    };
    expect(inventoryIntelFor(rows).lowStockCount).toBe(1);
    expect(inventoryIntelFor({ ...rows, lowStockUnits: 2 }).lowStockCount).toBe(0);
  });
});

describe("one attention rule", () => {
  it("names every issue a product has, stock first", () => {
    const messy = product({ image_url: null, category: " ", is_active: false });
    expect(
      keys(productAttentionReasons(messy, { stock: 3, lowestPrice: 0, missingCost: true })),
    ).toEqual([
      "low_stock",
      "missing_image",
      "missing_price",
      "missing_cost",
      "missing_category",
      "hidden_with_stock",
    ]);
    expect(productAttentionReasons(product(), { stock: 40, lowestPrice: 30 })).toEqual([]);
    expect(keys(productAttentionReasons(product(), { stock: 0 }))).toEqual(["out_of_stock"]);
  });

  it("follows the store's level and the one availability rule", () => {
    expect(keys(productAttentionReasons(product(), { stock: 4, lowStockUnits: 2 }))).toEqual([]);
    // A made-to-order piece or a service with no ready stock is not out.
    expect(productAttentionReasons(product({ is_made_to_order: true }), { stock: 0 })).toEqual([]);
    expect(productAttentionReasons(product({ item_kind: "service" }), { stock: 0 })).toEqual([]);
  });

  it("does not ask a price of a catalog that shows none, or when the price is not known", () => {
    expect(keys(productAttentionReasons(product(), { stock: 40, lowestPrice: 0 }))).toEqual([
      "missing_price",
    ]);
    expect(
      productAttentionReasons(product(), { stock: 40, lowestPrice: 0, pricesMatter: false }),
    ).toEqual([]);
    expect(productAttentionReasons(product(), { stock: 40 })).toEqual([]);
  });

  it("is what a phone card shows too", () => {
    render(
      <InventoryMobileCard
        lang="en"
        product={product({ image_url: null, is_active: false })}
        variants={[]}
        totalStock={3}
        minPrice={30}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onPrintLabel={vi.fn()}
      />,
    );
    expect(screen.getByText("Low Stock")).toBeInTheDocument();
    expect(screen.getByText("No Image")).toBeInTheDocument();
    expect(screen.getByText("Hidden with Stock")).toBeInTheDocument();
  });
});

describe("the list's view in the address", () => {
  it("reads a view and writes it back, leaving defaults and other parameters alone", () => {
    const view = inventoryViewFromSearch({
      q: " silk ",
      scope: "low",
      category: "abayas",
      issue: "missing_image",
      sort: "best-selling",
      page: "3",
    });
    expect(view).toEqual({
      search: "silk",
      scope: "low",
      category: "abayas",
      issue: "missing_image",
      sort: "best-selling",
      page: 3,
    });
    expect(inventoryViewToSearch("?action=new&filter=low_stock", view)).toBe(
      "action=new&q=silk&scope=low&category=abayas&issue=missing_image&sort=best-selling&page=3",
    );
    expect(inventoryViewToSearch("?scope=low&page=4", DEFAULT_INVENTORY_VIEW)).toBe("");
    expect(activeFilterCount(view)).toBe(3);
    expect(activeFilterCount(DEFAULT_INVENTORY_VIEW)).toBe(0);
  });

  it("opens a dashboard link's tab and ignores what it does not know", () => {
    expect(inventoryViewFromSearch({ filter: "low_stock" }).scope).toBe("low");
    expect(inventoryViewFromSearch({ filter: "out_of_stock", scope: "attention" }).scope).toBe(
      "attention",
    );
    expect(
      inventoryViewFromSearch({ scope: "nope", issue: "nope", sort: "nope", page: "-2", q: 7 }),
    ).toEqual(DEFAULT_INVENTORY_VIEW);
  });

  it("mirrors the view into the address without the router, and starts a change on page 1", () => {
    window.history.replaceState(null, "", "/admin/b/zh/inventory?action=keep");
    const quiet = vi.spyOn(History.prototype, "replaceState");
    const products = Array.from({ length: 25 }, (_, index) =>
      product({ id: `p${index}`, name_en: `Piece ${index}`, category: index < 3 ? "x" : "y" }),
    );
    const { result } = renderHook(() =>
      useInventoryList({
        products,
        variants: [],
        salesHistory: [],
        initialView: { ...DEFAULT_INVENTORY_VIEW, page: 2 },
        lowStockUnits: 5,
        pricesMatter: true,
        lang: "en",
      }),
    );
    expect(result.current.page).toBe(2);
    expect(result.current.pageProducts).toHaveLength(10);
    expect(window.location.search).toBe("?action=keep&page=2");

    act(() => result.current.change({ category: "x" }));
    expect(result.current.page).toBe(1);
    expect(result.current.filtered).toHaveLength(3);
    expect(window.location.search).toBe("?action=keep&category=x");
    expect(result.current.activeFilterCount).toBe(1);

    act(() => result.current.clearFilters());
    expect(window.location.search).toBe("?action=keep");
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it("counts the tabs with the one rule and the store's level", () => {
    const products = [
      product({ id: "low" }),
      product({ id: "out" }),
      product({ id: "hidden", is_active: false }),
      product({ id: "made", is_made_to_order: true }),
    ];
    const variants = [
      variant({ id: "v-low", product_id: "low", stock_main: 4 }),
      variant({ id: "v-out", product_id: "out", stock_main: 0 }),
      variant({ id: "v-hidden", product_id: "hidden", stock_main: 50 }),
      variant({ id: "v-made", product_id: "made", stock_main: 0 }),
    ];
    const countsAt = (lowStockUnits: number) =>
      renderHook(() =>
        useInventoryList({
          products,
          variants,
          salesHistory: [],
          initialView: DEFAULT_INVENTORY_VIEW,
          lowStockUnits,
          pricesMatter: true,
          lang: "en",
        }),
      ).result.current.counts;
    expect(countsAt(5)).toMatchObject({ all: 4, low: 1, out: 1, attention: 3, madeToOrder: 1 });
    expect(countsAt(2)).toMatchObject({ low: 0, out: 1, attention: 2 });
  });
});

describe("the tabs and the toolbar", () => {
  const counts = { all: 9, attention: 2, active: 7, inactive: 2, low: 1, out: 1, featured: 0 };

  it("offers a made-to-order tab, in the store's word, only to a store that has such products", () => {
    expect(inventoryScopeTabs(counts).map((tab) => tab.id)).not.toContain("made_to_order");
    const tabs = inventoryScopeTabs(
      { ...counts, madeToOrder: 4 },
      { madeToOrderLabel: { ar: "تفصيل", en: "Tailoring" } },
    );
    const tab = tabs.find((item) => item.id === "made_to_order");
    expect(tab).toMatchObject({ label_en: "Tailoring", label_ar: "تفصيل", count: 4 });
    // A store that counts no stock still has the tab, and none of the stock tabs.
    expect(
      inventoryScopeTabs({ ...counts, madeToOrder: 4 }, { tracksStock: false }).map((t) => t.id),
    ).toEqual(["all", "active", "inactive", "made_to_order", "featured"]);
  });

  it("names the active filters by what they are, not by their keys", () => {
    const onIssueChange = vi.fn();
    render(
      <InventoryToolbar
        lang="en"
        search=""
        onSearchChange={vi.fn()}
        selectedCategory="abayas"
        onCategoryChange={vi.fn()}
        categories={[{ id: "abayas", name: "Abayas", name_ar: "عبايات" }]}
        sortBy="newest"
        onSortChange={vi.fn()}
        selectedIssue="missing_image"
        onIssueChange={onIssueChange}
        activeFilterCount={2}
        onClearFilters={vi.fn()}
      />,
    );
    expect(screen.getByText("Category: Abayas")).toBeInTheDocument();
    expect(screen.getByText("Issue: No Image")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove issue filter" }));
    expect(onIssueChange).toHaveBeenCalledWith("all");
  });

  it("has an issue for every key", () => {
    expect(ATTENTION_KEYS).toEqual([
      "out_of_stock",
      "low_stock",
      "missing_image",
      "missing_price",
      "missing_cost",
      "missing_category",
      "hidden_with_stock",
    ]);
  });
});

describe("what the stock adds up to", () => {
  const products = [
    product({ id: "a", cost_price: 4 }),
    product({ id: "b", is_made_to_order: true }),
    product({ id: "s", item_kind: "service" }),
    product({ id: "empty" }),
  ];
  const byProduct = {
    a: [
      variant({ product_id: "a", stock_main: 3, stock_incubator: 2, selling_price: 20 }),
      // No cost of its own: it costs what its product costs.
      variant({ id: "v2", product_id: "a", stock_main: 1, selling_price: 25, cost_price: 0 }),
    ],
    // A made-to-order product's ready sizes are pieces on a shelf; this one has no cost at all.
    b: [variant({ id: "v3", product_id: "b", stock_main: 2, selling_price: 50, cost_price: 0 })],
    s: [variant({ id: "v4", product_id: "s", stock_main: 9, selling_price: 99 })],
    empty: [variant({ id: "v5", product_id: "empty", stock_main: 0 })],
  };

  it("counts pieces and their worth, leaving services out", () => {
    expect(stockTotals(products, byProduct)).toEqual({
      productsInStock: 2,
      storePieces: 6,
      partnerPieces: 2,
      retailValue: 5 * 20 + 25 + 2 * 50,
      costValue: 5 * 10 + 4,
      piecesWithoutCost: 2,
    });
  });

  it("works each product's figures out once", () => {
    const figures = productFiguresFrom(products, byProduct, new Map([["v1", 9]]));
    // A size with no cost of its own costs what its product costs: "a" is not missing one.
    expect(figures.get("a")).toMatchObject({ stock: 6, lowestPrice: 20, missingCost: false });
    expect(figures.get("a")?.weeklySales).toBeGreaterThan(0);
    // No variants: the product's own price.
    expect(productFiguresFrom([product({ id: "n" })], {}, new Map()).get("n")).toEqual({
      stock: 0,
      weeklySales: 0,
      lowestPrice: 30,
      missingCost: true,
    });
  });

  it("shows cost only to those who may see it, and the level only editable by those who may", async () => {
    const onSaveLevel = vi.fn().mockResolvedValue(true);
    const strip = (props: { showCost: boolean; canEditLevel: boolean }) => (
      <StockOverviewStrip
        totals={stockTotals(products, byProduct)}
        currency="BHD"
        lang="en"
        showPartners
        lowStockUnits={5}
        onSaveLevel={onSaveLevel}
        {...props}
      />
    );
    const { rerender } = render(strip({ showCost: false, canEditLevel: false }));
    expect(screen.getByText("Pieces in store")).toBeInTheDocument();
    expect(screen.getByText("5 or fewer")).toBeInTheDocument();
    expect(screen.queryByText("Stock value at cost")).toBeNull();
    expect(screen.queryByRole("button", { name: "Change the low stock level" })).toBeNull();

    rerender(strip({ showCost: true, canEditLevel: true }));
    expect(screen.getByText("Stock value at cost")).toBeInTheDocument();
    expect(screen.getByText("2 pieces have no cost entered")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change the low stock level" }));
    const input = await screen.findByRole("spinbutton");
    fireEvent.change(input, { target: { value: "2000" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaveLevel).toHaveBeenCalledWith(2));
  });
});

describe("a stock change says why", () => {
  it("adds an arrival and takes off a loss as a difference, and sets a count", () => {
    expect(planStockChange({ current: 7, kind: "received", amount: "12" })).toEqual({
      ok: true,
      next: 19,
      request: { mode: "delta", value: 12, reason: "manual_adjust", note: "Stock received" },
    });
    expect(planStockChange({ current: 7, kind: "damaged", amount: 2, note: " torn " })).toEqual({
      ok: true,
      next: 5,
      request: { mode: "delta", value: -2, reason: "correction", note: "Damaged or lost: torn" },
    });
    expect(planStockChange({ current: 7, kind: "count", amount: "4" })).toEqual({
      ok: true,
      next: 4,
      request: { mode: "set", value: 4, reason: "correction", note: "Count correction" },
    });
  });

  it("refuses what is not a change", () => {
    const problem = (kind: "received" | "damaged" | "count", amount: string) => {
      const plan = planStockChange({ current: 7, kind, amount });
      return plan.ok ? null : plan.problem;
    };
    expect(problem("received", "")).toBe("amount");
    expect(problem("received", "1.5")).toBe("amount");
    expect(problem("received", "-3")).toBe("amount");
    expect(problem("received", "0")).toBe("nothing");
    expect(problem("count", "7")).toBe("nothing");
    expect(problem("damaged", "8")).toBe("more_than_stock");
    expect(problem("received", "100001")).toBe("too_many");
  });

  describe("the control on a variant's row", () => {
    const onSave = vi.fn();
    beforeEach(() => onSave.mockReset());
    const open = () => {
      render(<StockChangeControl value={7} pieceName="Abaya · M" isAr={false} onSave={onSave} />);
      fireEvent.click(screen.getByRole("button", { name: "Change store stock: 7" }));
    };

    it("sends one request, with its reason, when it is saved", async () => {
      onSave.mockResolvedValue(true);
      open();
      // Nothing is sent by opening it or by typing.
      const amount = screen.getByLabelText("How many arrived?");
      expect(screen.getByRole("button", { name: "Save change" })).toBeDisabled();
      fireEvent.change(amount, { target: { value: "12" } });
      expect(screen.getByText("7 → 19")).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Save change" }));
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(onSave).toHaveBeenCalledWith({
        mode: "delta",
        value: 12,
        reason: "manual_adjust",
        note: "Stock received",
      });
      await waitFor(() => expect(screen.queryByText("Change store stock")).toBeNull());
    });

    it("asks a count for the number on the shelf, and stays open when the change is refused", async () => {
      onSave.mockResolvedValue(false);
      open();
      fireEvent.click(screen.getByRole("radio", { name: "Count correction" }));
      fireEvent.change(screen.getByLabelText("How many are on the shelf now?"), {
        target: { value: "4" },
      });
      fireEvent.change(screen.getByLabelText("Note (optional)"), {
        target: { value: "Friday count" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save change" }));
      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith({
          mode: "set",
          value: 4,
          reason: "correction",
          note: "Count correction: Friday count",
        }),
      );
      expect(screen.getByText("Change store stock")).toBeInTheDocument();
    });

    it("will not take off more than the store holds", () => {
      open();
      fireEvent.click(screen.getByRole("radio", { name: "Damaged or lost" }));
      fireEvent.change(screen.getByLabelText("How many to take off?"), { target: { value: "9" } });
      expect(screen.getByText("That is more than the store holds.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save change" })).toBeDisabled();
    });
  });
});
