import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// "Send to workshop" and "Received from workshop" on a customer's made-to-order order: staff who
// see the finances put the pieces on the tailor's account at this time's price, and receive them
// there; anyone else moves the stage as before.

const stubs = vi.hoisted(() => ({
  canViewFinancials: true,
  pieces: [] as unknown[],
  sendOrderToSupplier: vi.fn(async () => "po-4"),
  receiveSupplierOrder: vi.fn(async () => ({ status: "received", repeated: false })),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const options = (key: string, read: () => unknown) => ({
  queryKey: [key],
  queryFn: async () => read(),
});
const mocks: Record<string, unknown> = {
  "data/supplier-orders": {
    supplierOrderQueries: {
      orderPieces: () => options("pieces", () => stubs.pieces),
      list: () =>
        options("orders", () => [
          {
            id: "po-open",
            po_number: "PO-0003",
            status: "ordered",
            vendor_id: "tailor",
            created_at: "2026-10-18",
            expected_at: "2026-10-25",
            items: [{ variant_id: "v", quantity: 4, received_quantity: 0 }],
          },
        ]),
      lastPrices: () => options("prices", () => new Map([["p-abaya", 18]])),
    },
    sendOrderToSupplier: stubs.sendOrderToSupplier,
    receiveSupplierOrder: stubs.receiveSupplierOrder,
    invalidateSupplierOrders: vi.fn(async () => undefined),
    invalidateAfterReceipt: vi.fn(async () => undefined),
  },
  "data/catalog": {
    catalogKeys: { products: () => ["products"], variants: () => ["variants"] },
    catalogQueries: {
      products: () => options("products", () => [{ id: "p-abaya", cost_price: 12 }]),
      variants: () => options("variants", () => []),
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
  "profile-context": {
    useProfileOptional: () => ({
      canViewFinancials: stubs.canViewFinancials,
      hasPermission: () => true,
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
vi.mock("../src/lib/profile-context", () => mocks["profile-context"]);
vi.mock("@/lib/profile-context", () => mocks["profile-context"]);
vi.mock("sonner", () => ({ toast: stubs.toast }));

const { SendToTailorButton, ReceiveFromTailorButton } =
  await import("../src/features/supplier-orders/components/TailorButtons");

const lines = [
  {
    id: "oi-1",
    product_id: "p-abaya",
    variant_id: "v-52",
    description: "Black abaya · 52",
    quantity: 1,
    location: "custom" as const,
    unit_cost: 12,
  },
  {
    id: "oi-2",
    product_id: "p-scarf",
    variant_id: "v-s",
    description: "Silk scarf",
    quantity: 1,
    location: "main" as const,
  },
];
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
  stubs.canViewFinancials = true;
  stubs.pieces = [];
});

describe("sending a customer's pieces to the tailor", () => {
  it("puts the made-to-order pieces on the tailor's account, at the tailor's last price", async () => {
    const onSent = vi.fn();
    const onPlainSend = vi.fn();
    wrap(
      <SendToTailorButton
        brandId="b1"
        orderId="o-9"
        lines={lines}
        lang="en"
        onSent={onSent}
        onPlainSend={onPlainSend}
        title="Send to Tailor"
      >
        Send to Tailor
      </SendToTailorButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send to Tailor" }));
    const dialog = await screen.findByRole("dialog");
    // Only the made-to-order line is offered; the scarf is a ready piece.
    expect(within(dialog).queryByText("Silk scarf")).toBeNull();
    await within(dialog).findByRole("option", { name: "Umm Ali" });
    fireEvent.change(within(dialog).getByLabelText("Supplier"), { target: { value: "tailor" } });
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Cost of Black abaya · 52")).toHaveValue("18"),
    );
    fireEvent.change(within(dialog).getByLabelText("On which order"), {
      target: { value: "po-open" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Send/ }));
    await waitFor(() => expect(stubs.sendOrderToSupplier).toHaveBeenCalled());
    expect(stubs.sendOrderToSupplier).toHaveBeenCalledWith("o-9", {
      vendorId: "tailor",
      poId: "po-open",
      expectedAt: null,
      lines: [{ order_item_id: "oi-1", unit_cost: 18 }],
    });
    expect(onSent).toHaveBeenCalled();
    expect(onPlainSend).not.toHaveBeenCalled();
    // The tailor is never told the customer's name.
    expect(dialog).toHaveTextContent("The supplier gets no customer name or number");
  });

  it("can still only move the stage, and does only that for staff who cannot see costs", async () => {
    const onPlainSend = vi.fn();
    wrap(
      <SendToTailorButton
        brandId="b1"
        orderId="o-9"
        lines={lines}
        lang="en"
        onSent={vi.fn()}
        onPlainSend={onPlainSend}
        title="Send to Tailor"
      >
        Send to Tailor
      </SendToTailorButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send to Tailor" }));
    fireEvent.click(await screen.findByRole("button", { name: "Mark as sent, with no supplier" }));
    await waitFor(() => expect(onPlainSend).toHaveBeenCalledTimes(1));

    stubs.canViewFinancials = false;
    const plain = vi.fn();
    wrap(
      <SendToTailorButton
        brandId="b1"
        orderId="o-9"
        lines={lines}
        lang="en"
        onSent={vi.fn()}
        onPlainSend={plain}
        title="Send"
      >
        Send
      </SendToTailorButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(plain).toHaveBeenCalledTimes(1);
    expect(stubs.sendOrderToSupplier).not.toHaveBeenCalled();
  });
});

describe("receiving them back on the customer's order", () => {
  it("receives the pieces still with the tailor on their supplier orders", async () => {
    stubs.pieces = [
      { id: "pl-1", order_item_id: "oi-1", quantity: 1, received_quantity: 0, po_id: "po-4" },
    ];
    const onReceived = vi.fn();
    const onPlainReceive = vi.fn();
    wrap(
      <ReceiveFromTailorButton
        brandId="b1"
        lines={lines}
        lang="en"
        onReceived={onReceived}
        onPlainReceive={onPlainReceive}
      >
        Received from Tailor
      </ReceiveFromTailorButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Received from Tailor" }));
    await waitFor(() => expect(onReceived).toHaveBeenCalled());
    expect(stubs.receiveSupplierOrder).toHaveBeenCalledWith(
      "po-4",
      [{ item_id: "pl-1", quantity: 1 }],
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(onPlainReceive).not.toHaveBeenCalled();
  });

  it("only moves the stage when no piece is with a supplier", async () => {
    const onPlainReceive = vi.fn();
    wrap(
      <ReceiveFromTailorButton
        brandId="b1"
        lines={lines}
        lang="en"
        onReceived={vi.fn()}
        onPlainReceive={onPlainReceive}
      >
        Received from Tailor
      </ReceiveFromTailorButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Received from Tailor" }));
    await waitFor(() => expect(onPlainReceive).toHaveBeenCalled());
    expect(stubs.receiveSupplierOrder).not.toHaveBeenCalled();
  });
});
