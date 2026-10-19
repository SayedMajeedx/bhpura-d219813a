import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Supplier orders (a tailor's order): the list says what is late and what is owed, an order is
// received in one press that adds its pieces to the stock at their cost, and a new order is
// written as a product with how many of each size.

const stubs = vi.hoisted(() => ({
  orders: [] as unknown[],
  order: null as unknown,
  receipts: [] as unknown[],
  permissions: ["manage_inventory", "view_financials"],
  receiveSupplierOrder: vi.fn(async () => ({ status: "partially_received", repeated: false })),
  invalidateAfterReceipt: vi.fn(async () => undefined),
  createSupplierOrder: vi.fn(async () => "po-new"),
  invalidateSupplierOrders: vi.fn(async () => undefined),
  navigate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const options = (key: string, read: () => unknown) => ({
  queryKey: ["test", key],
  queryFn: async () => read(),
});

const products = [
  {
    id: "p-abaya",
    name: "Black abaya",
    name_ar: "عباية سوداء",
    name_en: "Black abaya",
    image_url: null,
  },
  { id: "p-scarf", name: "Silk scarf", name_ar: null, name_en: null, image_url: null },
  {
    id: "p-henna",
    name: "Henna",
    name_ar: null,
    name_en: null,
    image_url: null,
    item_kind: "service",
  },
];
const variants = [
  {
    id: "v-s",
    product_id: "p-abaya",
    size: "S",
    stock_main: 10,
    stock_incubator: 0,
    cost_price: 15,
    created_at: "1",
  },
  {
    id: "v-m",
    product_id: "p-abaya",
    size: "M",
    stock_main: 0,
    stock_incubator: 0,
    cost_price: 0,
    created_at: "2",
  },
  {
    id: "v-scarf",
    product_id: "p-scarf",
    size: null,
    stock_main: 3,
    stock_incubator: 0,
    cost_price: 4,
    created_at: "3",
  },
].map((v) => ({
  sku: null,
  color: null,
  fabric: null,
  option_four: null,
  option_five: null,
  ...v,
}));

const mocks: Record<string, unknown> = {
  "data/supplier-orders": {
    supplierOrderQueries: {
      list: () => options("orders", () => stubs.orders),
      detail: () => options("order", () => stubs.order),
      receipts: () => options("receipts", () => stubs.receipts),
    },
    receiveSupplierOrder: stubs.receiveSupplierOrder,
    invalidateAfterReceipt: stubs.invalidateAfterReceipt,
    createSupplierOrder: stubs.createSupplierOrder,
    updateSupplierOrder: vi.fn(),
    invalidateSupplierOrders: stubs.invalidateSupplierOrders,
    setSupplierOrderStatus: vi.fn(),
    deleteSupplierOrder: vi.fn(),
    setSupplierOrderPaid: vi.fn(),
  },
  "data/catalog": {
    catalogQueries: {
      products: () => options("products", () => products),
      variants: () => options("variants", () => variants),
    },
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
  "profile-context": {
    useProfile: () => ({
      isAdmin: false,
      hasPermission: (p: string) => stubs.permissions.includes(p),
    }),
  },
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
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce((h, [k, v]) => h.replace(`$${k}`, v), to)}
      {...rest}
    >
      {children}
    </a>
  ),
  useNavigate: () => stubs.navigate,
}));
vi.mock("sonner", () => ({ toast: stubs.toast }));

const { SupplierOrdersPage } =
  await import("../src/features/supplier-orders/components/SupplierOrdersPage");
const { SupplierOrderPage } =
  await import("../src/features/supplier-orders/components/SupplierOrderPage");

const wrap = (node: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );

const line = (over: Record<string, unknown>) => ({
  product_id: "p-abaya",
  description: "",
  received_quantity: 0,
  unit_cost: 18,
  sort_order: 0,
  ...over,
});
const tailorOrder = (over: Record<string, unknown> = {}) => ({
  id: "po1",
  po_number: "PO-0001",
  status: "ordered",
  vendor_id: "tailor",
  vendor_name: "Umm Ali",
  vendor_phone: null,
  total_amount: 210,
  paid_amount: 50,
  expected_at: null,
  received_at: null,
  created_at: "2026-10-10T08:00:00Z",
  notes: null,
  items: [
    line({ id: "s", variant_id: "v-s", quantity: 4, line_total: 72 }),
    line({ id: "m", variant_id: "v-m", quantity: 6, line_total: 108, sort_order: 1 }),
    line({
      id: "fabric",
      variant_id: null,
      product_id: null,
      description: "Crepe fabric",
      quantity: 1,
      unit_cost: 30,
      line_total: 30,
      sort_order: 2,
    }),
  ],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  stubs.permissions = ["manage_inventory", "view_financials"];
  stubs.receipts = [];
});

describe("the list", () => {
  it("puts what is late first and says what is still owed", async () => {
    stubs.orders = [
      tailorOrder({
        id: "later",
        po_number: "PO-0002",
        vendor_name: "Silk house",
        expected_at: "2999-01-01",
      }),
      tailorOrder({ id: "late", po_number: "PO-0001", expected_at: "2020-01-01" }),
    ];
    wrap(<SupplierOrdersPage />);
    const late = await screen.findByText("Late");
    const cards = screen.getAllByRole("listitem");
    expect(within(cards[0]).getByText("Umm Ali")).toBeInTheDocument();
    expect(cards[0]).toContainElement(late);
    expect(screen.getByText("Owed to suppliers").nextElementSibling).toHaveTextContent("320.000");
    expect(screen.getByText("Pieces to come").nextElementSibling).toHaveTextContent("20");
  });
});

describe("receiving", () => {
  it("adds what arrived in one press, with the stock and cost it leaves", async () => {
    stubs.order = tailorOrder();
    wrap(<SupplierOrderPage orderId="po1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Receive pieces/ }));
    const dialog = await screen.findByRole("dialog");
    // All that is to come, at 18 plus a share of the fabric (30 over 180 of pieces): 21.
    const small = within(dialog).getByLabelText(/S · 4 of 4 to come/);
    expect(small).toHaveValue("4");
    fireEvent.change(within(dialog).getByLabelText(/M · 6 of 6 to come/), {
      target: { value: "2" },
    });
    // S: (10 x 15 + 4 x 21) / 14 = 16.714
    expect(within(dialog).getByText(/16\.714/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add 6 pieces to stock" }));
    await waitFor(() => expect(stubs.receiveSupplierOrder).toHaveBeenCalledTimes(1));
    const [orderId, lines, requestId] = stubs.receiveSupplierOrder.mock.calls[0] as unknown as [
      string,
      unknown,
      string,
    ];
    expect(orderId).toBe("po1");
    expect(lines).toEqual([
      { item_id: "s", quantity: 4 },
      { item_id: "m", quantity: 2 },
    ]);
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(stubs.invalidateAfterReceipt).toHaveBeenCalledWith(expect.anything(), "b1");
  });

  it("is not offered to staff who do not manage the stock", async () => {
    stubs.permissions = ["view_financials"];
    stubs.order = tailorOrder();
    wrap(<SupplierOrderPage orderId="po1" />);
    expect(await screen.findByRole("button", { name: /Record payment/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Receive/ })).toBeNull();
  });
});

describe("a new order", () => {
  it("is a product with how many of each size, and offers no service", async () => {
    wrap(<SupplierOrderPage orderId="new" />);
    await screen.findByRole("option", { name: "Umm Ali" });
    fireEvent.change(screen.getByLabelText("Supplier or tailor"), {
      target: { value: "tailor" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add product/ }));
    const picker = await screen.findByRole("dialog");
    expect(within(picker).queryByText("Henna")).toBeNull();
    fireEvent.click(within(picker).getByText("Black abaya"));

    // The cost it was last bought at is the start.
    expect(await screen.findByLabelText(/Cost per piece/)).toHaveValue("15");
    fireEvent.change(screen.getByLabelText(/Cost per piece/), { target: { value: "18" } });
    fireEvent.change(screen.getByLabelText(/^S\s*10 in stock/), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/^M\s*0 in stock/), { target: { value: "6" } });
    expect(screen.getByText("10 pieces · Total").nextElementSibling).toHaveTextContent("180.000");

    fireEvent.click(screen.getByRole("button", { name: "Save order" }));
    await waitFor(() => expect(stubs.createSupplierOrder).toHaveBeenCalledTimes(1));
    const [brandId, plan, how] = stubs.createSupplierOrder.mock.calls[0] as unknown as [
      string,
      { order: unknown; insert: unknown[] },
      unknown,
    ];
    expect(brandId).toBe("b1");
    expect(plan.order).toEqual({ vendor_id: "tailor", expected_at: null, notes: null });
    expect(plan.insert).toEqual([
      {
        variant_id: "v-s",
        description: "Black abaya · S",
        quantity: 4,
        unit_cost: 18,
        sort_order: 0,
      },
      {
        variant_id: "v-m",
        description: "Black abaya · M",
        quantity: 6,
        unit_cost: 18,
        sort_order: 1,
      },
    ]);
    expect(how).toEqual({ place: true, paidNow: 0 });
    expect(stubs.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ params: { slug: "pura", id: "po-new" }, replace: true }),
    );
  });

  it("will not save without a supplier or a piece", async () => {
    wrap(<SupplierOrderPage orderId="new" />);
    fireEvent.click(await screen.findByRole("button", { name: "Save order" }));
    expect(await screen.findByText("Choose who the order is from.")).toBeInTheDocument();
    expect(stubs.createSupplierOrder).not.toHaveBeenCalled();
  });
});
