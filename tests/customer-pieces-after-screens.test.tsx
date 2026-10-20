import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupplierOrderLine } from "../src/features/supplier-orders/lib/order-state";

// A customer's piece after it went to a supplier, on screen: the store decides on a cancelled
// customer's piece, and a piece that came back goes to a supplier again for a fix or an
// alteration, from the customer's order.

const stubs = vi.hoisted(() => ({
  sendOrderToSupplier: vi.fn(),
  releaseCustomerPiece: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  permissions: ["manage_orders", "view_financials"] as string[],
}));

const options = (key: string, read: () => unknown) => ({
  queryKey: [key],
  queryFn: async () => read(),
});
const mocks: Record<string, unknown> = {
  "data/supplier-orders": {
    supplierOrderQueries: {
      list: () => options("supplier-orders", () => []),
      orderPieces: () =>
        options("pieces", () => [
          {
            id: "pol-1",
            order_item_id: "oi-1",
            quantity: 1,
            received_quantity: 1,
            unit_cost: 18,
            purpose: "make",
            work_note: null,
            po_id: "po-1",
            po_number: "PO-0001",
            po_status: "received",
            expected_at: null,
            vendor_id: "maker",
            vendor_name: "Umm Ali",
          },
        ]),
    },
    sendOrderToSupplier: stubs.sendOrderToSupplier,
    releaseCustomerPiece: stubs.releaseCustomerPiece,
    invalidateSupplierOrders: vi.fn(async () => undefined),
    invalidateAfterReceipt: vi.fn(async () => undefined),
  },
  "data/orders": { invalidateOrders: vi.fn(async () => undefined) },
  "data/accounting": {
    accountingQueries: {
      vendorOptions: () =>
        options("vendors", () => [
          { id: "maker", name: "Umm Ali" },
          { id: "fixer", name: "Atelier Noor" },
        ]),
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
  "profile-context": {
    useProfileOptional: () => ({
      isAdmin: false,
      canViewFinancials: true,
      hasPermission: (p: string) => stubs.permissions.includes(p),
    }),
  },
};
vi.mock("../src/lib/data/supplier-orders", () => mocks["data/supplier-orders"]);
vi.mock("@/lib/data/supplier-orders", () => mocks["data/supplier-orders"]);
vi.mock("../src/lib/data/orders", () => mocks["data/orders"]);
vi.mock("@/lib/data/orders", () => mocks["data/orders"]);
vi.mock("../src/lib/data/accounting", () => mocks["data/accounting"]);
vi.mock("@/lib/data/accounting", () => mocks["data/accounting"]);
vi.mock("../src/lib/data/business-settings", () => mocks["data/business-settings"]);
vi.mock("@/lib/data/business-settings", () => mocks["data/business-settings"]);
vi.mock("../src/lib/brand-context", () => mocks["brand-context"]);
vi.mock("@/lib/brand-context", () => mocks["brand-context"]);
vi.mock("../src/lib/profile-context", () => mocks["profile-context"]);
vi.mock("@/lib/profile-context", () => mocks["profile-context"]);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: stubs.toast }));

const { CancelledPieceDialog } =
  await import("../src/features/supplier-orders/components/CancelledPieceDialog");
const { OrderTailorPieces } =
  await import("../src/features/supplier-orders/components/OrderTailorPieces");

const wrap = (node: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );

const piece = (over: Partial<SupplierOrderLine> = {}): SupplierOrderLine => ({
  id: "pol-1",
  variant_id: "v-52",
  product_id: "p-abaya",
  order_item_id: "oi-1",
  description: "Black abaya · custom",
  quantity: 1,
  received_quantity: 0,
  unit_cost: 18,
  line_total: 18,
  sort_order: 0,
  purpose: "make",
  customer_order: { id: "o-1", invoice_number: 1001, cancelled: true },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  stubs.permissions = ["manage_orders", "view_financials"];
  stubs.sendOrderToSupplier.mockResolvedValue("po-new");
  stubs.releaseCustomerPiece.mockResolvedValue(undefined);
});

