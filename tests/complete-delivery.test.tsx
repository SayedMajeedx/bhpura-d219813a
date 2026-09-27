import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Completing a delivery goes through courier_complete_delivery alone: a
// refusal is shown and the list restored, with no browser write behind it
// (bug #14).

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const orders = vi.hoisted(() => ({
  courierCompleteDelivery: vi.fn(async (): Promise<unknown> => null),
  invalidateOrders: vi.fn(),
  updateOrder: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast }));
const ordersModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  ...orders,
});
vi.mock("../src/lib/data/orders", (io) => ordersModule(io));
vi.mock("@/lib/data/orders", (io) => ordersModule(io));

const { useCompleteDelivery } = await import("../src/features/orders/hooks/use-complete-delivery");
const { ordersKeys } = await import("../src/lib/data/orders");

beforeEach(() => {
  vi.clearAllMocks();
});

const setup = () => {
  const qc = new QueryClient();
  const key = ordersKeys.list("b1", "assigned-courier");
  const row = { id: "o1", status: "shipped", fulfillment_status: "SHIPPED" };
  qc.setQueryData(key, [row]);
  const setCashModalOrder = vi.fn();
  const { result } = renderHook(() =>
    useCompleteDelivery({
      brandId: "b1",
      isCourier: true,
      lang: "en",
      qc,
      setCashCollectedAmount: vi.fn(),
      setCashModalNotes: vi.fn(),
      setCashModalOrder,
      setIsSubmittingCash: vi.fn(),
      setUpdatingOrderId: vi.fn(),
    }),
  );
  return { qc, key, row, result, setCashModalOrder };
};

describe("completing a delivery", () => {
  it("completes it through the server function and closes the cash dialog", async () => {
    const { result, setCashModalOrder } = setup();
    await act(() => result.current.handleCompleteDelivery({ id: "o1" }, 12, "at door"));
    expect(orders.courierCompleteDelivery).toHaveBeenCalledWith("o1", 12, "at door");
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(setCashModalOrder).toHaveBeenCalledWith(null);
  });

  it("shows a refusal, restores the list and writes nothing else", async () => {
    orders.courierCompleteDelivery.mockResolvedValueOnce({
      message: "Not authorized to complete delivery for this order",
    });
    const { qc, key, row, result } = setup();
    await act(() => result.current.handleCompleteDelivery({ id: "o1" }, 12));
    expect(orders.updateOrder).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(key)).toEqual([row]);
  });

  it("says when the delivery was already completed", async () => {
    orders.courierCompleteDelivery.mockResolvedValueOnce({ message: "DELIVERY_ALREADY_COMPLETED" });
    const { result } = setup();
    await act(() => result.current.handleCompleteDelivery({ id: "o1" }, 0));
    expect(toast.error).toHaveBeenCalledWith("This delivery was already completed");
  });
});
