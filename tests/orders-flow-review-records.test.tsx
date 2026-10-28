import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

// The second half of the owner's review of the orders flow (2026-10-28): what may be deleted,
// the tax switch, an unpaid card order, the editor's totals and the steps' activity trail.

const r2 = vi.hoisted(() => ({ deleted: [] as string[] }));
const mocks = vi.hoisted(() => ({
  logActivity: vi.fn(async () => undefined),
  updateOrder: vi.fn(async () => undefined),
  courierCompleteDelivery: vi.fn(async () => null as unknown),
  toastSuccess: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn(), info: vi.fn() },
}));
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
const guards = { requireSupabaseAuth: { guard: "authenticated" } };
vi.mock("../src/integrations/supabase/auth-middleware", () => guards);
vi.mock("@/integrations/supabase/auth-middleware", () => guards);
const safeguard = { enforceMutationSafeguard: vi.fn(async () => undefined) };
vi.mock("../src/lib/impersonation.server", () => safeguard);
vi.mock("@/lib/impersonation.server", () => safeguard);
const privateR2 = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  deletePrivateObject: async (key: string) => void r2.deleted.push(key),
});
vi.mock("../src/lib/private-r2.server", (io) => privateR2(io));
vi.mock("@/lib/private-r2.server", (io) => privateR2(io));
const ordersData = {
  courierCompleteDelivery: mocks.courierCompleteDelivery,
  updateOrder: mocks.updateOrder,
  invalidateOrders: vi.fn(async () => undefined),
};
vi.mock("../src/lib/data/orders", () => ordersData);
vi.mock("@/lib/data/orders", () => ordersData);
const activityLog = { logActivity: mocks.logActivity };
vi.mock("../src/lib/activity-log", () => activityLog);
vi.mock("@/lib/activity-log", () => activityLog);
const activityLogsData = { invalidateActivityLogs: vi.fn() };
vi.mock("../src/lib/data/activity-logs", () => activityLogsData);
vi.mock("@/lib/data/activity-logs", () => activityLogsData);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
const tailor = {
  SendToTailorButton: () => null,
  ReceiveFromTailorButton: () => null,
};
vi.mock("../src/features/supplier-orders/components/TailorButtons", () => tailor);
vi.mock("@/features/supplier-orders/components/TailorButtons", () => tailor);

const functions = (await vi.importActual(
  "../src/lib/benefit-receipt.functions",
)) as unknown as Record<string, ServerFn>;
const { orderDeletable, orderKeptMessage } = await import("../src/lib/order-deletion");
const { taxToggle } = await import("../src/features/orders/lib/tax-toggle");
const { getOrderWorkflow } = await import("../src/lib/order-workflow");
const { orderTotals } = await import("../src/features/orders/lib/order-editor");
const { orderTotals: databaseTotals } = await import("../src/lib/order-tax");
const { BulkDeleteOrdersDialog } =
  await import("../src/features/orders/components/BulkDeleteOrdersDialog");
const { renderOrderPrimaryAction } =
  await import("../src/features/orders/components/order-primary-action");
const { DEFAULT_VOCABULARY } = await import("../src/lib/store-vocabulary");

const BRAND = "7b0c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a11";
const ORDER = "0f2c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a22";
const OTHER = "1f2c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a33";

beforeEach(() => {
  vi.clearAllMocks();
  r2.deleted = [];
});