describe("a cancelled customer's piece", () => {
  it("is stopped with the supplier on the store's choice", async () => {
    wrap(
      <CancelledPieceDialog
        open
        onOpenChange={vi.fn()}
        brandId="b1"
        line={piece()}
        sizeName="52"
        canStock={false}
        lang="en"
      />,
    );
    const dialog = await screen.findByRole("dialog");
    // Keeping it for sale needs the stock permission: offered, but not open to this person.
    expect(within(dialog).getByRole("radio", { name: /Keep it for sale/ })).toBeDisabled();
    expect(within(dialog).getByText("Needs the permission to manage stock.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(stubs.releaseCustomerPiece).toHaveBeenCalledWith("pol-1", "stop"));
  });

  it("that has arrived can only be kept for sale, into the stock now", async () => {
    wrap(
      <CancelledPieceDialog
        open
        onOpenChange={vi.fn()}
        brandId="b1"
        line={piece({ received_quantity: 1 })}
        sizeName="52"
        canStock
        lang="en"
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("radio", { name: /Stop it/ })).toBeNull();
    expect(dialog).toHaveTextContent("It joins the stock now in size 52, at what it cost.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(stubs.releaseCustomerPiece).toHaveBeenCalledWith("pol-1", "stock"));
  });
});

describe("a piece that came back", () => {
  const lines = [{ id: "oi-1", description: "Black abaya · custom", quantity: 1 }];

  it("goes back to the supplier who made it, to be fixed for free", async () => {
    wrap(
      <OrderTailorPieces
        brandId="b1"
        slug="pura"
        orderId="o-1"
        lines={lines}
        cancelled={false}
        currency="BHD"
        lang="en"
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Send Black abaya · custom back to the supplier" }),
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("option", { name: "Umm Ali" });
    expect(within(dialog).getByLabelText("Supplier")).toHaveValue("maker");
    // A fix has no charge to type.
    expect(within(dialog).queryByLabelText(/charge a piece/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    expect(
      await within(dialog).findByText("Write what the supplier needs to do."),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("What to fix"), {
      target: { value: "The hem is uneven" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(stubs.sendOrderToSupplier).toHaveBeenCalledWith("o-1", {
        vendorId: "maker",
        poId: null,
        expectedAt: null,
        lines: [{ order_item_id: "oi-1", unit_cost: 0, purpose: "fix", note: "The hem is uneven" }],
      }),
    );
  });

  it("goes for an alteration at the supplier's charge, to another supplier if chosen", async () => {
    wrap(
      <OrderTailorPieces
        brandId="b1"
        slug="pura"
        orderId="o-1"
        lines={lines}
        cancelled={false}
        currency="BHD"
        lang="en"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /back to the supplier/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /An alteration/ }));
    await within(dialog).findByRole("option", { name: "Atelier Noor" });
    fireEvent.change(within(dialog).getByLabelText("Supplier"), { target: { value: "fixer" } });
    fireEvent.change(within(dialog).getByLabelText("What to change"), {
      target: { value: "Shorten by 2 cm" },
    });
    fireEvent.change(within(dialog).getByLabelText(/charge a piece/), { target: { value: "3.5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(stubs.sendOrderToSupplier).toHaveBeenCalledWith(
        "o-1",
        expect.objectContaining({
          vendorId: "fixer",
          lines: [
            {
              order_item_id: "oi-1",
              unit_cost: 3.5,
              purpose: "alteration",
              note: "Shorten by 2 cm",
            },
          ],
        }),
      ),
    );
  });

  it("of a cancelled order is decided on the supplier order, not sent again", async () => {
    wrap(
      <OrderTailorPieces
        brandId="b1"
        slug="pura"
        orderId="o-1"
        lines={lines}
        cancelled
        currency="BHD"
        lang="en"
      />,
    );
    expect(
      await screen.findByText(/The order is cancelled: open the supplier order/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back to the supplier/ })).toBeNull();
  });
});
