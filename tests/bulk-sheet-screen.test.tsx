import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product, Variant } from "../src/features/inventory/types";

// The inventory's sheet on screen: a cell changed by hand and a bulk change on chosen rows are
// listed for review, and only then saved, each with the product editor's own write (a price with
// updateVariant, stock through the ledger as a count, a product shown with updateProducts).

const calls = vi.hoisted(() => ({
  updateVariant: vi.fn(async () => undefined),
  adjustVariantStock: vi.fn(async () => undefined),
  updateProducts: vi.fn(async () => undefined),
}));
const catalog = {
  updateVariant: calls.updateVariant,
  adjustVariantStock: calls.adjustVariantStock,
  updateProducts: calls.updateProducts,
};
vi.mock("../src/lib/data/catalog", () => catalog);
vi.mock("@/lib/data/catalog", () => catalog);
const axes = { useInventoryAxisDefaults: () => ({}) };
vi.mock("../src/features/inventory/hooks/use-inventory-axis-defaults", () => axes);
vi.mock("@/features/inventory/hooks/use-inventory-axis-defaults", () => axes);
const vocabulary = { useVocabulary: () => ({ vocabulary: {} }) };
vi.mock("../src/hooks/use-vocabulary", () => vocabulary);
vi.mock("@/hooks/use-vocabulary", () => vocabulary);
const toast = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({ toast }));

const { InventorySheet } = await import("../src/features/inventory/components/InventorySheet");

const products = [
  { id: "p1", name: "Abaya", name_en: "Abaya", name_ar: null, image_url: null, is_active: true },
  { id: "p2", name: "Shawl", name_en: "Shawl", name_ar: null, image_url: null, is_active: false },
] as unknown as Product[];
const v = (id: string, extra: Record<string, unknown>) =>
  ({
    id,
    sku: `SKU-${id}`,
    size: null,
    color: null,
    selling_price: 20,
    original_price: null,
    stock_main: 3,
    stock_incubator: 0,
    cost_price: 8,
    ...extra,
  }) as unknown as Variant;
const variantsByProduct = {
  p1: [v("v54", { size: "54", selling_price: 30 }), v("v56", { size: "56", selling_price: 30 })],
  p2: [v("s1", { selling_price: 12 })],
};

function renderSheet(canViewCosts = true) {
  const onSaved = vi.fn();
  render(
    <InventorySheet
      brandId="b1"
      products={products}
      variantsByProduct={variantsByProduct}
      currency="BHD"
      isAr={false}
      canViewCosts={canViewCosts}
      onSaved={onSaved}
      onDirtyChange={() => undefined}
    />,
  );
  return { onSaved };
}

beforeEach(() => vi.clearAllMocks());

describe("the inventory's sheet", () => {
  it("lists every size with its cells, and a cost column only for staff who see costs", () => {
    renderSheet();
    expect(screen.getByLabelText("Price: Abaya · 54")).toHaveValue("30");
    expect(screen.getByLabelText("Cost: Shawl · No options")).toHaveValue("8");
    renderSheet(false);
    expect(screen.getAllByLabelText(/^Cost:/)).toHaveLength(3); // only the first sheet's
  });

  it("saves a reviewed change with the editor's own writes, and nothing before the review", async () => {
    const { onSaved } = renderSheet();
    fireEvent.change(screen.getByLabelText("Price: Abaya · 54"), { target: { value: "27.5" } });
    fireEvent.change(screen.getByLabelText("Stock: Shawl · No options"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Show on the store: Shawl" }));
    expect(screen.getByText("3 changes not saved yet")).toBeTruthy();
    expect(calls.updateVariant).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    const review = await screen.findByRole("dialog");
    expect(within(review).getByText("BHD 30.000")).toBeTruthy();
    expect(within(review).getByText("BHD 27.500")).toBeTruthy();
    fireEvent.click(within(review).getByRole("button", { name: "Save 3 changes" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls.updateVariant).toHaveBeenCalledWith("b1", "v54", { selling_price: 27.5 });
    expect(calls.adjustVariantStock).toHaveBeenCalledWith({
      variantId: "s1",
      location: "main",
      mode: "set",
      value: 9,
      reason: "correction",
      note: "Bulk sheet: count",
    });
    expect(calls.updateProducts).toHaveBeenCalledWith("b1", ["p2"], { is_active: true });
    expect(toast.success).toHaveBeenCalledWith("Saved 3 changes");
  });

  it("changes the chosen rows by a percentage for review", async () => {
    renderSheet();
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose Abaya · 54" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose Abaya · 56" }));
    fireEvent.change(screen.getByLabelText("Percentage"), { target: { value: "-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply to chosen" }));
    expect(screen.getByLabelText("Price: Abaya · 54")).toHaveValue("27");
    expect(screen.getByLabelText("Price: Abaya · 56")).toHaveValue("27");
    expect(screen.getByLabelText("Price: Shawl · No options")).toHaveValue("12");
  });

  it("will not save a cell that is not a number", () => {
    renderSheet();
    fireEvent.change(screen.getByLabelText("Price: Abaya · 54"), { target: { value: "abc" } });
    expect(screen.getByText("Fix the marked cells: 1 size")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review and save" })).toBeDisabled();
  });

  it("keeps a change that failed to save, to try again", async () => {
    calls.adjustVariantStock.mockRejectedValueOnce(new Error("permission denied"));
    renderSheet();
    fireEvent.change(screen.getByLabelText("Stock: Abaya · 54"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Review and save" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Save 1 change" }),
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByLabelText("Stock: Abaya · 54")).toHaveValue("5");
    expect(screen.getByText("1 change not saved yet")).toBeTruthy();
  });
});
