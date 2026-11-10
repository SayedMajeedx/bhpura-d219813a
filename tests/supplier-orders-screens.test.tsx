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
  payments: [] as unknown[],
  recordSupplierPayment: vi.fn(async () => "pay-1"),
  voidSupplierPayment: vi.fn(async () => undefined),
  accountPayments: [] as unknown[],
  recordSupplierAccountPayment: vi.fn(async () => "pay-9"),
  recordSupplierAdjustment: vi.fn(async () => "adj-1"),
  voidSupplierAccountPayment: vi.fn(async () => undefined),
  downloadWorkbook: vi.fn(async () => undefined),
  permissions: ["manage_inventory", "view_financials"],
  receiveSupplierOrder: vi.fn(async () => ({ status: "partially_received", repeated: false })),
  invalidateAfterReceipt: vi.fn(async () => undefined),
  undoSupplierReceipts: vi.fn(async () => ({
    status: "ordered",
    repeated: false,
    pieces: 4,
    taken_out: 4,
    costs_kept: 0,
  })),
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

const profile = () => ({
  isAdmin: false,
  hasPermission: (p: string) => stubs.permissions.includes(p),
});
const mocks: Record<string, unknown> = {
  "data/supplier-orders": {
    supplierOrderQueries: {
      orderPieces: () => options("pieces", () => []),
      pieceDetails: () => options("piece-details", () => []),
      list: () => options("orders", () => stubs.orders),
      detail: () => options("order", () => stubs.order),
      receipts: () => options("receipts", () => stubs.receipts),
      payments: () => options("payments", () => stubs.payments),
    },
    recordSupplierPayment: stubs.recordSupplierPayment,
    voidSupplierPayment: stubs.voidSupplierPayment,
    receiveSupplierOrder: stubs.receiveSupplierOrder,
    invalidateAfterReceipt: stubs.invalidateAfterReceipt,
    undoSupplierReceipts: stubs.undoSupplierReceipts,
    createSupplierOrder: stubs.createSupplierOrder,
    updateSupplierOrder: vi.fn(),
    invalidateSupplierOrders: stubs.invalidateSupplierOrders,
    setSupplierOrderStatus: vi.fn(),
    deleteSupplierOrder: vi.fn(),
  },
  "data/supplier-account": {
    supplierAccountQueries: {
      payments: () => options("account-payments", () => stubs.accountPayments),
    },
    recordSupplierAccountPayment: stubs.recordSupplierAccountPayment,
    recordSupplierAdjustment: stubs.recordSupplierAdjustment,
    voidSupplierAccountPayment: stubs.voidSupplierAccountPayment,
  },
  "data/catalog": {
    catalogQueries: {
      products: () => options("products", () => products),
      productsWithArchived: () => options("products", () => products),
      variants: () => options("variants", () => variants),
      variantsWithArchived: () => options("variants", () => variants),
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
  // A store that does not make to order: no pieces-to-make tab, so no orders are read.
  "store-profile": { useAdminStoreProfile: () => ({ profile: { addons: [], modules: {} } }) },
  "data/orders": {
    ordersQueries: {
      list: () => ({ queryKey: ["orders"], queryFn: async () => [] }),
      variantSales: () => ({ queryKey: ["variant-sales"], queryFn: async () => [] }),
    },
  },
  "profile-context": {
    useProfile: () => profile(),
    useProfileOptional: () => profile(),
  },
};
vi.mock("../src/lib/data/supplier-orders", () => mocks["data/supplier-orders"]);
vi.mock("@/lib/data/supplier-orders", () => mocks["data/supplier-orders"]);
vi.mock("../src/lib/data/supplier-orders/account", () => mocks["data/supplier-account"]);
vi.mock("@/lib/data/supplier-orders/account", () => mocks["data/supplier-account"]);
vi.mock("../src/lib/data/catalog", () => mocks["data/catalog"]);
vi.mock("@/lib/data/catalog", () => mocks["data/catalog"]);
vi.mock("../src/lib/data/accounting", () => mocks["data/accounting"]);
vi.mock("@/lib/data/accounting", () => mocks["data/accounting"]);
vi.mock("../src/lib/data/business-settings", () => mocks["data/business-settings"]);
vi.mock("@/lib/data/business-settings", () => mocks["data/business-settings"]);
vi.mock("../src/hooks/use-store-profile", () => mocks["store-profile"]);
vi.mock("@/hooks/use-store-profile", () => mocks["store-profile"]);
vi.mock("../src/lib/data/orders", () => mocks["data/orders"]);
vi.mock("@/lib/data/orders", () => mocks["data/orders"]);
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
vi.mock("../src/features/finance-reports/lib/workbook", async (original) => ({
  ...(await original<object>()),
  downloadWorkbook: stubs.downloadWorkbook,
}));
vi.mock("@/features/finance-reports/lib/workbook", async (original) => ({
  ...(await original<object>()),
  downloadWorkbook: stubs.downloadWorkbook,
}));

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
  stubs.payments = [];
  stubs.accountPayments = [];
  stubs.orders = [];
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
    fireEvent.change(screen.getByLabelText("Supplier"), {
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
    expect(how).toEqual({ place: true });
    expect(stubs.recordSupplierPayment).not.toHaveBeenCalled();
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

const { SupplierOrdersDashboardLine } =
  await import("../src/features/supplier-orders/components/SupplierOrdersDashboardLine");

describe("paying a supplier", () => {
  it("records one payment with its day, method and reference, this order first, the rest as credit", async () => {
    stubs.order = tailorOrder();
    wrap(<SupplierOrderPage orderId="po1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Record payment/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/You owe this supplier BHD\s160\.000/)).toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: "Record payment" });
    fireEvent.change(within(dialog).getByLabelText(/Amount paid/), { target: { value: "170" } });
    // How it was paid is asked every time.
    expect(save).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("radio", { name: "BenefitPay" }));
    fireEvent.change(within(dialog).getByLabelText(/Reference/), { target: { value: "BP-77" } });
    // This order takes what it owes; the rest waits for the supplier's next order.
    expect(
      within(dialog).getByText(/BHD\s10\.000 stays as your credit with the supplier/),
    ).toBeInTheDocument();
    fireEvent.click(save);
    await waitFor(() => expect(stubs.recordSupplierAccountPayment).toHaveBeenCalledTimes(1));
    const [payment] = stubs.recordSupplierAccountPayment.mock.calls[0] as unknown as [
      {
        vendorId: string;
        amount: number;
        paidOn: string;
        method: string;
        reference: string;
        allocations: { poId: string; amount: number }[];
        requestId: string;
      },
    ];
    expect(payment).toMatchObject({
      vendorId: "tailor",
      amount: 170,
      method: "benefit",
      reference: "BP-77",
      allocations: [{ poId: "po1", amount: 160 }],
    });
    expect(payment.paidOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payment.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("records a discount from the supplier with its reason and no method, warning of pieces with no price", async () => {
    stubs.order = tailorOrder({
      items: [
        ...tailorOrder().items,
        line({ id: "piece", variant_id: null, quantity: 1, line_total: 0, price_pending: true }),
      ],
    });
    wrap(<SupplierOrderPage orderId="po1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Record payment/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Waiting for a price: 1 piece/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Discount from the supplier" }));
    expect(within(dialog).queryByRole("radio", { name: "BenefitPay" })).toBeNull();
    expect(within(dialog).queryByLabelText(/Reference/)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^Amount/), { target: { value: "15" } });
    const save = within(dialog).getByRole("button", { name: "Record adjustment" });
    // An adjustment says why.
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Late delivery" },
    });
    fireEvent.click(save);
    await waitFor(() => expect(stubs.recordSupplierAdjustment).toHaveBeenCalledTimes(1));
    expect(stubs.recordSupplierAccountPayment).not.toHaveBeenCalled();
    expect(stubs.recordSupplierAdjustment.mock.calls[0]).toMatchObject([
      {
        vendorId: "tailor",
        amount: 15,
        kind: "discount",
        reason: "Late delivery",
        allocations: [{ poId: "po1", amount: 15 }],
      },
    ]);
  });

  it("takes a whole payment back only with a reason, saying the other orders it paid", async () => {
    stubs.order = tailorOrder();
    stubs.accountPayments = [
      {
        id: "pay-1",
        vendor_id: "tailor",
        amount: 114,
        paid_on: "2026-11-09",
        method: "benefit",
        reference: null,
        note: "One transfer",
        created_at: "2026-11-09T10:00:00Z",
        voided_at: null,
        void_reason: null,
        applied: [
          { po_id: "po1", po_number: "PO-0001", amount: 50, voided: false },
          { po_id: "po2", po_number: "PO-0002", amount: 64, voided: false },
        ],
      },
      {
        id: "pay-0",
        vendor_id: "tailor",
        amount: 20,
        paid_on: "2026-10-11",
        method: null,
        reference: null,
        note: null,
        created_at: "2026-10-11T10:00:00Z",
        voided_at: "2026-10-11T10:00:00Z",
        void_reason: "Wrong order",
        applied: [{ po_id: "po1", po_number: "PO-0001", amount: 20, voided: true }],
      },
    ];
    wrap(<SupplierOrderPage orderId="po1" />);
    expect(await screen.findByText(/Taken back: Wrong order/)).toBeInTheDocument();
    expect(
      screen.getByText(/Of a payment of BHD\s114\.000, which also paid PO-0002/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Take back the payment of BHD\s114\.000/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/also paid PO-0002/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Take it back" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "Recorded twice" },
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(stubs.voidSupplierAccountPayment).toHaveBeenCalledWith("pay-1", "Recorded twice"),
    );
  });
});

describe("a late order and what is owed", () => {
  it("offers the supplier a message asking when it comes", async () => {
    stubs.order = tailorOrder({ expected_at: "2020-01-01", vendor_phone: "39950016" });
    wrap(<SupplierOrderPage orderId="po1" />);
    const ask = await screen.findByRole("link", { name: /Ask the supplier when it comes/ });
    const href = ask.getAttribute("href") ?? "";
    expect(href.startsWith("https://wa.me/97339950016?text=")).toBe(true);
    expect(decodeURIComponent(href.split("text=")[1])).toContain("PO-0001 (10 pieces to come)");
  });

  it("pays a supplier from the list, and shows each payment with its day and method", async () => {
    stubs.orders = [tailorOrder()];
    stubs.accountPayments = [
      {
        id: "pay-1",
        vendor_id: "tailor",
        amount: 60,
        paid_on: "2026-11-09",
        method: "cash",
        reference: null,
        note: null,
        created_at: "2026-11-09T10:00:00Z",
        voided_at: null,
        void_reason: null,
        applied: [{ po_id: "po1", po_number: "PO-0001", amount: 50, voided: false }],
      },
    ];
    wrap(<SupplierOrdersPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /Suppliers/ }));
    expect(await screen.findByText(/Credit BHD\s10\.000/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Payments \(1\)/ }));
    expect(screen.getByText(/Cash/)).toBeInTheDocument();
    expect(screen.getByText(/Paid PO-0001 · Credit BHD\s10\.000/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Record payment/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Payment to Umm Ali/)).toBeInTheDocument();
  });

  it("opens a supplier's statement, for one owed or settled, as Excel and as a printed page", async () => {
    stubs.orders = [
      tailorOrder({ vendor_phone: "39950016" }),
      tailorOrder({
        id: "po2",
        po_number: "PO-0002",
        vendor_id: "silk",
        vendor_name: "Silk house",
        paid_amount: 210,
        status: "received",
      }),
    ];
    stubs.accountPayments = [
      {
        id: "pay-1",
        vendor_id: "tailor",
        amount: 50,
        paid_on: "2026-10-12",
        method: "cash",
        reference: null,
        note: null,
        created_at: "2026-10-12T10:00:00Z",
        voided_at: null,
        void_reason: null,
        applied: [{ po_id: "po1", po_number: "PO-0001", amount: 50, voided: false }],
      },
    ];
    const printed = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() } };
    vi.stubGlobal(
      "open",
      vi.fn(() => printed),
    );
    wrap(<SupplierOrdersPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /Suppliers/ }));
    // A supplier with nothing open keeps a way to their statement.
    expect(screen.getByRole("button", { name: "Silk house" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Statement" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "All time" }));
    expect(within(dialog).getByText("Order PO-0001")).toBeInTheDocument();
    expect(within(dialog).getByText(/Cash · Paid PO-0001/)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/You owe BHD\s160\.000/).length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: /Excel/ }));
    await waitFor(() => expect(stubs.downloadWorkbook).toHaveBeenCalledTimes(1));
    const [sheets, file] = stubs.downloadWorkbook.mock.calls[0] as unknown as [
      Array<{ name: string }>,
      string,
    ];
    expect(sheets[0].name).toBe("Supplier statement");
    expect(file).toBe("pura-supplier-statement-umm-ali-all-time.xlsx");
    fireEvent.click(within(dialog).getByRole("button", { name: /Print or PDF/ }));
    expect(printed.document.write).toHaveBeenCalledWith(expect.stringContaining("Umm Ali"));
    expect(
      within(dialog).getByRole("link", { name: /Send the summary on WhatsApp/ }),
    ).toHaveAttribute("href", expect.stringContaining("https://wa.me/97339950016?text="));
    vi.unstubAllGlobals();
  });

  it("lists every payment to the suppliers, filters them and downloads them as Excel", async () => {
    stubs.orders = [tailorOrder()];
    stubs.accountPayments = [
      {
        id: "pay-1",
        vendor_id: "tailor",
        amount: 50,
        paid_on: "2026-10-12",
        method: "cash",
        reference: "R-1",
        note: null,
        created_at: "2026-10-12T10:00:00Z",
        voided_at: null,
        void_reason: null,
        applied: [{ po_id: "po1", po_number: "PO-0001", amount: 50, voided: false }],
      },
      {
        id: "pay-2",
        vendor_id: "tailor",
        amount: 20,
        paid_on: "2026-10-13",
        method: "bank",
        reference: null,
        note: null,
        created_at: "2026-10-13T10:00:00Z",
        voided_at: "2026-10-13T11:00:00Z",
        void_reason: "Twice",
        applied: [],
      },
    ];
    wrap(<SupplierOrdersPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /Payments/ }));
    fireEvent.click(screen.getByRole("radio", { name: "All time" }));
    expect(screen.getByText(/Cash · Paid PO-0001 · R-1/)).toBeInTheDocument();
    expect(screen.getByText("Payments: 1")).toBeInTheDocument();
    // A payment taken back shows only when asked, and counts in no total.
    expect(screen.queryByText(/Taken back: Twice/)).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Show payments taken back" }));
    expect(screen.getByText(/Taken back: Twice/)).toBeInTheDocument();
    expect(screen.getByText("Payments: 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Bank transfer" }));
    expect(screen.getByText("Payments: 0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "All methods" }));
    fireEvent.click(screen.getByRole("button", { name: /Excel/ }));
    await waitFor(() => expect(stubs.downloadWorkbook).toHaveBeenCalledTimes(1));
    const [, file] = stubs.downloadWorkbook.mock.calls[0] as unknown as [unknown, string];
    expect(file).toBe("pura-supplier-payments-all-time.xlsx");
  });

  it("lists each supplier with what is owed", async () => {
    stubs.orders = [
      tailorOrder({ vendor_phone: "39950016" }),
      tailorOrder({
        id: "po2",
        vendor_id: "silk",
        vendor_name: "Silk house",
        paid_amount: 210,
        status: "received",
      }),
    ];
    wrap(<SupplierOrdersPage />);
    fireEvent.click(await screen.findByRole("tab", { name: /Suppliers/ }));
    expect(screen.getByText("Umm Ali")).toBeInTheDocument();
    expect(screen.getByText("1 order awaiting delivery")).toBeInTheDocument();
    // A settled supplier is not listed as owed: only a way to their statement remains.
    expect(screen.getAllByText("Silk house")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Silk house" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat with Umm Ali on WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/97339950016",
    );
  });

  it("puts one line on the dashboard, and none when nothing is late or owed", async () => {
    stubs.orders = [tailorOrder({ expected_at: "2020-01-01" })];
    const { unmount } = wrap(
      <SupplierOrdersDashboardLine brandId="b1" slug="pura" currency="BHD" lang="en" />,
    );
    expect(
      await screen.findByText("1 supplier order is late · you owe suppliers BHD 160.000"),
    ).toBeInTheDocument();
    unmount();
    stubs.orders = [tailorOrder({ paid_amount: 210 })];
    const { container } = wrap(
      <SupplierOrdersDashboardLine brandId="b1" slug="pura" currency="BHD" lang="en" />,
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe("deleting an order", () => {
  const supplierData = mocks["data/supplier-orders"] as {
    deleteSupplierOrder: ReturnType<typeof vi.fn>;
    setSupplierOrderStatus: ReturnType<typeof vi.fn>;
  };
  const openDelete = async () => {
    const menu = await screen.findByRole("button", { name: "Order options" });
    fireEvent.keyDown(menu, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    return screen.findByRole("alertdialog");
  };

  it("with a payment says why it is kept, and offers to cancel it instead", async () => {
    stubs.order = tailorOrder({ paid_amount: 12 });
    wrap(<SupplierOrderPage orderId="po1" />);
    const dialog = await openDelete();
    expect(within(dialog).getByText("An order with payments is not deleted")).toBeInTheDocument();
    expect(within(dialog).getByText(/You paid BHD\s12\.000 on this order/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel the order instead" }));
    await waitFor(() =>
      expect(supplierData.setSupplierOrderStatus).toHaveBeenCalledWith("b1", "po1", "cancelled"),
    );
    expect(supplierData.deleteSupplierOrder).not.toHaveBeenCalled();
  });

  it("with no payment deletes it", async () => {
    stubs.order = tailorOrder({ paid_amount: 0 });
    wrap(<SupplierOrderPage orderId="po1" />);
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(supplierData.deleteSupplierOrder).toHaveBeenCalledWith("b1", "po1"));
  });
});

describe("undoing a receipt", () => {
  const receipt = (over: Record<string, unknown>) => ({
    item_id: "s",
    variant_id: "v-s",
    request_id: "r1",
    quantity: 4,
    unit_cost: 18,
    cost_before: 15,
    cost_after: 16.714,
    note: null,
    received_at: "2026-10-12T08:00:00Z",
    undone_at: null,
    undo_taken_out: null,
    ...over,
  });
  const received = () =>
    tailorOrder({
      status: "partially_received",
      paid_amount: 0,
      items: tailorOrder().items.map((l) =>
        l.id === "fabric" ? l : { ...l, received_quantity: 4 },
      ),
    });

  it("is offered when cancel or delete is asked, and takes the pieces out", async () => {
    stubs.order = received();
    stubs.receipts = [
      receipt({ id: "rc1" }),
      receipt({ id: "rc0", undone_at: "2026-10-11T08:00:00Z", quantity: 1 }),
    ];
    wrap(<SupplierOrderPage orderId="po1" />);
    // An undone receipt stays on record, with no button.
    expect(await screen.findByText(/Undone/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Undo receiving Black abaya/ })).toHaveLength(1);
    const menu = screen.getByRole("button", { name: "Order options" });
    fireEvent.keyDown(menu, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    const why = await screen.findByRole("alertdialog");
    expect(within(why).getByText(/Undo the receiving first/)).toBeInTheDocument();
    fireEvent.click(within(why).getByRole("button", { name: "Undo receiving" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Leaving the stock: 4 pieces/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Undo receiving" }));
    await waitFor(() => expect(stubs.undoSupplierReceipts).toHaveBeenCalledTimes(1));
    expect(stubs.undoSupplierReceipts.mock.calls[0]).toEqual([
      "po1",
      ["rc1"],
      "take_out",
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    ]);
    expect(stubs.toast.success).toHaveBeenCalledWith(
      "Receiving of 4 pieces undone. They left the stock.",
    );
  });

  it("asks what to do when the pieces already left the store", async () => {
    stubs.order = received();
    // Size M holds none: its two pieces were sold or counted out.
    stubs.receipts = [receipt({ id: "rm", item_id: "m", variant_id: "v-m", quantity: 2 })];
    wrap(<SupplierOrderPage orderId="po1" />);
    fireEvent.click(await screen.findByRole("button", { name: /^Undo receiving Black abaya/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/the store still holds 0 pieces of them/)).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /Take out what is left/ })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Leave the stock as it is/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Undo receiving" }));
    await waitFor(() =>
      expect(stubs.undoSupplierReceipts).toHaveBeenCalledWith(
        "po1",
        ["rm"],
        "leave",
        expect.any(String),
      ),
    );
  });
});
