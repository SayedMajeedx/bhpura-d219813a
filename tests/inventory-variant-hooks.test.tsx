import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Variant } from "../src/features/inventory/types";

// The variants table's price and barcode edits: bulk "Set Price" and "Cost
// Markup %" keep the struck-through original price as an inline edit does
// (bug backlog #3, #6), and editing a barcode refuses the same duplicates as
// adding one (#4).

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const catalog = vi.hoisted(() => ({
  adjustVariantStock: vi.fn(async () => undefined),
  createVariants: vi.fn(async () => undefined),
  removeVariants: vi.fn(async (): Promise<{ deleted: number; archived: number }> => ({
    deleted: 1,
    archived: 0,
  })),
  updateProduct: vi.fn(async () => undefined),
  updateVariant: vi.fn(async () => undefined),
  updateVariants: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast }));
const confirm = { confirmDialog: async () => true };
vi.mock("../src/components/ui/confirm-dialog", () => confirm);
vi.mock("@/components/ui/confirm-dialog", () => confirm);
vi.mock("../src/lib/data/catalog", () => catalog);
vi.mock("@/lib/data/catalog", () => catalog);
const brandContext = { useBrand: () => ({ id: "b1", slug: "pura" }) };
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);
const translations = { prefetchOptionTranslations: vi.fn() };
vi.mock("../src/features/inventory/lib/option-translations", () => translations);
vi.mock("@/features/inventory/lib/option-translations", () => translations);
const session = { getCurrentUser: async () => ({ id: "u1" }) };
vi.mock("../src/lib/auth/session", () => session);
vi.mock("@/lib/auth/session", () => session);

const { useVariantBulkActions } =
  await import("../src/features/inventory/hooks/use-variant-bulk-actions");
const { useVariantMutations } =
  await import("../src/features/inventory/hooks/use-variant-mutations");
const { emptyVariantDraft } = await import("../src/features/inventory/lib/variant-draft");

const variant = (overrides: Partial<Variant>): Variant =>
  ({
    id: "v1",
    size: "M",
    color: null,
    barcode: null,
    cost_price: 10,
    selling_price: 20,
    original_price: null,
    stock_main: 1,
    stock_incubator: 0,
    ...overrides,
  }) as Variant;

const variants = [
  variant({ id: "v1", cost_price: 10 }),
  variant({ id: "v2", cost_price: 4, barcode: "ABC-123" }),
];

beforeEach(() => {
  vi.clearAllMocks();
});

const selectAll = (onChanged = vi.fn()) => {
  const hook = renderHook(() => useVariantBulkActions(variants, onChanged, false, 15));
  act(() => hook.result.current.toggleSelectAll());
  return hook;
};