describe("which orders may be deleted for good", () => {
  it("allows a draft, an unpaid order and a cancelled one that took nothing", () => {
    expect(orderDeletable({ status: "draft", payment_status: "unpaid" })).toBe(true);
    expect(orderDeletable({ status: "pending", payment_status: "unpaid", advance_paid: 0 })).toBe(
      true,
    );
    expect(orderDeletable({ status: "cancelled", payment_status: "unpaid" })).toBe(true);
    expect(orderDeletable({})).toBe(true);
  });

  it("keeps whatever took money or was handed over", () => {
    expect(orderDeletable({ status: "confirmed", payment_status: "paid", advance_paid: 30 })).toBe(
      false,
    );
    expect(orderDeletable({ status: "pending", payment_status: "partially_paid" })).toBe(false);
    expect(orderDeletable({ status: "pending", payment_status: "unpaid", advance_paid: 5 })).toBe(
      false,
    );
    expect(orderDeletable({ status: "completed", payment_status: "unpaid" })).toBe(false);
    expect(orderDeletable({ fulfillment_status: "DELIVERED", payment_status: "unpaid" })).toBe(
      false,
    );
    expect(orderDeletable({ status: "cancelled", payment_status: "refunded" })).toBe(false);
    expect(orderDeletable(null)).toBe(false);
  });

  const paid = {
    id: ORDER,
    brand_id: BRAND,
    benefit_receipt_key: null,
    status: "confirmed",
    fulfillment_status: "PACKING",
    payment_status: "paid",
    advance_paid: 30,
  };
  const cancelled = {
    ...paid,
    id: OTHER,
    status: "cancelled",
    payment_status: "unpaid",
    advance_paid: 0,
  };

  it("the server refuses to delete a paid order, and deletes nothing", async () => {
    const db = fakeSupabase({
      rows: { orders: paid },
      rpc: { can_access_brand: true, is_admin: true },
    });
    await expect(
      functions.deleteOrderWithPrivateReceipt({ data: { orderId: ORDER }, context: db }),
    ).rejects.toThrow("ORDER_NOT_DELETABLE");
    expect(db.writes).toHaveLength(0);
  });

  it("deletes one that took nothing", async () => {
    const db = fakeSupabase({
      rows: { orders: cancelled },
      rpc: { can_access_brand: true, is_admin: true },
    });
    await expect(
      functions.deleteOrderWithPrivateReceipt({ data: { orderId: OTHER }, context: db }),
    ).resolves.toEqual({ deleted: true });
    expect(db.writes).toHaveLength(1);
  });

  it("a bulk delete is refused whole when any selected order must stay", async () => {
    const db = fakeSupabase({
      rows: { orders: [paid, cancelled] },
      rpc: { can_access_brand: true, is_admin: true },
    });
    await expect(
      functions.deleteOrdersWithPrivateReceipts({
        data: { brandId: BRAND, orderIds: [ORDER, OTHER] },
        context: db,
      }),
    ).rejects.toThrow("ORDER_NOT_DELETABLE");
    expect(db.writes).toHaveLength(0);
    expect(r2.deleted).toEqual([]);
  });

  it("the bulk dialog says how many of the selection stay", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BulkDeleteOrdersDialog
          open
          onOpenChange={vi.fn()}
          brandId={BRAND}
          orderIds={new Set([OTHER])}
          keptCount={2}
          lang="en"
          onDeleted={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/2 of the selected orders will stay/)).toBeTruthy();
    expect(screen.getByText(/stay on record: cancel them instead of deleting/)).toBeTruthy();
    expect(orderKeptMessage("ar")).toContain("يبقى في السجل");
  });
});

describe("the tax switch", () => {
  it("takes the tax off an order that carries it", () => {
    expect(taxToggle(10, 10, "en")).toEqual({ next: 0, label: "Make tax-exempt" });
  });
  it("puts back the store's own rate, never a fixed 10%", () => {
    expect(taxToggle(0, 5, "en")).toEqual({ next: 5, label: "Charge tax (5%)" });
    expect(taxToggle(0, 5, "ar")?.label).toBe("احتساب الضريبة (5%)");
  });
  it("is not offered to a store that charges no tax (no VAT number)", () => {
    expect(taxToggle(0, 0, "en")).toBeNull();
  });
});

