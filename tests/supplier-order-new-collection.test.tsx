import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Ordering a new collection from a tailor: the product is made from inside the order (hidden from
// the store), and the tailor's bill total is shared over the pieces or checked against them.

type Row = Record<string, unknown>;
const stubs = vi.hoisted(() => ({
  products: [] as Row[],
  variants: [] as Row[],
  createProduct: vi.fn(),
  createVariants: vi.fn(),
  createSupplierOrder: vi.fn(async () => "po-new"),
  navigate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
stubs.createProduct.mockImplementation(async (_brand: string, values: Row) => {
  stubs.products.push({ id: "p-new", image_url: null, ...values });
  return "p-new";
});
stubs.createVariants.mockImplementation(async (_brand: string, rows: Row[]) => {
  rows.forEach((row, i) => stubs.variants.push({ id: `v-new-${i}`, created_at: `9${i}`, ...row }));
});

const options = (key: string, read: () => unknown) => ({
  queryKey: [key],
  queryFn: async () => read(),
});
const mocks: Record<string, unknown> = {
  "data/supplier-orders": {
    supplierOrderQueries: {
      detail: () => options("order", () => null),
      receipts: () => options("receipts", () => []),
      payments: () => options("payments", () => []),
    },
    createSupplierOrder: stubs.createSupplierOrder,
    updateSupplierOrder: vi.fn(),
    recordSupplierPayment: vi.fn(),
    invalidateSupplierOrders: vi.fn(async () => undefined),
  },
  "data/catalog": {
    catalogKeys: { products: () => ["products"], variants: () => ["variants"] },
    catalogQueries: {
      products: () => options("products", () => [...stubs.products]),
      variants: () => options("variants", () => [...stubs.variants]),
    },
    countAdminProducts: vi.fn(async () => 3),
    createProduct: stubs.createProduct,
    createVariants: stubs.createVariants,
    deleteProducts: vi.fn(),
  },
  "data/accounting": {
    accountingQueries: {
      vendorOptions: () => options("vendors", () => [{ id: "tailor", name: "Umm Ali" }]),
    },
    createVendor: vi.fn(),
    invalidateVendors: vi.fn(),
  },
  "data/business-settings": {
    businessSettingsQueries: { detail: () => options("settings", () => ({ currency: "BHD" })) },
  },
  "brand-context": {
    useBrand: () => ({ id: "b1", slug: "pura" }),
    useBrandOptional: () => ({ id: "b1", slug: "pura" }),
  },
  i18n: { useI18n: () => ({ lang: "en" }) },
  "profile-context": { useProfile: () => ({ isAdmin: true, hasPermission: () => true }) },
  session: { getCurrentUser: async () => ({ id: "u1" }) },
  entitlements: { useEntitlements: () => ({ entitlements: { limits: { "products.limit": -1 } } }) },
};
vi.mock("../src/lib/data/supplier-orders", () => mocks["data/supplier-orders"]);
vi.mock("@/lib/data/supplier-orders", () => mocks["data/supplier-orders"]);
vi.mock("../src/lib/data/catalog", () => mocks["data/catalog"]);
vi.mock("@/lib/data/catalog", () => mocks["data/catalog"]);
vi.mock("../src/lib/data/accounting", () => mocks["data/accounting"]);
vi.mock("@/lib/data/accounting", () => mocks["data/accounting"]);
vi.mock("../src/lib/data/business-settings", () => mocks["data/business-settings"]);
vi.mock("@/lib/data/business-settings", () => mocks["data/business-settings"]);
vi.mock("../src/lib/brand-context", () => mocks["brand-context"]);
vi.mock("@/lib/brand-context", () => mocks["brand-context"]);
vi.mock("../src/lib/i18n", () => mocks.i18n);
vi.mock("@/lib/i18n", () => mocks.i18n);
vi.mock("../src/lib/profile-context", () => mocks["profile-context"]);
vi.mock("@/lib/profile-context", () => mocks["profile-context"]);
vi.mock("../src/lib/auth/session", () => mocks.session);
vi.mock("@/lib/auth/session", () => mocks.session);
vi.mock("../src/lib/saas-billing/use-entitlements", () => mocks.entitlements);
vi.mock("@/lib/saas-billing/use-entitlements", () => mocks.entitlements);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
  useNavigate: () => stubs.navigate,
}));
vi.mock("sonner", () => ({ toast: stubs.toast }));

const { SupplierOrderPage } =
  await import("../src/features/supplier-orders/components/SupplierOrderPage");

const open = async () => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SupplierOrderPage orderId="new" />
    </QueryClientProvider>,
  );
  await screen.findByRole("option", { name: "Umm Ali" });
  fireEvent.change(screen.getByLabelText("Supplier"), { target: { value: "tailor" } });
};

