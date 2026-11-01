import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The pieces to make, sent several at once to one supplier, and the message the supplier gets:
// every piece with what makes it, and no customer's name.

const stubs = vi.hoisted(() => ({
  sendOrderToSupplier: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const options = (key: string, read: () => unknown) => ({
  queryKey: [key],
  queryFn: async () => read(),
});
const customLine = (id: string, description: string) => ({
  id,
  product_id: "p-abaya",
  variant_id: "v-52",
  description,
  quantity: 1,
  location: "custom",
  unit_cost: 0,
});
const paidOrder = (id: string, invoice: number, created: string, lines: unknown[]) => ({
  id,
  invoice_number: invoice,
  created_at: created,
  status: "confirmed",
  payment_status: "paid",
  payment_method: "card",
  fulfillment_status: "NEEDS_PACKING",
  fulfillment_method: "delivery",
  total: 40,
  advance_paid: 40,
  customer_name_snapshot: `Customer ${invoice}`,
  order_items: lines,
});
const mocks: Record<string, unknown> = {
  "data/orders": {
    ordersQueries: {
      list: () =>
        options("orders", () => [
          paidOrder("o-2", 1002, "2026-10-19T10:00:00Z", [customLine("l-2", "Abaya for 1002")]),
          paidOrder("o-1", 1001, "2026-10-17T10:00:00Z", [customLine("l-1", "Abaya for 1001")]),
        ]),
    },
  },
  "data/supplier-orders": {
    supplierOrderQueries: {
      orderPieces: () => options("pieces", () => []),
      list: () => options("supplier-orders", () => []),
      lastPrices: () => options("prices", () => new Map([["p-abaya", 18]])),
      pieceDetails: () =>
        options("details", () => [
          {
            id: "oi-9",
            product_id: "p-abaya",
            variant_id: "v-54",
            description: "Black abaya",
            quantity: 1,
            location: "custom",
            selected_variant: { size: "54" },
            custom_field_values: [
              { key: "length", label_en: "Length", label_ar: "الطول", value: "58" },
              {
                key: "tailoring_notes",
                label_en: "Notes",
                label_ar: "ملاحظات",
                value: "Wide sleeves",
              },
            ],
            customizations: [{ name: "Silk lining" }],
          },
        ]),
    },
    sendOrderToSupplier: stubs.sendOrderToSupplier,
    invalidateSupplierOrders: vi.fn(async () => undefined),
  },
  "data/catalog": {
    catalogKeys: { products: () => ["products"], variants: () => ["variants"] },
    catalogQueries: {
      products: () => options("products", () => [{ id: "p-abaya", name: "Black abaya" }]),
      variants: () => options("variants", () => []),
      variantsWithArchived: () => options("variants", () => []),
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
  "store-profile": {
    useAdminStoreProfile: () => ({ profile: { addons: [], vertical: "abayas", modules: {} } }),
  },
  vocabulary: { useVocabulary: () => ({ vocabulary: {}, t: () => "" }) },
};
vi.mock("../src/lib/data/orders", () => mocks["data/orders"]);
vi.mock("@/lib/data/orders", () => mocks["data/orders"]);
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
vi.mock("../src/hooks/use-store-profile", () => mocks["store-profile"]);
vi.mock("@/hooks/use-store-profile", () => mocks["store-profile"]);
vi.mock("../src/hooks/use-vocabulary", () => mocks.vocabulary);
vi.mock("@/hooks/use-vocabulary", () => mocks.vocabulary);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));
vi.mock("sonner", () => ({ toast: stubs.toast }));

const { PiecesToMakeTab } =
  await import("../src/features/supplier-orders/components/PiecesToMakeTab");
const { SupplierMessageDialog } =
  await import("../src/features/supplier-orders/components/SupplierMessageDialog");

const wrap = (node: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  stubs.sendOrderToSupplier.mockResolvedValue("po-new");
});

describe("the pieces to make", () => {
  it("lists the waiting orders, longest first, and sends several to one supplier order", async () => {
    wrap(<PiecesToMakeTab currency="BHD" lang="en" />);
    const items = await screen.findAllByRole("checkbox", { name: /Every piece of/ });
    expect(screen.getAllByText(/Order #100\d/).map((el) => el.textContent)).toEqual([
      "Order #1001",
      "Order #1002",
    ]);
    items.forEach((box) => fireEvent.click(box));
    expect(screen.getByText("2 pieces picked")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Send to/ }));

    const dialog = await screen.findByRole("dialog");
    // Each order's pieces under its number; no "mark as sent" from the list.
    expect(within(dialog).getByText("Customer piece · order #1001")).toBeInTheDocument();
    expect(within(dialog).queryByText("Mark as sent, with no supplier")).toBeNull();
    await within(dialog).findByRole("option", { name: "Umm Ali" });
    fireEvent.change(within(dialog).getByLabelText("Supplier"), { target: { value: "tailor" } });
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Cost of Abaya for 1001")).toHaveValue("18"),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /^Send/ }));
    await waitFor(() => expect(stubs.sendOrderToSupplier).toHaveBeenCalledTimes(2));
    // The first makes the supplier order; the second joins it.
    expect(stubs.sendOrderToSupplier.mock.calls).toEqual([
      [
        "o-1",
        {
          vendorId: "tailor",
          poId: null,
          expectedAt: null,
          lines: [{ order_item_id: "l-1", unit_cost: 18 }],
        },
      ],
      [
        "o-2",
        {
          vendorId: "tailor",
          poId: "po-new",
          expectedAt: null,
          lines: [{ order_item_id: "l-2", unit_cost: 18 }],
        },
      ],
    ]);
    expect(stubs.toast.success).toHaveBeenCalled();
  });
});

describe("the message to the supplier", () => {
  it("writes each piece with its measurements and notes, and opens WhatsApp with it", async () => {
    const order = {
      id: "po",
      po_number: "PO-0004",
      status: "ordered" as const,
      vendor_id: "tailor",
      vendor_name: "Umm Ali",
      vendor_phone: "39950016",
      total_amount: 22,
      paid_amount: 0,
      expected_at: "2026-10-28",
      received_at: null,
      created_at: "2026-10-20",
      notes: null,
      items: [
        {
          id: "cust",
          variant_id: "v-54",
          product_id: "p-abaya",
          order_item_id: "oi-9",
          description: "Black abaya",
          quantity: 1,
          received_quantity: 0,
          unit_cost: 22,
          line_total: 22,
          sort_order: 0,
        },
      ],
    };
    const catalog = {
      products: [{ id: "p-abaya", name: "Black abaya" }],
      productName: () => "Black abaya",
      sizeName: () => "54",
    } as never;
    wrap(
      <SupplierMessageDialog
        open
        onOpenChange={vi.fn()}
        brandId="b1"
        order={order}
        catalog={catalog}
        storeName="Pura Line"
        currency="BHD"
        lang="en"
      />,
    );
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toHaveTextContent("Length: 58"));
    expect(dialog).toHaveTextContent("Notes: Wide sleeves");
    expect(dialog).toHaveTextContent("Extras: Silk lining");
    expect(dialog).toHaveTextContent(/Agreed price: BHD\s22\.000/);
    const link = within(dialog).getByRole("link", { name: /Open WhatsApp/ });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/97339950016\?text=/);
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain(
      "PO-0004, due 28/10/2026",
    );

    fireEvent.click(within(dialog).getByLabelText("Write the agreed prices"));
    expect(dialog).not.toHaveTextContent("Agreed price");
  });
});
