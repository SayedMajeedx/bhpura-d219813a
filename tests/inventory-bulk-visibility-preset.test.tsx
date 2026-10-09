import React from "react";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FASHION_CUSTOMIZER_PRESETS } from "../src/addons/fashion-core/presets";
import type { CustomField } from "../src/features/inventory/types";

// Showing or hiding many products on the storefront, and adding a customization preset (Fit
// Passport) to many products at once, from the inventory list's selection.

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const data = vi.hoisted(() => ({
  deleteProducts: vi.fn(async () => undefined),
  updateProducts: vi.fn(async () => undefined),
  updateProduct: vi.fn(async (..._args: unknown[]) => undefined),
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("../src/lib/data/catalog", () => data);
vi.mock("@/lib/data/catalog", () => data);
vi.mock("../src/lib/r2-upload", () => ({ deletePublicMediaUrl: vi.fn() }));
vi.mock("@/lib/r2-upload", () => ({ deletePublicMediaUrl: vi.fn() }));

const { useProductBulkActions } =
  await import("../src/features/inventory/hooks/use-product-bulk-actions");
const { addPresetToProduct } = await import("../src/features/inventory/lib/bulk-preset");
const { BulkSelectionToolbar } = await import("../src/components/bulk-selection-toolbar");
const { BulkVisibilityDialog } =
  await import("../src/features/inventory/components/BulkVisibilityDialog");

const abaya = FASHION_CUSTOMIZER_PRESETS.passport_abaya;
const preset = { key: "passport_abaya", fields: abaya.fields };
const field = (key: string): CustomField => ({
  key,
  label_ar: key,
  label_en: key,
  type: "number",
  required: true,
});

beforeEach(() => vi.clearAllMocks());

describe("addPresetToProduct", () => {
  it("adds every field of the preset and makes the product made to order", () => {
    const patch = addPresetToProduct({ custom_fields: [], is_made_to_order: false }, preset, 100);
    expect(patch?.is_made_to_order).toBe(true);
    expect(patch?.custom_fields.map((f) => f.key)).toEqual(
      abaya.fields.map((f, index) => `f100-${index}-${f.key}`),
    );
  });

  it("leaves a product that already has the preset (however it was added) alone", () => {
    const stamped = abaya.fields.map((f, index) => field(`f55-${index}-${f.key}`));
    expect(addPresetToProduct({ custom_fields: stamped }, preset)).toBeNull();
    expect(
      addPresetToProduct({ custom_fields: abaya.fields.map((f) => field(f.key)) }, preset),
    ).toBeNull();
  });

  it("adds only the fields a product is missing, and drops the old hand-made measurements", () => {
    const some = [field("f1-0-passport_abaya_length"), field("length"), field("note")];
    const patch = addPresetToProduct({ custom_fields: some }, preset, 7);
    const keys = patch?.custom_fields.map((f) => f.key) ?? [];
    expect(keys.filter((k) => k.endsWith("passport_abaya_length"))).toHaveLength(1);
    expect(keys.some((k) => k.endsWith("passport_abaya_bust"))).toBe(true);
    // The hand-made "length" would ask for the measurement twice; the unrelated "note" stays.
    expect(keys).not.toContain("length");
    expect(keys).toContain("note");
  });

  it("copes with a product whose fields were never set", () => {
    expect(addPresetToProduct({ custom_fields: null }, preset, 1)?.custom_fields).toHaveLength(
      abaya.fields.length,
    );
  });
});

const products = ["p1", "p2", "p3"].map((id) => ({
  id,
  base_price: id === "p3" ? 0 : 28,
  custom_fields: id === "p2" ? abaya.fields.map((f) => field(f.key)) : [],
  is_made_to_order: false,
}));
const setup = (onChanged = vi.fn()) =>
  renderHook(() =>
    useProductBulkActions({
      brandId: "b1",
      products: products as never[],
      presets: [preset],
      isAr: false,
      onChanged,
    }),
  );
const selectAll = (result: ReturnType<typeof setup>["result"]) =>
  act(() => {
    result.current.setSelectedProductIds(new Set(["p1", "p2", "p3"]));
  });

describe("bulk publish and hide", () => {
  it("writes is_active for the whole selection and keeps it selected", async () => {
    const onChanged = vi.fn();
    const { result } = setup(onChanged);
    selectAll(result);
    act(() => result.current.setBulkVisibilityTarget(false));
    await act(() => result.current.applyBulkVisibility());
    expect(data.updateProducts).toHaveBeenCalledWith("b1", ["p1", "p2", "p3"], {
      is_active: false,
    });
    expect(toast.success).toHaveBeenCalledWith("3 products hidden from the storefront");
    expect(result.current.bulkVisibilityTarget).toBeNull();
    expect(result.current.selectedProductIds.size).toBe(3);
    expect(onChanged).toHaveBeenCalledTimes(1);

    act(() => result.current.setBulkVisibilityTarget(true));
    await act(() => result.current.applyBulkVisibility());
    expect(data.updateProducts).toHaveBeenLastCalledWith("b1", ["p1", "p2", "p3"], {
      is_active: true,
    });
  });

  it("keeps the dialog open and says so when the write fails", async () => {
    data.updateProducts.mockRejectedValueOnce(new Error("denied"));
    const { result } = setup();
    selectAll(result);
    act(() => result.current.setBulkVisibilityTarget(true));
    await act(() => result.current.applyBulkVisibility());
    expect(toast.error).toHaveBeenCalledWith("denied");
    expect(result.current.bulkVisibilityTarget).toBe(true);
  });

  it("warns, when publishing, about products with no price", () => {
    render(
      <BulkVisibilityDialog
        target={true}
        onOpenChange={() => undefined}
        count={3}
        withoutPrice={1}
        applying={false}
        onConfirm={() => undefined}
        isAr={false}
      />,
    );
    expect(screen.getByText("Publish 3 products to the storefront?")).toBeInTheDocument();
    expect(screen.getByText("Note: 1 of them have no price.")).toBeInTheDocument();
  });
});

describe("bulk preset", () => {
  it("adds the preset to each product that lacks it and reports the rest", async () => {
    const { result } = setup();
    selectAll(result);
    act(() => result.current.setBulkPresetKey("passport_abaya"));
    await act(() => result.current.applyBulkPreset());
    // p2 already has it: only p1 and p3 are written.
    expect(data.updateProduct.mock.calls.map((call) => call[1]).sort()).toEqual(["p1", "p3"]);
    expect(data.updateProduct.mock.calls[0][0]).toBe("b1");
    expect(toast.success).toHaveBeenCalledWith("Added to 2 products, 1 already had it");
    expect(result.current.bulkPresetOpen).toBe(false);
  });

  it("keeps going when one product fails, and says how many", async () => {
    data.updateProduct.mockImplementation(async (_brand: unknown, id: unknown) => {
      if (id === "p3") throw new Error("boom");
    });
    const { result } = setup();
    selectAll(result);
    act(() => {
      result.current.setBulkPresetOpen(true);
      result.current.setBulkPresetKey("passport_abaya");
    });
    await act(() => result.current.applyBulkPreset());
    expect(data.updateProduct).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledWith("Added to 1 products, 1 already had it, 1 failed");
    // The dialog stays open so it can be run again for the one that failed.
    expect(result.current.bulkPresetOpen).toBe(true);
    data.updateProduct.mockImplementation(async () => undefined);
  });

  it("does nothing without a chosen preset or a selection", async () => {
    const { result } = setup();
    await act(() => result.current.applyBulkPreset());
    selectAll(result);
    await act(() => result.current.applyBulkPreset());
    expect(data.updateProduct).not.toHaveBeenCalled();
  });
});

describe("the selection toolbar", () => {
  const toolbar = (selectedCount: number) => {
    const calls = { publish: vi.fn(), hide: vi.fn(), preset: vi.fn() };
    render(
      <BulkSelectionToolbar
        lang="en"
        entityAr="منتج"
        entityEn="products"
        selectedCount={selectedCount}
        allFilteredSelected={false}
        onSelectAll={() => undefined}
        onDeselectAll={() => undefined}
        onDeleteSelected={() => undefined}
        onPublish={calls.publish}
        onHide={calls.hide}
        onApplyPreset={calls.preset}
      />,
    );
    return calls;
  };

  it("offers publish, hide and add customization once something is selected", () => {
    const calls = toolbar(31);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    fireEvent.click(screen.getByRole("button", { name: "Add customization" }));
    expect(calls.publish).toHaveBeenCalledTimes(1);
    expect(calls.hide).toHaveBeenCalledTimes(1);
    expect(calls.preset).toHaveBeenCalledTimes(1);
  });

  it("offers none of them with nothing selected", () => {
    toolbar(0);
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add customization" })).toBeNull();
  });
});
