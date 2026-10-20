import React, { useState } from "react";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Product } from "../src/features/inventory/types";
import type { CostPartRow } from "../src/features/inventory/lib/cost-parts";

// A cost in parts in the product editor, and one sheet to fill in every missing cost: made-to-order
// pieces had no cost, so each sale counted its whole price as profit.

const stubs = vi.hoisted(() => ({
  saveProductCost: vi.fn(async (..._args: unknown[]) => undefined),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  canViewFinancials: true,
}));
const catalog = vi.hoisted(() => ({
  countAdminProducts: vi.fn(async () => 0),
  countProductVariants: vi.fn(async () => 1),
  createProduct: vi.fn(async () => "p-new"),
  createVariants: vi.fn(async () => undefined),
  syncVariantsWithProduct: vi.fn(async () => undefined),
  updateProduct: vi.fn(async () => undefined),
  setMadeToOrderLimit: vi.fn(async () => undefined),
  saveProductCost: stubs.saveProductCost,
}));
vi.mock("sonner", () => ({ toast: stubs.toast }));
vi.mock("../src/lib/data/catalog", () => catalog);
vi.mock("@/lib/data/catalog", () => catalog);
vi.mock("../src/lib/data/service-packages", () => ({ savePackageItems: vi.fn() }));
vi.mock("@/lib/data/service-packages", () => ({ savePackageItems: vi.fn() }));
vi.mock("../src/lib/data/service-options", () => ({ saveServiceOptions: vi.fn() }));
vi.mock("@/lib/data/service-options", () => ({ saveServiceOptions: vi.fn() }));
const session = { getCurrentUser: async () => ({ id: "u1" }) };
vi.mock("../src/lib/auth/session", () => session);
vi.mock("@/lib/auth/session", () => session);
const brand = { useBrand: () => ({ id: "b1", slug: "pura" }) };
vi.mock("../src/lib/brand-context", () => brand);
vi.mock("@/lib/brand-context", () => brand);
const entitlements = { useEntitlements: () => ({ entitlements: null }) };
vi.mock("../src/lib/saas-billing/use-entitlements", () => entitlements);
vi.mock("@/lib/saas-billing/use-entitlements", () => entitlements);
const i18n = { useT: () => (key: string) => key, useI18n: () => ({ lang: "en" }) };
vi.mock("../src/lib/i18n", () => i18n);
vi.mock("@/lib/i18n", () => i18n);
const translations = { prefetchOptionTranslations: vi.fn() };
vi.mock("../src/features/inventory/lib/option-translations", () => translations);
vi.mock("@/features/inventory/lib/option-translations", () => translations);
const profile = {
  useProfile: () => ({ canViewFinancials: stubs.canViewFinancials }),
};
vi.mock("../src/lib/profile-context", () => profile);
vi.mock("@/lib/profile-context", () => profile);

const { MissingCostsLine } = await import("../src/features/inventory/components/MissingCostsLine");
const { ProductCostField } = await import("../src/features/inventory/components/ProductCostField");
const { useSaveProduct } = await import("../src/features/inventory/hooks/use-save-product");
const { productFormFrom } = await import("../src/features/inventory/lib/product-form");

beforeEach(() => {
  vi.clearAllMocks();
  stubs.canViewFinancials = true;
});

const item = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  name_ar: null,
  name_en: id,
  image_url: null,
  cost_price: 0,
  ...over,
});