describe("bulk price actions", () => {
  it("sets a price below the regular price with the regular price struck through", async () => {
    vi.stubGlobal("prompt", () => "12");
    const onChanged = vi.fn();
    const { result } = selectAll(onChanged);
    await act(() => result.current.bulkSetPrice());
    expect(catalog.updateVariants).toHaveBeenCalledWith("b1", ["v1", "v2"], {
      selling_price: 12,
      original_price: 15,
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("clears the original price when the new price is not a discount", async () => {
    vi.stubGlobal("prompt", () => "18");
    const { result } = selectAll();
    await act(() => result.current.bulkSetPrice());
    expect(catalog.updateVariants).toHaveBeenCalledWith("b1", ["v1", "v2"], {
      selling_price: 18,
      original_price: null,
    });
  });

  it("reads the markup as a percentage and prices each variant from its cost", async () => {
    const prompt = vi.fn(() => "50");
    vi.stubGlobal("prompt", prompt);
    const { result } = selectAll();
    await act(() => result.current.bulkApplyMarkup());
    expect(prompt).toHaveBeenCalledWith("Enter markup percentage (e.g. 50 for 50%):");
    expect(catalog.updateVariant).toHaveBeenCalledWith("b1", "v1", {
      selling_price: 15,
      original_price: null,
    });
    expect(catalog.updateVariant).toHaveBeenCalledWith("b1", "v2", {
      selling_price: 6,
      original_price: 15,
    });
  });
});

describe("editing a variant's barcode", () => {
  const axis = { label: "", visible: true, isCustom: false };
  const axes = { size: axis, color: axis, fabric: axis, four: axis, five: axis };
  const renderMutations = () =>
    renderHook(() =>
      useVariantMutations({
        productId: "p1",
        variants,
        axes,
        isAr: false,
        onChanged: vi.fn(),
      }),
    ).result.current;

  it("refuses a barcode another variant has, whatever its case or spacing", async () => {
    const { update } = renderMutations();
    await act(() => update(variants[0], { barcode: " abc-123 " }));
    expect(toast.error).toHaveBeenCalledWith("This barcode is already assigned to another variant");
    expect(catalog.updateVariant).not.toHaveBeenCalled();
  });

  it("saves the variant's own barcode and a new one", async () => {
    const { update } = renderMutations();
    await act(() => update(variants[1], { barcode: "abc-123" }));
    await act(() => update(variants[0], { barcode: "NEW-1" }));
    expect(toast.error).not.toHaveBeenCalled();
    expect(catalog.updateVariant).toHaveBeenCalledTimes(2);
  });
});

describe("adding a variant whose option name cannot be saved", () => {
  it("adds the variant and says the option's name is missing (bug backlog #16)", async () => {
    catalog.updateProduct.mockImplementation(async (_b: string, _p: string, patch: object) => {
      if ("variant_label_color_ar" in patch) throw { message: "permission denied" };
    });
    const axis = { label: "", visible: true, isCustom: false };
    const onAdded = vi.fn();
    const { result } = renderHook(() =>
      useVariantMutations({
        productId: "p1",
        variants,
        axes: { size: axis, color: axis, fabric: axis, four: axis, five: axis },
        isAr: false,
        onChanged: vi.fn(),
      }),
    );
    await act(() =>
      result.current.add({ ...emptyVariantDraft(), size: "L", color: "Rose" }, onAdded),
    );
    expect(catalog.createVariants).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Variant added, but the option's name could not be saved.",
      expect.anything(),
    );
    expect(onAdded).toHaveBeenCalledTimes(1);
  });
});

describe("editing a variant's stock", () => {
  const axis = { label: "", visible: true, isCustom: false };
  const axes = { size: axis, color: axis, fabric: axis, four: axis, five: axis };
  const renderMutations = () =>
    renderHook(() =>
      useVariantMutations({
        productId: "p1",
        variants,
        axes,
        isAr: false,
        onChanged: vi.fn(),
      }),
    ).result.current;

  it("adjusts the store's own stock through the ledger", async () => {
    const { update } = renderMutations();
    await act(() => update(variants[0], { stock_main: 9 }));
    expect(catalog.adjustVariantStock).toHaveBeenCalledTimes(1);
    expect(catalog.adjustVariantStock).toHaveBeenCalledWith(
      expect.objectContaining({ variantId: variants[0].id, location: "main", value: 9 }),
    );
  });

  it("sends a change made in the stock dialog once, with its reason and note", async () => {
    const { changeStock } = renderMutations();
    let saved = false;
    await act(async () => {
      saved = await changeStock(variants[0], {
        mode: "delta",
        value: -2,
        reason: "correction",
        note: "Damaged or lost: torn",
      });
    });
    expect(saved).toBe(true);
    expect(catalog.adjustVariantStock).toHaveBeenCalledTimes(1);
    expect(catalog.adjustVariantStock).toHaveBeenCalledWith({
      variantId: variants[0].id,
      location: "main",
      mode: "delta",
      value: -2,
      reason: "correction",
      note: "Damaged or lost: torn",
    });
  });

  it("says a refused stock change was refused, so the dialog keeps what was typed", async () => {
    catalog.adjustVariantStock.mockRejectedValueOnce(new Error("NOT_AUTHORIZED"));
    const { changeStock } = renderMutations();
    let saved = true;
    await act(async () => {
      saved = await changeStock(variants[0], {
        mode: "set",
        value: 4,
        reason: "correction",
        note: "Count correction",
      });
    });
    expect(saved).toBe(false);
    expect(toast.error).toHaveBeenCalled();
  });

  it("never adjusts the pieces held at partners: they move on the partners' page", async () => {
    const { update } = renderMutations();
    await act(() => update(variants[0], { stock_incubator: 4 }));
    expect(catalog.adjustVariantStock).not.toHaveBeenCalled();
    // Nor is the number written with the row's other columns.
    for (const [, , patch] of catalog.updateVariant.mock.calls as unknown as Array<
      [string, string, Record<string, unknown>]
    >) {
      expect(patch).not.toHaveProperty("stock_incubator");
    }
  });
});

describe("removing variants", () => {
  const axis = { label: "", visible: true, isCustom: false };
  const axes = { size: axis, color: axis, fabric: axis, four: axis, five: axis };
  const product = { id: "p1", item_kind: "product" } as never;
  const mutations = (list = variants) =>
    renderHook(() =>
      useVariantMutations({
        productId: "p1",
        product,
        variants: list,
        axes,
        isAr: false,
        onChanged: vi.fn(),
      }),
    ).result.current;

  it("says when a size with a history was archived rather than deleted", async () => {
    catalog.removeVariants.mockResolvedValueOnce({ deleted: 0, archived: 1 });
    const { del } = mutations();
    await act(() => del("v2"));
    expect(catalog.removeVariants).toHaveBeenCalledWith(["v2"]);
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^1 variant archived/));
  });

  it("never asks to remove a product's last size", async () => {
    const { del } = mutations([variants[0]]);
    await act(() => del("v1"));
    expect(catalog.removeVariants).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/keeps at least one variant/));
  });

  it("words the database's refusal of a size that still has pieces", async () => {
    catalog.removeVariants.mockRejectedValueOnce({ message: "VARIANT_HAS_STOCK" });
    const { del } = mutations();
    await act(() => del("v2"));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/still has pieces in stock/));
  });

  it("refuses a bulk removal of every size, and reports one that leaves a size", async () => {
    const all = renderHook(() => useVariantBulkActions(variants, vi.fn(), false, 15, product));
    act(() => all.result.current.toggleSelectAll());
    await act(() => all.result.current.bulkDelete());
    expect(catalog.removeVariants).not.toHaveBeenCalled();

    catalog.removeVariants.mockResolvedValueOnce({ deleted: 1, archived: 0 });
    const one = renderHook(() => useVariantBulkActions(variants, vi.fn(), false, 15, product));
    act(() => one.result.current.toggleSelect("v2"));
    await act(() => one.result.current.bulkDelete());
    expect(catalog.removeVariants).toHaveBeenCalledWith(["v2"]);
    expect(toast.success).toHaveBeenCalledWith("1 variant deleted.");
  });
});
