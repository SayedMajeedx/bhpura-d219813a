import { renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "../src/features/orders/types";

// Setting the payment or the status on a new order used to write to the
// database with the id "new" ("invalid input syntax for type uuid"). A new
// order keeps those edits and saves them with the order; a saved order
// writes them straight away, as before.

const data = vi.hoisted(() => ({
  updateOrder: vi.fn(async () => undefined),
  invalidateOrders: vi.fn(),
  logActivity: vi.fn(async () => undefined),
  toast: { success: vi.fn(), error: vi.fn() },
}));
const orders = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  updateOrder: data.updateOrder,
  invalidateOrders: data.invalidateOrders,
});
vi.mock("../src/lib/data/orders", (io) => orders(io));
vi.mock("@/lib/data/orders", (io) => orders(io));
const activity = { logActivity: data.logActivity };
vi.mock("../src/lib/activity-log", () => activity);
vi.mock("@/lib/activity-log", () => activity);
vi.mock("sonner", () => ({ toast: data.toast }));

const { isSavedOrderId } = await import("../src/features/orders/lib/order-editor");
const { orderSavePayload } = await import("../src/features/orders/lib/order-save");
const { useOrderPaymentDetails } =
  await import("../src/features/orders/hooks/use-order-payment-details");
const { createOrderStatusChange } =
  await import("../src/features/orders/actions/order-status-change");

beforeEach(() => {
  vi.clearAllMocks();
});

const order = (id: string) =>
  ({
    id,
    brand_id: "b1",
    status: "pending",
    fulfillment_status: "ON_HOLD",
    payment_status: "unpaid",
    payment_method: null,
    payment_reference: null,
    advance_paid: 0,
    total: 30,
  }) as unknown as Order;

const payment = {
  payment_status: "partially_paid",
  payment_method: "cod",
  advance_paid: 10,
  payment_reference: "TAP_CHG_981273",
};

describe("isSavedOrderId", () => {
  it("tells a saved order from a new one", () => {
    expect(isSavedOrderId("5d0c7a52-1f3e-4b7a-9d2b-2f6f8c1a9e11")).toBe(true);
    expect(isSavedOrderId("new")).toBe(false);
    expect(isSavedOrderId("draft_123")).toBe(false);
    expect(isSavedOrderId("")).toBe(false);
    expect(isSavedOrderId(null)).toBe(false);
  });
});

describe("the payment dialog", () => {
  const run = async (id: string) => {
    const setOrder = vi.fn();
    const { result } = renderHook(() =>
      useOrderPaymentDetails({
        brandId: "b1",
        initialSnapshotRef: { current: null },
        order: order(id),
        orderQ: { refetch: vi.fn(async () => undefined) } as never,
        qc: new QueryClient(),
        setOrder,
      }),
    );
    await result.current.handleSavePaymentDetails(payment as never);
    return setOrder;
  };

  it("keeps a new order's payment in the editor, without touching the database", async () => {
    const setOrder = await run("new");
    expect(data.updateOrder).not.toHaveBeenCalled();
    expect(setOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new", payment_status: "partially_paid", advance_paid: 10 }),
    );
  });

  it("saves a saved order's payment straight away", async () => {
    await run("5d0c7a52-1f3e-4b7a-9d2b-2f6f8c1a9e11");
    expect(data.updateOrder).toHaveBeenCalledWith(
      "b1",
      "5d0c7a52-1f3e-4b7a-9d2b-2f6f8c1a9e11",
      expect.objectContaining({ payment_status: "partially_paid" }),
    );
  });
});

describe("the status menu", () => {
  const change = (id: string) => {
    const setOrder = vi.fn();
    const handler = createOrderStatusChange({
      order: order(id),
      lang: "en",
      orderQ: { refetch: vi.fn(async () => undefined) } as never,
      qc: new QueryClient(),
      brandId: "b1",
      setOrder,
    });
    return { handler, setOrder };
  };

  it("sets a new order's status in the editor, to save with the order", async () => {
    const { handler, setOrder } = change("new");
    await handler("confirmed", "NEEDS_PACKING");
    expect(data.updateOrder).not.toHaveBeenCalled();
    const apply = setOrder.mock.calls[0][0] as (current: Order) => Order;
    expect(apply(order("new"))).toMatchObject({
      status: "confirmed",
      fulfillment_status: "NEEDS_PACKING",
    });
    expect(data.toast.success).toHaveBeenCalledWith("The status will be saved with the order");
  });

  it("writes a saved order's status straight away", async () => {
    const { handler, setOrder } = change("5d0c7a52-1f3e-4b7a-9d2b-2f6f8c1a9e11");
    await handler("confirmed", "NEEDS_PACKING");
    expect(data.updateOrder).toHaveBeenCalledTimes(1);
    expect(setOrder).not.toHaveBeenCalled();
  });
});

describe("saving a new order", () => {
  it("keeps the payment reference entered before it was saved", () => {
    const payload = orderSavePayload(
      { ...order("new"), ...payment } as Order,
      {
        subtotal: 30,
        discount: 0,
        shipping: 0,
        taxAmount: 0,
        total: 30,
        advancePaid: 10,
        remaining: 20,
      },
      null,
      "BHD",
    );
    expect(payload).toMatchObject({
      payment_status: "partially_paid",
      payment_method: "cod",
      payment_reference: "TAP_CHG_981273",
      advance_paid: 10,
    });
  });
});