beforeEach(() => {
  vi.clearAllMocks();
  stubs.products.splice(0, stubs.products.length, {
    id: "p-old",
    name: "Black abaya",
    name_en: "Black abaya",
    name_ar: null,
    image_url: null,
    base_price: 30,
  });
  stubs.variants.splice(
    0,
    stubs.variants.length,
    ...["52", "54", "56", "54"].map((size, i) => ({
      id: `v-old-${i}`,
      product_id: "p-old",
      size,
      sku: null,
      color: null,
      fabric: null,
      option_four: null,
      option_five: null,
      stock_main: 2,
      stock_incubator: 0,
      cost_price: 15,
      created_at: `0${i}`,
    })),
  );
});

describe("a new collection from a tailor", () => {
  it("says where the cost goes before any product is added", async () => {
    await open();
    expect(
      screen.getByText(/Type what one piece costs you, and how many of each size/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "From my products" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Bill total/)).toBeInTheDocument();
  });

  it("makes the product from the order, hidden, in the store's sizes, and shares the bill", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "New product" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name in English"), {
      target: { value: "Spring abaya" },
    });
    // The store's own sizes, in one tap each.
    fireEvent.click(within(dialog).getByRole("button", { name: "52" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "54" }));
    fireEvent.change(within(dialog).getByLabelText(/Selling price/), { target: { value: "40" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create and add to the order" }));

    await waitFor(() => expect(stubs.createVariants).toHaveBeenCalled());
    expect(stubs.createProduct.mock.calls[0][1]).toMatchObject({
      name: "Spring abaya",
      base_price: 40,
      is_active: false,
      user_id: "u1",
    });
    expect(
      (stubs.createVariants.mock.calls[0][1] as Row[]).map((v) => [v.size, v.stock_main]),
    ).toEqual([
      ["52", 0],
      ["54", 0],
    ]);

    // The product is in the order with its sizes; how many of each, then the tailor's bill.
    // Each size of the new product starts at one piece, once the catalog has read it.
    await waitFor(() => expect(screen.getByLabelText(/^52\s*0 in stock/)).toHaveValue("1"));
    expect(screen.getByLabelText(/^54\s*0 in stock/)).toHaveValue("1");
    fireEvent.change(screen.getByLabelText(/^52\s*0 in stock/), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/^54\s*0 in stock/), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText(/Bill total/), { target: { value: "600" } });
    expect(screen.getByText(/Share BHD\s600\.000 over 10 pieces/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Equally per piece" }));
    expect(screen.getByLabelText(/Cost per piece/)).toHaveValue("60");
    expect(screen.getByText("The order matches the bill.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save order" }));
    await waitFor(() => expect(stubs.createSupplierOrder).toHaveBeenCalled());
    const plan = (
      stubs.createSupplierOrder.mock.calls[0] as unknown as [string, { insert: Row[] }]
    )[1];
    expect(plan.insert.map((l) => [l.variant_id, l.quantity, l.unit_cost])).toEqual([
      ["v-new-0", 4, 60],
      ["v-new-1", 6, 60],
    ]);
  });

  it("checks typed costs against the bill and adds the difference as the rest of it", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "From my products" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Black abaya"));
    fireEvent.change(await screen.findByLabelText(/Cost per piece/), { target: { value: "20" } });
    // A store product's sizes start at one piece each too.
    expect(screen.getByLabelText(/^56\s*2 in stock/)).toHaveValue("1");
    fireEvent.change(screen.getByLabelText(/^52\s*2 in stock/), { target: { value: "5" } });
    // The other three sizes start at one piece each: 8 pieces at 20 = 160.
    fireEvent.change(screen.getByLabelText(/Bill total/), { target: { value: "190" } });
    expect(
      screen.getByText(/BHD\s30\.000 on the bill is not in the order yet/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add it as the rest of the bill" }));
    expect(screen.getByText("The order matches the bill.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Rest of the supplier's bill")).toBeInTheDocument();
  });
});
