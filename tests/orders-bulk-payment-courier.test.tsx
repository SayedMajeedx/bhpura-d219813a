import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { orderRequiresCourier } from "../src/lib/order-fulfillment";
import { getStoredPaymentMethodPresentation } from "../src/lib/payment-method";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const receipts = vi.hoisted(() => ({
  deleteOrdersWithPrivateReceipts: vi.fn(async () => ({ deleted: 2 })),
  deleteOrderWithPrivateReceipt: vi.fn(),
}));
const r2 = vi.hoisted(() => ({ deleted: [] as string[] }));
const server = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("sonner", () => ({ toast }));

// Server functions run for real (recording createServerFn); screens get stubs.
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
vi.mock("../src/lib/benefit-receipt.functions", () => receipts);
vi.mock("@/lib/benefit-receipt.functions", () => receipts);
// The status API route reads with the service-role client.
const adminClient = {
  get supabaseAdmin() {
    return server.admin;
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
const headers = { authenticatedJsonHeaders: async () => ({ "Content-Type": "application/json" }) };
vi.mock("../src/features/orders/actions/order-links", () => headers);
vi.mock("@/features/orders/actions/order-links", () => headers);

const functions = (await vi.importActual(
  "../src/lib/benefit-receipt.functions",
)) as unknown as Record<string, ServerFn>;
const { BulkDeleteOrdersDialog } =
  await import("../src/features/orders/components/BulkDeleteOrdersDialog");
const { queueActionState } = await import("../src/features/orders/components/order-queue-action");
const { ordersKeys } = await import("../src/lib/data/orders");
const { Route: statusRoute } = (await import("../src/routes/api.orders.status")) as unknown as {
  Route: {
    options: { server: { handlers: { PATCH: (ctx: { request: Request }) => Promise<Response> } } };
  };
};

const BRAND = "7b0c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a11";
const ORDER_A = "0f2c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a22";
const ORDER_B = "1f2c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a33";

beforeEach(() => {
  vi.clearAllMocks();
  r2.deleted = [];
});

describe("orders list payment and courier rules", () => {
  it.each([
    ["delivery", true],
    ["Delivery", true],
    ["pickup", false],
    ["digital", false],
    [null, false],
  ])("requires a courier only for %s", (fulfillmentMethod, expected) => {
    expect(orderRequiresCourier({ fulfillment_method: fulfillmentMethod })).toBe(expected);
  });

  it.each([
    ["card", "paid", "delivery", "ar", "بطاقة"],
    ["benefit", "unpaid", "pickup", "ar", "بنفت"],
    ["cod", "unpaid", "delivery", "ar", "الدفع عند الاستلام"],
    ["card", "unpaid", "pickup", "en", "Card"],
    ["benefit", "paid", "delivery", "en", "Benefit"],
    ["cod", "paid", "pickup", "en", "Cash on Delivery"],
  ] as const)(
    "presents %s/%s/%s correctly in %s",
    (paymentMethod, _paymentStatus, fulfillmentMethod, lang, expected) => {
      expect(getStoredPaymentMethodPresentation(paymentMethod, lang).label).toBe(expected);
      expect(orderRequiresCourier({ fulfillment_method: fulfillmentMethod })).toBe(
        fulfillmentMethod === "delivery",
      );
    },
  );

  it("keeps the bulk delete brand-scoped and behind the admin and impersonation checks", async () => {
    const remove = functions.deleteOrdersWithPrivateReceipts;
    const orders = [
      {
        id: ORDER_A,
        brand_id: BRAND,
        benefit_receipt_key: `brands/${BRAND}/benefit-receipts/a.png`,
      },
      { id: ORDER_B, brand_id: BRAND, benefit_receipt_key: null },
    ];
    const data = { brandId: BRAND, orderIds: [ORDER_A, ORDER_B, ORDER_A] };

    const staff = fakeSupabase({
      rows: { orders },
      rpc: { can_access_brand: true, is_admin: false },
    });
    await expect(remove({ data, context: staff })).rejects.toThrow("FORBIDDEN");
    expect(staff.writes).toHaveLength(0);

    // An id from another brand is not returned by the brand-scoped read.
    const partial = fakeSupabase({
      rows: { orders: orders.slice(0, 1) },
      rpc: { can_access_brand: true, is_admin: true },
    });
    await expect(remove({ data, context: partial })).rejects.toThrow("ORDER_SET_MISMATCH");
    expect(partial.writes).toHaveLength(0);

    const admin = fakeSupabase({
      rows: { orders },
      rpc: { can_access_brand: true, is_admin: true },
    });
    await expect(remove({ data, context: { ...admin, userId: "u1" } })).resolves.toEqual({
      deleted: 2,
    });
    expect(safeguard.enforceMutationSafeguard).toHaveBeenCalledWith(admin.supabase, "u1", BRAND);
    expect(r2.deleted).toEqual([`brands/${BRAND}/benefit-receipts/a.png`]);
    expect(admin.writes).toEqual([
      {
        table: "orders",
        values: "DELETE",
        filters: [
          ["brand_id", BRAND],
          ["id", [ORDER_A, ORDER_B]],
        ],
      },
    ]);
  });

  it("asks for confirmation before deleting the selected orders", async () => {
    const onDeleted = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BulkDeleteOrdersDialog
          open
          onOpenChange={onOpenChange}
          brandId={BRAND}
          orderIds={new Set([ORDER_A, ORDER_B])}
          lang="en"
          onDeleted={onDeleted}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("alertdialog", { name: "Delete 2 orders?" })).toBeInTheDocument();
    expect(receipts.deleteOrdersWithPrivateReceipts).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(receipts.deleteOrdersWithPrivateReceipts).toHaveBeenCalledWith({
      data: { brandId: BRAND, orderIds: [ORDER_A, ORDER_B] },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("rejects courier assignment to non-delivery orders on the server", async () => {
    const patch = (order: Record<string, unknown>, body: Record<string, unknown>) => {
      const db = fakeSupabase({
        rows: {
          profiles: { role: "brand_admin", status: "active", brand_id: BRAND, permissions: [] },
          orders: { id: ORDER_A, brand_id: BRAND, payment_status: "paid", ...order },
        },
      });
      server.admin = {
        ...db.supabase,
        auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
      };
      const request = new Request("https://boutq.test/api/orders/status", {
        method: "PATCH",
        headers: { authorization: "Bearer token" },
        body: JSON.stringify({ id: ORDER_A, ...body }),
      });
      return { response: statusRoute.options.server.handlers.PATCH({ request }), db };
    };

    const pickup = patch({ fulfillment_method: "pickup" }, { assigned_to: "courier-1" });
    const refused = await pickup.response;
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      error: "Couriers can only be assigned to delivery orders.",
    });
    expect(pickup.db.writes).toHaveLength(0);

    const delivery = patch({ fulfillment_method: "delivery" }, { assigned_to: "courier-1" });
    const accepted = await delivery.response;
    expect(accepted.status).toBe(200);
    // The changed order comes back so the list can update in place.
    expect(await accepted.json()).toMatchObject({ order: { id: ORDER_A } });
    expect(delivery.db.writes).toEqual([
      {
        table: "orders",
        values: { assigned_to: "courier-1" },
        filters: [
          ["id", ORDER_A],
          ["brand_id", BRAND],
        ],
      },
    ]);

    const otherBrand = patch({ brand_id: "another-brand" }, { fulfillment_status: "PACKING" });
    expect((await otherBrand.response).status).toBe(403);
  });

  it("updates a changed order in the list cache, never an open order's detail", async () => {
    const qc = new QueryClient();
    const row = {
      id: ORDER_A,
      fulfillment_status: "ON_HOLD",
      customers: { name: "Sara" },
      order_items: [1],
    };
    qc.setQueryData(ordersKeys.list(BRAND, "office"), [row]);
    qc.setQueryData(ordersKeys.detail(BRAND, ORDER_A), {
      id: ORDER_A,
      fulfillment_status: "ON_HOLD",
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ order: { id: ORDER_A, fulfillment_status: "PACKING" } })),
      );
    try {
      const { handleStatusUpdate } = queueActionState(
        {
          brandId: BRAND,
          hasMadeToOrder: false,
          lang: "en",
          qc,
          setUpdatingOrderId: vi.fn(),
          updatingOrderId: null,
        } as never,
        { ...row, status: "confirmed" } as never,
      );
      await handleStatusUpdate({ fulfillment_status: "PACKING" }, "Packing");
      expect(qc.getQueryData(ordersKeys.list(BRAND, "office"))).toEqual([
        { ...row, fulfillment_status: "PACKING" },
      ]);
      expect(qc.getQueryData(ordersKeys.detail(BRAND, ORDER_A))).toMatchObject({
        fulfillment_status: "ON_HOLD",
      });
      expect(toast.success).toHaveBeenCalledWith("Packing");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
