import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseAdmin = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock("../src/integrations/supabase/client.server", () => ({ supabaseAdmin }));

import { Route as OrderStatusRoute } from "../src/routes/api.orders.status";
import { Route as CreateTapChargeRoute } from "../src/routes/api.public.payments.create-tap-charge";
import { buildTapIdempotentReference } from "../src/routes/api.public.payments.create-tap-charge";
import { Route as TapRedirectRoute } from "../src/routes/api.public.payments.tap-redirect";

type Handler = (context: { request: Request }) => Promise<Response>;

function handler(route: unknown, method: "GET" | "POST" | "PATCH"): Handler {
  return (route as any).options.server.handlers[method];
}

describe("server route security regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("builds stable, tenant-unique Tap idempotency references within the gateway limit", async () => {
    const first = await buildTapIdempotentReference(
      "brand-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "order-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "checkout-key-that-can-be-arbitrarily-long-".repeat(4),
    );
    const retry = await buildTapIdempotentReference(
      "brand-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "order-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "checkout-key-that-can-be-arbitrarily-long-".repeat(4),
    );
    const otherBrand = await buildTapIdempotentReference(
      "brand-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "order-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "checkout-key-that-can-be-arbitrarily-long-".repeat(4),
    );
    const otherOrder = await buildTapIdempotentReference(
      "brand-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "order-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "checkout-key-that-can-be-arbitrarily-long-".repeat(4),
    );

    expect(first).toBe(retry);
    expect(first).not.toBe(otherBrand);
    expect(first).not.toBe(otherOrder);
    expect(first).toMatch(/^bq_[a-f0-9]+$/);
    expect(first.length).toBeLessThanOrEqual(50);
  });

  it("rejects an order mutation with no bearer token before database access", async () => {
    const response = await handler(
      OrderStatusRoute,
      "PATCH",
    )({
      request: new Request("https://example.test/api/orders/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "order-1", payment_status: "paid" }),
      }),
    });

    expect(response.status).toBe(401);
    expect(supabaseAdmin.auth.getUser).not.toHaveBeenCalled();
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it("forbids an inactive or missing profile before fetching the order", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    supabaseAdmin.from.mockReturnValue({ select });

    const response = await handler(
      OrderStatusRoute,
      "PATCH",
    )({
      request: new Request("https://example.test/api/orders/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({ id: "order-1", payment_status: "paid" }),
      }),
    });

    expect(response.status).toBe(403);
    expect(supabaseAdmin.from).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin.from).toHaveBeenCalledWith("profiles");
  });

  it("forbids an admin from mutating an order owned by another brand", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
      error: null,
    });
    const profileMaybeSingle = vi.fn().mockResolvedValue({
      data: { role: "admin", status: "active", brand_id: "brand-1", permissions: [] },
      error: null,
    });
    const orderMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "order-1",
        brand_id: "brand-2",
        status: "pending",
        payment_status: "unpaid",
        payment_method: "cod",
        fulfillment_status: "pending",
        delivery_notes: null,
        assigned_to: null,
      },
      error: null,
    });
    const updateSpy = vi.fn(() => {
      throw new Error("Cross-brand update must not be attempted");
    });
    supabaseAdmin.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: table === "profiles" ? profileMaybeSingle : orderMaybeSingle,
        }),
      }),
      update: updateSpy,
    }));

    const response = await handler(
      OrderStatusRoute,
      "PATCH",
    )({
      request: new Request("https://example.test/api/orders/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({ id: "order-1", payment_status: "paid" }),
      }),
    });

    expect(response.status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("prevents an assigned courier from changing payment or assignment fields", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "courier-1" } },
      error: null,
    });
    const profileMaybeSingle = vi.fn().mockResolvedValue({
      data: { role: "courier", status: "active", brand_id: "brand-1", permissions: [] },
      error: null,
    });
    const orderMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "order-1",
        brand_id: "brand-1",
        status: "confirmed",
        payment_status: "unpaid",
        payment_method: "cod",
        fulfillment_status: "assigned",
        delivery_notes: null,
        assigned_to: "courier-1",
      },
      error: null,
    });
    const updateSpy = vi.fn(() => {
      throw new Error("Courier update must not be attempted");
    });
    supabaseAdmin.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: table === "profiles" ? profileMaybeSingle : orderMaybeSingle,
        }),
      }),
      update: updateSpy,
    }));

    const response = await handler(
      OrderStatusRoute,
      "PATCH",
    )({
      request: new Request("https://example.test/api/orders/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({ id: "order-1", assigned_to: "courier-2" }),
      }),
    });

    expect(response.status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("allows same-brand admin to successfully mutate order status", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "admin-1" } },
      error: null,
    });
    const profileMaybeSingle = vi.fn().mockResolvedValue({
      data: { role: "admin", status: "active", brand_id: "brand-1", permissions: [] },
      error: null,
    });
    const orderMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "order-1",
        brand_id: "brand-1",
        status: "confirmed",
        payment_status: "paid",
        payment_method: "card",
        fulfillment_status: "packing",
        delivery_notes: null,
        assigned_to: null,
      },
      error: null,
    });
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: "order-1", status: "shipped", fulfillment_status: "shipped" },
      error: null,
    });
    const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
    const updateEqBrand = vi.fn().mockReturnValue({ select: updateSelect });
    const updateEqId = vi.fn().mockReturnValue({ eq: updateEqBrand });
    const updateSpy = vi.fn().mockReturnValue({ eq: updateEqId });

    supabaseAdmin.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: table === "profiles" ? profileMaybeSingle : orderMaybeSingle,
        }),
      }),
      update: updateSpy,
    }));

    const response = await handler(
      OrderStatusRoute,
      "PATCH",
    )({
      request: new Request("https://example.test/api/orders/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({ id: "order-1", fulfillment_status: "shipped" }),
      }),
    });

    expect(response.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ fulfillment_status: "shipped" }),
    );
  });

  it("allows super_admin to mutate orders across any brand", async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({
      data: { user: { id: "super-1" } },
      error: null,
    });
    const profileMaybeSingle = vi.fn().mockResolvedValue({
      data: { role: "super_admin", status: "active", brand_id: null, permissions: [] },
      error: null,
    });
    const orderMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "order-99",
        brand_id: "brand-other",
        status: "pending",
        payment_status: "unpaid",
        payment_method: "card",
        fulfillment_status: "pending",
        delivery_notes: null,
        assigned_to: null,
      },
      error: null,
    });
    const updateSingle = vi.fn().mockResolvedValue({
      data: { id: "order-99", payment_status: "paid", status: "confirmed" },
      error: null,
    });
    const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
    const updateEqBrand = vi.fn().mockReturnValue({ select: updateSelect });
    const updateEqId = vi.fn().mockReturnValue({ eq: updateEqBrand });
    const updateSpy = vi.fn().mockReturnValue({ eq: updateEqId });

    supabaseAdmin.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: table === "profiles" ? profileMaybeSingle : orderMaybeSingle,
        }),
      }),
      update: updateSpy,
    }));

    const response = await handler(
      OrderStatusRoute,
      "PATCH",
    )({
      request: new Request("https://example.test/api/orders/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer valid-token",
        },
        body: JSON.stringify({ id: "order-99", payment_status: "paid" }),
      }),
    });

    expect(response.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: "paid" }),
    );
  });

  it("rejects a Tap redirect whose verified metadata targets another order", async () => {
    const brandMaybeSingle = vi.fn().mockResolvedValue({
      data: { slug: "shop" },
      error: null,
    });
    const brandEq = vi.fn().mockReturnValue({ maybeSingle: brandMaybeSingle });
    const brandSelect = vi.fn().mockReturnValue({ eq: brandEq });
    supabaseAdmin.from.mockImplementation((table: string) => {
      if (table === "brands") return { select: brandSelect };
      throw new Error(`Unexpected table access: ${table}`);
    });
    supabaseAdmin.rpc.mockResolvedValue({
      data: [{ api_key: "test-key" }],
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "CAPTURED",
            metadata: { order_id: "different-order", brand_id: "brand-1" },
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await handler(
      TapRedirectRoute,
      "GET",
    )({
      request: new Request(
        "https://example.test/api/public/payments/tap-redirect?tap_id=chg_1&order_id=order-1&brand_id=brand-1",
      ),
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("metadata verification failure");
    expect(supabaseAdmin.from).toHaveBeenCalledTimes(1);
  });

  it("rejects a Tap redirect when the verified charge is not the order's stored reference", async () => {
    const brandMaybeSingle = vi.fn().mockResolvedValue({
      data: { slug: "shop" },
      error: null,
    });
    const orderMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "order-1", payment_gateway_reference: "chg_expected" },
      error: null,
    });
    supabaseAdmin.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi
          .fn()
          .mockReturnValue(
            table === "brands"
              ? { maybeSingle: brandMaybeSingle }
              : { eq: vi.fn().mockReturnValue({ maybeSingle: orderMaybeSingle }) },
          ),
      }),
      update: vi.fn(() => {
        throw new Error("Mismatched payment must not update the order");
      }),
      delete: vi.fn(() => {
        throw new Error("Mismatched payment must not delete the order");
      }),
    }));
    supabaseAdmin.rpc.mockResolvedValue({
      data: [{ api_key: "test-key" }],
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "CAPTURED",
            metadata: { order_id: "order-1", brand_id: "brand-1" },
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await handler(
      TapRedirectRoute,
      "GET",
    )({
      request: new Request(
        "https://example.test/api/public/payments/tap-redirect?tap_id=chg_attacker&order_id=order-1&brand_id=brand-1",
      ),
    });

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("reference verification failure");
  });

  it("returns 500 instead of reporting payment success when the order update fails", async () => {
    const brandMaybeSingle = vi.fn().mockResolvedValue({
      data: { slug: "shop" },
      error: null,
    });
    const orderMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "order-1", payment_gateway_reference: "chg_1" },
      error: null,
    });
    const updateEqBrand = vi.fn().mockResolvedValue({ error: { message: "write failed" } });
    supabaseAdmin.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi
          .fn()
          .mockReturnValue(
            table === "brands"
              ? { maybeSingle: brandMaybeSingle }
              : { eq: vi.fn().mockReturnValue({ maybeSingle: orderMaybeSingle }) },
          ),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ eq: updateEqBrand }),
      }),
    }));
    supabaseAdmin.rpc.mockResolvedValue({ data: [{ api_key: "test-key" }], error: null });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "CAPTURED",
            metadata: { order_id: "order-1", brand_id: "brand-1" },
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await handler(
      TapRedirectRoute,
      "GET",
    )({
      request: new Request(
        "https://example.test/api/public/payments/tap-redirect?tap_id=chg_1&order_id=order-1&brand_id=brand-1",
      ),
    });

    expect(response.status).toBe(500);
    expect(await response.text()).toContain("order update failed");
  });

  it("retains the order and reports pending for a transient Tap status", async () => {
    const brandMaybeSingle = vi.fn().mockResolvedValue({
      data: { slug: "shop" },
      error: null,
    });
    const orderMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "order-1", payment_gateway_reference: "chg_1" },
      error: null,
    });
    const deleteOrder = vi.fn(() => {
      throw new Error("Payment redirect must never delete an order");
    });
    supabaseAdmin.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi
          .fn()
          .mockReturnValue(
            table === "brands"
              ? { maybeSingle: brandMaybeSingle }
              : { eq: vi.fn().mockReturnValue({ maybeSingle: orderMaybeSingle }) },
          ),
      }),
      delete: deleteOrder,
    }));
    supabaseAdmin.rpc.mockResolvedValue({ data: [{ api_key: "test-key" }], error: null });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "INITIATED",
            metadata: { order_id: "order-1", brand_id: "brand-1" },
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await handler(
      TapRedirectRoute,
      "GET",
    )({
      request: new Request(
        "https://example.test/api/public/payments/tap-redirect?tap_id=chg_1&order_id=order-1&brand_id=brand-1",
      ),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("payment_error=pending");
    expect(deleteOrder).not.toHaveBeenCalled();
    expect(supabaseAdmin.rpc).not.toHaveBeenCalledWith("sync_order_stock", expect.anything());
  });

  it("cancels a terminally failed Tap order and releases its reservation", async () => {
    const brandMaybeSingle = vi.fn().mockResolvedValue({ data: { slug: "shop" }, error: null });
    const orderMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "order-1", payment_gateway_reference: "chg_1" },
      error: null,
    });
    const updateEqBrand = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ eq: updateEqBrand }),
    });
    supabaseAdmin.from.mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        eq: vi
          .fn()
          .mockReturnValue(
            table === "brands"
              ? { maybeSingle: brandMaybeSingle }
              : { eq: vi.fn().mockReturnValue({ maybeSingle: orderMaybeSingle }) },
          ),
      }),
      update,
    }));
    supabaseAdmin.rpc.mockResolvedValue({ data: [{ api_key: "test-key" }], error: null });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: "DECLINED",
            metadata: { order_id: "order-1", brand_id: "brand-1" },
          }),
          { status: 200 },
        ),
      ),
    );

    const response = await handler(
      TapRedirectRoute,
      "GET",
    )({
      request: new Request(
        "https://example.test/api/public/payments/tap-redirect?tap_id=chg_1&order_id=order-1&brand_id=brand-1",
      ),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("payment_error=failed");
    expect(update).toHaveBeenCalledWith({ payment_status: "declined" });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith("sync_order_stock", {
      p_order_id: "order-1",
    });
  });

  it.each([
    ["pickup", null, "fulfillment=pickup&channel=email"],
    ["digital", "whatsapp", "fulfillment=digital&channel=whatsapp"],
  ])(
    "builds the success redirect from persisted %s fulfillment details",
    async (fulfillmentMethod, digitalChannel, expectedSearch) => {
      const brandMaybeSingle = vi.fn().mockResolvedValue({
        data: { slug: "shop" },
        error: null,
      });
      const orderMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: "order-1",
          payment_gateway_reference: "chg_1",
          fulfillment_method: fulfillmentMethod,
          digital_delivery_channel: digitalChannel,
        },
        error: null,
      });
      const updateEqBrand = vi.fn().mockResolvedValue({ error: null });
      supabaseAdmin.from.mockImplementation((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi
            .fn()
            .mockReturnValue(
              table === "brands"
                ? { maybeSingle: brandMaybeSingle }
                : { eq: vi.fn().mockReturnValue({ maybeSingle: orderMaybeSingle }) },
            ),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: updateEqBrand }),
        }),
      }));
      supabaseAdmin.rpc.mockResolvedValue({ data: [{ api_key: "test-key" }], error: null });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              status: "CAPTURED",
              metadata: { order_id: "order-1", brand_id: "brand-1" },
            }),
            { status: 200 },
          ),
        ),
      );

      const response = await handler(
        TapRedirectRoute,
        "GET",
      )({
        request: new Request(
          "https://example.test/api/public/payments/tap-redirect?tap_id=chg_1&order_id=order-1&brand_id=brand-1",
        ),
      });

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        `/shop/thank-you/order-1?payment=success&${expectedSearch}`,
      );
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith("sync_order_stock", {
        p_order_id: "order-1",
      });
    },
  );

  it("rejects a paid or non-card order before calling Tap", async () => {
    supabaseAdmin.rpc.mockResolvedValue({ data: [{ api_key: "test-key" }], error: null });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "order-1",
        brand_id: "brand-1",
        payment_method: "cod",
        payment_status: "unpaid",
        status: "pending",
      },
      error: null,
    });
    const thirdEq = vi.fn().mockReturnValue({ maybeSingle });
    const secondEq = vi.fn().mockReturnValue({ eq: thirdEq });
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
    supabaseAdmin.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: firstEq }) });
    const tapFetch = vi.fn();
    vi.stubGlobal("fetch", tapFetch);

    const response = await handler(
      CreateTapChargeRoute,
      "POST",
    )({
      request: new Request("https://example.test/api/public/payments/create-tap-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: "order-1",
          brandId: "brand-1",
          confirmationToken: "confirmation-1",
        }),
      }),
    });

    expect(response.status).toBe(409);
    expect(tapFetch).not.toHaveBeenCalled();
  });

  it("uses a stable Tap idempotency reference and ignores caller redirect URLs", async () => {
    supabaseAdmin.rpc.mockResolvedValue({ data: [{ api_key: "test-key" }], error: null });
    const order = {
      id: "order-1",
      brand_id: "brand-1",
      total: 12.5,
      payment_method: "card",
      payment_status: "unpaid",
      status: "pending",
      payment_gateway_reference: null,
      idempotency_key: "checkout-1",
      customers: { name: "Test Buyer", phone: "33333333", email: "buyer@example.test" },
    };
    const fetchOrder = vi.fn().mockResolvedValue({ data: order, error: null });
    const orderEq3 = vi.fn().mockReturnValue({ maybeSingle: fetchOrder });
    const orderEq2 = vi.fn().mockReturnValue({ eq: orderEq3 });
    const orderEq1 = vi.fn().mockReturnValue({ eq: orderEq2 });

    const persistSingle = vi.fn().mockResolvedValue({
      data: { payment_gateway_reference: "chg_1" },
      error: null,
    });
    const persistSelect = vi.fn().mockReturnValue({ maybeSingle: persistSingle });
    const persistIs = vi.fn().mockReturnValue({ select: persistSelect });
    const persistEq2 = vi.fn().mockReturnValue({ is: persistIs });
    const persistEq1 = vi.fn().mockReturnValue({ eq: persistEq2 });
    const update = vi.fn().mockReturnValue({ eq: persistEq1 });
    supabaseAdmin.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: orderEq1 }),
      update,
    });

    const tapFetch = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            id: "chg_1",
            transaction: { url: "https://tap.test/checkout/chg_1" },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", tapFetch);
    await import("../src/integrations/supabase/client.server");

    const makeRequest = () =>
      new Request("https://example.test/api/public/payments/create-tap-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: "order-1",
          brandId: "brand-1",
          confirmationToken: "confirmation-1",
          redirectUrl: "https://attacker.example/collect",
        }),
      });
    const response = await handler(CreateTapChargeRoute, "POST")({ request: makeRequest() });
    const duplicateResponse = await handler(
      CreateTapChargeRoute,
      "POST",
    )({
      request: makeRequest(),
    });

    expect(response.status).toBe(200);
    expect(duplicateResponse.status).toBe(200);
    const tapRequest = JSON.parse(String(tapFetch.mock.calls[0]?.[1]?.body));
    const concurrentTapRequest = JSON.parse(String(tapFetch.mock.calls[1]?.[1]?.body));
    expect(tapRequest.reference.idempotent).toBe(
      await buildTapIdempotentReference("brand-1", "order-1", "checkout-1"),
    );
    expect(concurrentTapRequest.reference.idempotent).toBe(tapRequest.reference.idempotent);
    expect(tapRequest.redirect.url).toBe(
      "https://example.test/api/public/payments/tap-redirect?order_id=order-1&brand_id=brand-1",
    );
    expect(tapRequest.redirect.url).not.toContain("attacker.example");
    expect(update).toHaveBeenCalledWith({ payment_gateway_reference: "chg_1" });
  });

  it("requires the checkout confirmation token before database or gateway access", async () => {
    const tapFetch = vi.fn();
    vi.stubGlobal("fetch", tapFetch);

    const response = await handler(
      CreateTapChargeRoute,
      "POST",
    )({
      request: new Request("https://example.test/api/public/payments/create-tap-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: "order-1", brandId: "brand-1" }),
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "PAYMENT_REQUEST_INVALID" });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
    expect(supabaseAdmin.rpc).not.toHaveBeenCalled();
    expect(tapFetch).not.toHaveBeenCalled();
  });

  it("rejects cross-site browser requests before database or gateway access", async () => {
    const response = await handler(
      CreateTapChargeRoute,
      "POST",
    )({
      request: new Request("https://example.test/api/public/payments/create-tap-charge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://attacker.example",
          "Sec-Fetch-Site": "cross-site",
        },
        body: JSON.stringify({
          orderId: "order-1",
          brandId: "brand-1",
          confirmationToken: "confirmation-1",
        }),
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "PAYMENT_ORIGIN_FORBIDDEN" });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it("does not expose thrown internal error details", async () => {
    supabaseAdmin.from.mockImplementation(() => {
      throw new Error("database-secret-detail");
    });

    const response = await handler(
      CreateTapChargeRoute,
      "POST",
    )({
      request: new Request("https://example.test/api/public/payments/create-tap-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: "order-1",
          brandId: "brand-1",
          confirmationToken: "confirmation-1",
        }),
      }),
    });

    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).toContain("PAYMENT_INTERNAL_ERROR");
    expect(body).not.toContain("database-secret-detail");
  });
});