describe("an unpaid card order", () => {
  const order = (patch: Record<string, unknown>) => ({
    total: 24,
    advance_paid: 0,
    payment_status: "unpaid",
    status: "pending",
    fulfillment_status: "PENDING",
    fulfillment_method: "delivery",
    payment_method: "card",
    order_items: [{ location: "main" }],
    ...patch,
  });

  it("waits for its payment: nothing to prepare, pack or send, and not the team's work", () => {
    for (const patch of [
      {},
      { fulfillment_method: "pickup" },
      { order_items: [{ location: "custom" }] },
      { payment_method: "tap" },
    ]) {
      const workflow = getOrderWorkflow(order(patch), { productionStages: true });
      expect(workflow.nextAction).toBe("none");
      expect(workflow.needsAttention).toBe(false);
      expect(workflow.awaitingPayment).toBe(true);
    }
  });

  it("goes on once the payment arrives, in full or as the advance", () => {
    expect(getOrderWorkflow(order({ payment_status: "paid", advance_paid: 24 })).nextAction).toBe(
      "start_packing",
    );
    expect(
      getOrderWorkflow(order({ payment_status: "partially_paid", advance_paid: 12 })).nextAction,
    ).toBe("start_packing");
  });

  it("cash on delivery and appointments are unchanged", () => {
    expect(getOrderWorkflow(order({ payment_method: "cod" })).nextAction).toBe("pack_and_ship");
    expect(
      getOrderWorkflow(
        order({
          fulfillment_method: "appointment",
          bookings: [{ starts_at: "2020-01-01T10:00:00Z" }],
        }),
      ).nextAction,
    ).toBe("collect_and_complete_service");
  });
});

describe("the editor's totals are the database's", () => {
  it("round to the fils as the order builder does, over awkward amounts", () => {
    const amounts = [
      { price: 12.345, discount: 1.111, shipping: 1.5, rate: 7.5, inclusive: false },
      { price: 99.999, discount: 0, shipping: 0, rate: 10, inclusive: true },
      { price: 0.005, discount: 0, shipping: 2, rate: 5, inclusive: false },
      { price: 33.335, discount: 3.3335, shipping: 0.25, rate: 10, inclusive: false },
    ];
    for (const a of amounts) {
      const editor = orderTotals(
        [{ line_total: a.price } as never],
        { discount: a.discount, shipping: a.shipping, tax_rate: a.rate },
        a.inclusive,
      );
      const database = databaseTotals(
        { subtotal: a.price, discount: a.discount, shipping: a.shipping },
        { rate: a.rate, inclusive: a.inclusive },
      );
      expect(editor.total).toBe(database.total);
      expect(editor.taxAmount).toBe(database.tax);
    }
  });
});

describe("every step on the order page is in the activity trail", () => {
  const base = {
    id: ORDER,
    brand_id: BRAND,
    status: "pending",
    payment_status: "paid",
    advance_paid: 30,
    total: 30,
    payment_method: "card",
    order_items: [],
  };
  const step = (order: Record<string, unknown>) =>
    render(
      <>
        {renderOrderPrimaryAction({
          approveBenefitPayment: async () => undefined,
          approvingBenefit: false,
          brandId: BRAND,
          isCreationMode: false,
          items: [],
          lang: "en",
          order: { ...base, ...order },
          orderQ: { refetch: vi.fn(async () => undefined) },
          qc: {},
          storeProfile: { addons: [], vertical: "fashion", modules: { made_to_order: false } },
          vocabulary: DEFAULT_VOCABULARY,
        } as never)}
      </>,
    );

  it.each([
    [{ fulfillment_method: "delivery", fulfillment_status: "SHIPPED" }, "Mark Delivered"],
    [{ fulfillment_method: "pickup", fulfillment_status: "READY_FOR_PICKUP" }, "Hand Over"],
    [{ fulfillment_method: "pickup", fulfillment_status: "PENDING" }, "Prepare for Pickup"],
  ])("%j logs what was done", async (order, label) => {
    step(order);
    fireEvent.click(screen.getByRole("button", { name: label }));
    await vi.waitFor(() => expect(mocks.logActivity).toHaveBeenCalledTimes(1));
    expect(mocks.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "status_change", order_id: ORDER }),
    );
  });
});
