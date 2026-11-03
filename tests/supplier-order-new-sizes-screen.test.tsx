import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupplierCatalog } from "../src/features/supplier-orders/hooks/use-supplier-catalog";

// A supplier's order adds a size or colour its product does not have, from the product's card: a
// size it has is just ordered, an archived one comes back with its history, the rest are made at
// the price its sizes share, and each starts at one piece in the order.

const stubs = vi.hoisted(() => ({
  permissions: ["manage_inventory", "view_financials"],
  toast: { success: vi.fn(), error: vi.fn() },
  data: {
    catalogKeys: { variants: (brand: string) => ["variants", brand] },
    createVariants: vi.fn(async (_b: string, rows: unknown[]) => rows.map((_, i) => `made-${i}`)),
    updateVariant: vi.fn(async () => undefined),
    removeVariants: vi.fn(async () => ({ deleted: 1, archived: 0 })),
    restoreVariant: vi.fn(async () => undefined),
  },
}));
const profile = () => ({
  isAdmin: false,
  hasPermission: (p: string) => stubs.permissions.includes(p),
});
vi.mock("sonner", () => ({ toast: stubs.toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/data/catalog", () => stubs.data);
vi.mock("../src/lib/data/catalog", () => stubs.data);
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => ({ id: "u1" }) }));
vi.mock("../src/lib/auth/session", () => ({ getCurrentUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/profile-context", () => ({ useProfileOptional: profile, useProfile: profile }));
vi.mock("../src/lib/profile-context", () => ({ useProfileOptional: profile, useProfile: profile }));
vi.mock("@/hooks/use-order-number", () => ({ useOrderNumberFormat: () => null }));
vi.mock("../src/hooks/use-order-number", () => ({ useOrderNumberFormat: () => null }));
vi.mock("@/features/inventory/hooks/use-inventory-axis-defaults", () => ({
  useInventoryAxisDefaults: () => ({}),
}));
vi.mock("../src/features/inventory/hooks/use-inventory-axis-defaults", () => ({
  useInventoryAxisDefaults: () => ({}),
}));

const { ProductLinesCard } =
  await import("../src/features/supplier-orders/components/ProductLinesCard");
const { productLabel, shelfOf, sizeLabel, sizesByProduct } =
  await import("../src/features/supplier-orders/lib/catalog");

const variant = (id: string, over: Record<string, unknown>) => ({
  id,
  product_id: "p1",
  sku: null,
  size: null,
  color: null,
  fabric: null,
  option_four: null,
  option_five: null,
  stock_main: 0,
  stock_incubator: 0,
  selling_price: 30,
  original_price: null,
  archived_at: null,
  created_at: id,
  ...over,
});
const inUse = [variant("v-s", { size: "S" }), variant("v-m", { size: "M" })];
// Another product sells in L: the store's usual sizes offer it in one tap.
const other = variant("o-l", { product_id: "p2", size: "L" });
const archived = variant("v-xl", { size: "XL", archived_at: "2026-11-01T00:00:00Z" });
const product = {
  id: "p1",
  name: "Abaya",
  name_ar: null,
  name_en: null,
  image_url: null,
  base_price: 25,
  cost_price: 12,
};
const every = [...inUse, other, archived];
const catalog = {
  products: [product],
  variants: [...inUse, other],
  sizes: sizesByProduct([...inUse, other]),
  archivedSizes: sizesByProduct([archived]),
  productById: new Map([["p1", product]]),
  variantById: new Map(every.map((v) => [v.id, v])),
  shelf: shelfOf([...inUse, other]),
  productName: () => productLabel(product, "en"),
  sizeName: (id: string | null | undefined) =>
    sizeLabel(every.find((v) => v.id === id) ?? null, "en"),
  queries: [],
} as unknown as SupplierCatalog;

const renderCard = (onChange = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProductLinesCard
        brandId="b1"
        product={{ key: "k1", productId: "p1", unitCost: "18", sizes: {} }}
        catalog={catalog}
        problems={[]}
        perPiece={undefined}
        currency="BHD"
        moneyLabel="BHD"
        lang="en"
        onChange={onChange}
        onRemove={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return onChange;
};

beforeEach(() => {
  vi.clearAllMocks();
  stubs.permissions = ["manage_inventory", "view_financials"];
});

describe("adding a size from a supplier's order", () => {
  it("orders one it has, brings back one archived and makes the rest", async () => {
    const onChange = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Add a size or colour" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "L" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "M" }));
    const typed = within(dialog).getByLabelText("Another size");
    fireEvent.change(typed, { target: { value: "XL" } });
    fireEvent.keyDown(typed, { key: "Enter" });
    expect(within(dialog).getByText(/New, added to the product/).parentElement).toHaveTextContent(
      "L",
    );
    expect(within(dialog).getByText(/Removed before/).parentElement).toHaveTextContent("XL");
    expect(within(dialog).getByText(/Already on the product/).parentElement).toHaveTextContent("M");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to the order" }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(stubs.data.restoreVariant).toHaveBeenCalledWith("v-xl");
    expect(stubs.data.createVariants).toHaveBeenCalledWith("b1", [
      expect.objectContaining({
        product_id: "p1",
        size: "L",
        selling_price: 30,
        stock_main: 0,
        cost_price: 12,
      }),
    ]);
    expect(stubs.data.removeVariants).not.toHaveBeenCalled();
    expect(onChange.mock.calls[0][0].sizes).toEqual({
      "made-0": { quantity: "1", received: 0 },
      "v-m": { quantity: "1", received: 0 },
      "v-xl": { quantity: "1", received: 0 },
    });
  });

  it("needs the permission to manage stock, and says so", () => {
    stubs.permissions = ["view_financials"];
    renderCard();
    expect(screen.getByRole("button", { name: "Add a size or colour" })).toBeDisabled();
    expect(screen.getByText(/needs the permission to manage stock/)).toBeInTheDocument();
  });
});
