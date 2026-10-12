import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The two places a product's cost is typed, as two members of staff see them: one who may see
// the store's finances reads and sets the cost; one who only manages the stock is shown none
// (they cannot read it, so their form must not write it) and still does the rest of the work.

const state = vi.hoisted(() => ({
  canViewFinancials: true,
  saveProductBom: vi.fn(async (..._args: unknown[]) => undefined),
}));
const catalogMock = vi.hoisted(() => () => ({
  saveProductBom: state.saveProductBom,
  applyBomToAllProducts: vi.fn(async () => 0),
  catalogKeys: {
    products: () => ["products"],
    productBom: () => ["product-bom"],
    productBoms: () => ["product-boms"],
    bomItems: () => ["bom-items"],
  },
  catalogQueries: {
    packagingMaterials: () => ({
      queryKey: ["packaging-materials-test"],
      queryFn: async () => [{ id: "m1", name: "Gift box", unit_cost: 0.4, stock_quantity: 50 }],
    }),
    productBom: () => ({
      queryKey: ["product-bom-test"],
      queryFn: async () => [{ packaging_material_id: "m1", quantity_per_unit: 2 }],
    }),
  },
}));
vi.mock("../src/lib/data/catalog", catalogMock);
vi.mock("@/lib/data/catalog", catalogMock);
const profileMock = vi.hoisted(() => () => ({
  useProfile: () => ({ canViewFinancials: state.canViewFinancials }),
}));
vi.mock("../src/lib/profile-context", profileMock);
vi.mock("@/lib/profile-context", profileMock);
const brandMock = vi.hoisted(() => () => ({ useBrand: () => ({ id: "b1", slug: "store" }) }));
vi.mock("../src/lib/brand-context", brandMock);
vi.mock("@/lib/brand-context", brandMock);
const currencyMock = vi.hoisted(() => () => ({ useStoreCurrency: () => "BHD" }));
vi.mock("../src/hooks/use-store-currency", currencyMock);
vi.mock("@/hooks/use-store-currency", currencyMock);
const i18nMock = vi.hoisted(() => () => ({
  useI18n: () => ({ lang: "en" }),
  useT: () => (key: string) => key,
}));
vi.mock("../src/lib/i18n", i18nMock);
vi.mock("@/lib/i18n", i18nMock);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { ProductBomModal } = await import("../src/components/products/ProductBomModal");
const { ProductCostField } = await import("../src/features/inventory/components/ProductCostField");

const dialog = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProductBomModal
        open
        onOpenChange={() => undefined}
        productId="p1"
        productName="Abaya"
        directPackagingCost={0.75}
      />
    </QueryClientProvider>,
  );

const save = async () => {
  // Once the product's packaging lines are loaded (the material is then listed as a line).
  await screen.findByText(/Gift box/);
  fireEvent.click(screen.getByRole("button", { name: "Save for Product" }));
  await waitFor(() => expect(state.saveProductBom).toHaveBeenCalled());
  return state.saveProductBom.mock.calls[0];
};

beforeEach(() => {
  state.canViewFinancials = true;
  state.saveProductBom.mockClear();
});

describe("the packaging dialog", () => {
  it("shows the cost and its total to staff who see finances, and saves what they set", async () => {
    dialog();
    expect(screen.getByText(/Direct Packaging Cost/)).toBeTruthy();
    expect(screen.getByText(/Total Packaging Cost/)).toBeTruthy();
    expect(await save()).toEqual([
      "b1",
      "p1",
      0.75,
      [{ packaging_material_id: "m1", quantity_per_unit: 2 }],
    ]);
  });

  it("shows no cost to staff who only manage the stock, and leaves the cost as it is on save", async () => {
    state.canViewFinancials = false;
    dialog();
    expect(screen.queryByText(/Direct Packaging Cost/)).toBeNull();
    expect(screen.queryByText(/Total Packaging Cost/)).toBeNull();
    // They still say which packaging the product uses.
    expect(await save()).toEqual([
      "b1",
      "p1",
      null,
      [{ packaging_material_id: "m1", quantity_per_unit: 2 }],
    ]);
  });
});

describe("the product editor's cost field", () => {
  const field = (onChange = vi.fn()) => {
    render(<ProductCostField isAr={false} isService={false} value="12.5" onChange={onChange} />);
    return onChange;
  };

  it("is shown to staff who see finances, and passes on what they type", () => {
    const onChange = field();
    const input = screen.getByDisplayValue("12.5");
    fireEvent.change(input, { target: { value: "14" } });
    expect(onChange).toHaveBeenCalledWith("14");
    expect(screen.getByText("Unit Cost (Optional)")).toBeTruthy();
  });

  it("is not there at all for staff who only manage the stock", () => {
    state.canViewFinancials = false;
    field();
    expect(screen.queryByDisplayValue("12.5")).toBeNull();
    expect(screen.queryByText(/Cost/)).toBeNull();
  });
});