describe("the missing-costs sheet", () => {
  const products = [
    item("Silk scarf"),
    item("Black abaya", { is_made_to_order: true }),
    item("Bag", { cost_price: 9 }),
  ];
  const open = () => {
    const onSaved = vi.fn();
    render(
      <MissingCostsLine
        count={2}
        products={products}
        variantsByProduct={{ "Silk scarf": [{ cost_price: 0 }] }}
        lowestPrice={(id) => (id === "Black abaya" ? 30 : 10)}
        brandId="b1"
        currency="BHD"
        isAr={false}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /2 products have no cost, so their whole price counts as profit/,
      }),
    );
    return { dialog: screen.getByRole("dialog"), onSaved };
  };

  it("lists made-to-order pieces first, and shows the profit a cost leaves", () => {
    const { dialog } = open();
    const rows = within(dialog).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Black abaya"),
      expect.stringContaining("Silk scarf"),
    ]);
    expect(within(dialog).queryByText("Bag")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Cost of Black abaya"), {
      target: { value: "21.25" },
    });
    expect(within(rows[0]).getByText(/Profit BHD\s8\.750 \(29%\)/)).toBeInTheDocument();
  });

  it("saves every cost typed in one press, a cost in parts as its parts", async () => {
    const { dialog, onSaved } = open();
    fireEvent.change(within(dialog).getByLabelText("Cost of Silk scarf"), {
      target: { value: "4" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Break the cost of Black abaya into parts" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Amount of Material"), {
      target: { value: "8.5" },
    });
    fireEvent.change(within(dialog).getByLabelText("Amount of Making"), {
      target: { value: "12" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save 2 costs" }));
    await waitFor(() => expect(stubs.saveProductCost).toHaveBeenCalledTimes(2));
    expect(stubs.saveProductCost.mock.calls).toEqual(
      expect.arrayContaining([
        [
          "b1",
          "Black abaya",
          {
            parts: [
              { label: "Material", amount: 8.5 },
              { label: "Making", amount: 12 },
            ],
          },
        ],
        ["b1", "Silk scarf", { amount: 4 }],
      ]),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(stubs.toast.success).toHaveBeenCalledWith("Saved the cost of 2 products");
  });

  it("keeps a cost that could not be saved, and says so", async () => {
    stubs.saveProductCost.mockRejectedValueOnce({ message: "denied" });
    const { dialog } = open();
    fireEvent.change(within(dialog).getByLabelText("Cost of Black abaya"), {
      target: { value: "20" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save 1 cost" }));
    await waitFor(() => expect(stubs.toast.error).toHaveBeenCalled());
    expect(within(dialog).getByLabelText("Cost of Black abaya")).toHaveValue("20");
  });
});

describe("a cost in parts in the product editor", () => {
  function Harness({ start }: { start: string }) {
    const [cost, setCost] = useState(start);
    const [parts, setParts] = useState<CostPartRow[] | null>(null);
    return (
      <>
        <ProductCostField
          isAr={false}
          isService={false}
          value={cost}
          parts={parts}
          currency="BHD"
          onChange={setCost}
          onPartsChange={(next, total) => {
            setParts(next);
            setCost(total);
          }}
        />
        <output data-testid="cost">{cost}</output>
      </>
    );
  }

  it("turns one number into its first part, and the parts into the cost", () => {
    render(<Harness start="15" />);
    fireEvent.click(screen.getByRole("button", { name: /Break into parts/ }));
    expect(screen.getByLabelText("Amount of Cost")).toHaveValue("15");
    fireEvent.change(screen.getByLabelText("Amount of Material"), { target: { value: "6.5" } });
    expect(screen.getByTestId("cost")).toHaveTextContent("21.5");
    fireEvent.click(screen.getByRole("button", { name: "+ Making" }));
    fireEvent.change(screen.getByLabelText("Amount of Making"), { target: { value: "3" } });
    expect(screen.getByTestId("cost")).toHaveTextContent("24.5");
    // Back to one number: the total is kept.
    fireEvent.click(screen.getByRole("button", { name: "Use one number instead" }));
    expect(screen.getByTestId("cost")).toHaveTextContent("24.5");
    expect(screen.queryByLabelText("Amount of Material")).toBeNull();
  });

  it("is not shown to staff who may not see costs", () => {
    stubs.canViewFinancials = false;
    render(<Harness start="0" />);
    expect(screen.queryByRole("button", { name: /Break into parts/ })).toBeNull();
  });

  it("writes the parts on the product's cost after the product, only when they changed", async () => {
    const product = {
      id: "p1",
      name: "Abaya",
      base_price: 30,
      is_active: true,
      cost_price: 20,
      cost_parts: [{ label: "Material", amount: 20 }],
    } as Product;
    const save = async (parts: CostPartRow[] | null) => {
      const form = { ...productFormFrom(product), name_en: "Abaya", cost_parts: parts };
      const { result } = renderHook(() =>
        useSaveProduct({
          product,
          form,
          isAr: false,
          setErrors: vi.fn(),
          onInvalid: vi.fn(),
          commitMedia: vi.fn(),
          onSaved: vi.fn(),
        }),
      );
      await act(() => result.current({ preventDefault: vi.fn() } as unknown as React.MouseEvent));
    };
    await save([{ key: "k", label: "Material", amount: "20" }]);
    expect(stubs.saveProductCost).not.toHaveBeenCalled();
    await save([
      { key: "k", label: "Material", amount: "8" },
      { key: "m", label: "Making", amount: "14" },
    ]);
    expect(catalog.updateProduct).toHaveBeenCalled();
    expect(stubs.saveProductCost).toHaveBeenCalledWith("b1", "p1", {
      parts: [
        { label: "Material", amount: 8 },
        { label: "Making", amount: 14 },
      ],
    });
  });
});
