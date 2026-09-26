import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { orderSaveBlocker } from "../src/features/orders/lib/order-save";
import { blankOrderItem, orderTotals } from "../src/features/orders/lib/order-editor";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const orders = vi.hoisted(() => ({
  fetchDetail: vi.fn(async () => ({ id: "o1", order_items: [] })),
  createOrderWithItems: vi.fn(async () => "created-1"),
  updateOrder: vi.fn(async () => undefined),
}));
vi.mock("sonner", () => ({ toast }));
const ordersData = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { ordersQueries: object };
  return {
    ...actual,
    ordersQueries: {
      ...actual.ordersQueries,
      detail: (brandId: string, orderId: string) => ({
        queryKey: ["order-detail", brandId, orderId],
        queryFn: orders.fetchDetail,
      }),
    },
    createOrderWithItems: orders.createOrderWithItems,
    updateOrder: orders.updateOrder,
  };
};
vi.mock("../src/lib/data/orders", (importOriginal) => ordersData(importOriginal));
vi.mock("@/lib/data/orders", (importOriginal) => ordersData(importOriginal));
const session = { getCurrentUser: async () => ({ id: "u1" }) };
vi.mock("../src/lib/auth/session", () => session);
vi.mock("@/lib/auth/session", () => session);
// The editor's realtime channel.
const channel = { on: () => channel, subscribe: () => channel };
const client = { supabase: { channel: () => channel, removeChannel: async () => undefined } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const { useOrderDetailData } = await import("../src/features/orders/hooks/use-order-detail-data");
const { useSaveOrder } = await import("../src/features/orders/hooks/use-save-order");

beforeEach(() => {
  vi.clearAllMocks();
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const saveNewOrder = (order: Record<string, unknown>, items = [] as never[]) => {
  const navigate = vi.fn();
  const { result } = renderHook(
    () =>
      useSaveOrder({
        appliedPromo: null,
        brandId: "b1",
        currency: "BHD",
        id: "new",
        initialSnapshotRef: { current: null },
        isReadOnly: false,
        items,
        lang: "en",
        order: order as never,
        orderQ: { data: undefined } as never,
        qc: new QueryClient(),
        router: { navigate } as never,
        setEditingUnlocked: vi.fn(),
        setHasSavedDraft: vi.fn(),
        setItems: vi.fn(),
        setOrder: vi.fn(),
        setSaving: vi.fn(),
        slug: "pura",
        t: ((key: string) => key) as never,
        totals: orderTotals(items, order, false),
      }),
    { wrapper },
  );
  return { save: result.current.save, navigate };
};

describe("manual order creation", () => {
  it("opens an in-memory draft: nothing is read for a new order", async () => {
    // Other editor data is off (no brand) so only the order query is in play.
    const props = { brandId: "", isCourier: false, isAdmin: false };
    renderHook(() => useOrderDetailData({ id: "new", ...props }), { wrapper });
    renderHook(() => useOrderDetailData({ id: "o1", ...props }), { wrapper });
    await waitFor(() => expect(orders.fetchDetail).toHaveBeenCalledTimes(1));
  });

  it("requires meaningful data before the first database insert", async () => {
    const pickup = { fulfillment_method: "pickup", branch_id: "b1" };
    expect(orderSaveBlocker({ ...pickup, customer_id: null }, [], "new", "ar")).toBe(
      "أضف عميلاً أو منتجاً واحداً على الأقل قبل حفظ الطلب.",
    );
    expect(orderSaveBlocker({ ...pickup, customer_id: "c1" }, [], "new", "en")).toBeNull();
    expect(orderSaveBlocker({ ...pickup, customer_id: null }, [], "o1", "en")).toBeNull();

    // An empty draft is refused before anything is written.
    const empty = saveNewOrder({ ...pickup, customer_id: null });
    await act(() => empty.save());
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(orders.createOrderWithItems).not.toHaveBeenCalled();

    // With a customer the draft is inserted once, for the brand, and opened.
    const withCustomer = saveNewOrder({ ...pickup, customer_id: "c1" }, [
      { ...blankOrderItem(), variant_id: "v1", unit_price: 30, line_total: 30 },
    ] as never[]);
    await act(() => withCustomer.save());
    expect(orders.createOrderWithItems).toHaveBeenCalledTimes(1);
    expect(orders.createOrderWithItems).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ brand_id: "b1", user_id: "u1", customer_id: "c1" }),
      expect.any(Function),
    );
    expect(withCustomer.navigate).toHaveBeenCalledWith({
      to: "/admin/b/$slug/orders/$id",
      params: { slug: "pura", id: "created-1" },
    });
  });
});
