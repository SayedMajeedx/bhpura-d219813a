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
  deleteVariants: vi.fn(async () => undefined),
  updateProduct: vi.fn(async () => undefined),
  updateVariant: vi.fn(async () => undefined),
  updateVariants: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast }));
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
