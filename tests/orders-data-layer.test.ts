import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in orders data-layer tests");
});

/**
 * A minimal stand-in for the Supabase query builder: records each request and
 * answers it from `respond`, so fetchers are tested by behaviour.
 */
type Request = {
  table: string;
  select: string;
  filters: Array<[string, ...unknown[]]>;
  single: boolean;
  write?: { kind: "update" | "insert" | "delete"; payload?: unknown };
};
type Reply = { data: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });
let signedInUser: { id: string } | null = { id: "courier-1" };
const rpcCalls: Array<[string, Record<string, unknown>]> = [];
let rpcReply: (fn: string) => Reply = () => ({ data: null, error: null });

function builder(table: string) {
  const request: Request = { table, select: "", filters: [], single: false };
  requests.push(request);
  const chain = {
    select(columns: string) {
      request.select = columns;
      return chain;
    },
    eq: (...args: unknown[]) => (request.filters.push(["eq", ...args]), chain),
    order: (...args: unknown[]) => (request.filters.push(["order", ...args]), chain),
    update: (payload: unknown) => ((request.write = { kind: "update", payload }), chain),
    insert: (payload: unknown) => ((request.write = { kind: "insert", payload }), chain),
    delete: () => ((request.write = { kind: "delete" }), chain),
    single() {
      request.single = true;
      return Promise.resolve(respond(request));
    },
    maybeSingle() {
      request.single = true;
      return Promise.resolve(respond(request));
    },
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

// vi.mock is hoisted; both specifiers are mocked (the `@/` alias alone is not
// resolved by vi.mock in this setup).
vi.mock("../src/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => builder(table),
    auth: { getUser: () => Promise.resolve({ data: { user: signedInUser } }) },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push([fn, args]);
      return Promise.resolve(rpcReply(fn));
    },
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => builder(table),
    auth: { getUser: () => Promise.resolve({ data: { user: signedInUser } }) },
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push([fn, args]);
      return Promise.resolve(rpcReply(fn));
    },
  },
}));

const {
  approveBenefitPayment,
  courierUpdateDelivery,
  createOrderWithItems,
  fetchOrderDetail,
  fetchOrderList,
  invalidateOrders,
  ordersKeys,
  ordersQueries,
  replaceOrderItems,
  updateOrder,
  ORDER_DETAIL_SELECT,
} = await import("../src/lib/data/orders");

const eqs = (request: Request) =>
  Object.fromEntries(
    request.filters.filter(([kind]) => kind === "eq").map(([, column, value]) => [column, value]),
  );

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
  signedInUser = { id: "courier-1" };
  rpcCalls.length = 0;
  rpcReply = () => ({ data: null, error: null });
});

describe("orders query keys", () => {
  it("start with the brand, with lists and details on separate branches", () => {
    expect(ordersKeys.list("b1", "office")).toEqual(["orders", "b1", "list", "office"]);
    expect(ordersKeys.detail("b1", "o1", "office")).toEqual([
      "orders",
      "b1",
      "detail",
      "o1",
      "office",
    ]);
    // Invalidating one order matches it in every scope.
    expect(ordersKeys.detail("b1", "o1")).toEqual(["orders", "b1", "detail", "o1"]);
    // In-place list updates target `lists`, which never matches a detail.
    const lists = ordersKeys.lists("b1");
    expect(ordersKeys.detail("b1", "o1", "office").slice(0, lists.length)).not.toEqual(lists);
  });

  it("give each scope its own key and poll couriers faster", () => {
    const office = ordersQueries.list("b1", "office");
    const courier = ordersQueries.list("b1", "assigned-courier");
    expect(office.queryKey).not.toEqual(courier.queryKey);
    expect(office.refetchInterval).toBe(30_000);
    expect(courier.refetchInterval).toBe(10_000);
  });
});

describe("fetchOrderList", () => {
  it("reads the brand's orders newest first", async () => {
    respond = () => ({ data: [{ id: "o1" }], error: null });
    expect(await fetchOrderList("b1", "office")).toEqual([{ id: "o1" }]);
    expect(requests[0].table).toBe("orders");
    expect(eqs(requests[0])).toEqual({ brand_id: "b1" });
    expect(requests[0].filters).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("limits a courier to their assigned deliveries", async () => {
    await fetchOrderList("b1", "assigned-courier");
    expect(eqs(requests[0])).toEqual({
      brand_id: "b1",
      assigned_to: "courier-1",
      fulfillment_method: "delivery",
    });
  });

  it("returns nothing to a signed-out courier", async () => {
    signedInUser = null;
    respond = () => ({ data: [{ id: "o1" }], error: null });
    expect(await fetchOrderList("b1", "assigned-courier")).toEqual([]);
  });

  it("throws database errors", async () => {
    respond = () => ({ data: null, error: new Error("boom") });
    await expect(fetchOrderList("b1", "office")).rejects.toThrow("boom");
  });
});

describe("fetchOrderDetail", () => {
  it("reads one order of the brand with its customer, lines and address", async () => {
    respond = () => ({ data: { id: "o1" }, error: null });
    expect(await fetchOrderDetail("b1", "o1", "office")).toEqual({ id: "o1" });
    expect(requests[0].select).toBe(ORDER_DETAIL_SELECT);
    expect(requests[0].single).toBe(true);
    expect(eqs(requests[0])).toEqual({ id: "o1", brand_id: "b1" });
  });

  it("limits a courier to an order assigned to them", async () => {
    respond = () => ({ data: { id: "o1" }, error: null });
    await fetchOrderDetail("b1", "o1", "assigned-courier");
    expect(eqs(requests[0])).toMatchObject({
      assigned_to: "courier-1",
      fulfillment_method: "delivery",
    });
  });

  it("explains a missing order and a signed-out courier", async () => {
    respond = () => ({ data: null, error: null });
    await expect(fetchOrderDetail("b1", "o1", "office")).rejects.toThrow("Order not found");
    signedInUser = null;
    await expect(fetchOrderDetail("b1", "o1", "assigned-courier")).rejects.toThrow(
      "Not authenticated",
    );
  });
});

describe("order writes", () => {
  it("update one order of the brand", async () => {
    respond = () => ({ data: null, error: null });
    await updateOrder("b1", "o1", { status: "packing", fulfillment_status: "PACKING" });
    expect(requests[0].write).toEqual({
      kind: "update",
      payload: { status: "packing", fulfillment_status: "PACKING" },
    });
    expect(eqs(requests[0])).toEqual({ id: "o1", brand_id: "b1" });
  });

  it("throw when an update fails", async () => {
    respond = () => ({ data: null, error: new Error("denied") });
    await expect(updateOrder("b1", "o1", { status: "packing" })).rejects.toThrow("denied");
  });

  it("create an order with its lines, stamped with the brand", async () => {
    respond = (r) =>
      r.table === "orders" ? { data: { id: "new-1" }, error: null } : { data: null, error: null };
    const id = await createOrderWithItems("b1", { user_id: "u1", total: 5 }, (orderId) => [
      { order_id: orderId, user_id: "u1", brand_id: "b1", description: "Abaya" },
    ]);
    expect(id).toBe("new-1");
    expect(requests[0].write).toEqual({
      kind: "insert",
      payload: { user_id: "u1", total: 5, brand_id: "b1" },
    });
    expect(requests[1]).toMatchObject({
      table: "order_items",
      write: { kind: "insert", payload: [{ order_id: "new-1", description: "Abaya" }] },
    });
  });

  it("delete the new order again when its lines fail", async () => {
    respond = (r) =>
      r.table === "orders" && r.write?.kind === "insert"
        ? { data: { id: "new-1" }, error: null }
        : r.table === "order_items"
          ? { data: null, error: new Error("bad line") }
          : { data: null, error: null };
    await expect(
      createOrderWithItems("b1", { user_id: "u1" }, () => [
        { order_id: "new-1", user_id: "u1", brand_id: "b1", description: "x" },
      ]),
    ).rejects.toThrow("bad line");
    const rollback = requests[2];
    expect(rollback.write).toEqual({ kind: "delete" });
    expect(eqs(rollback)).toEqual({ id: "new-1", brand_id: "b1" });
  });

  it("skip the lines insert for an order without lines", async () => {
    respond = () => ({ data: { id: "new-1" }, error: null });
    await createOrderWithItems("b1", { user_id: "u1" }, () => []);
    expect(requests.map((r) => r.table)).toEqual(["orders"]);
  });

  it("call the order RPCs with their typed arguments", async () => {
    await replaceOrderItems("o1", []);
    await approveBenefitPayment("o1");
    const err = await courierUpdateDelivery({
      orderId: "o1",
      status: "out_for_delivery",
      notes: null,
      codCollected: false,
      codAmount: null,
    });
    expect(err).toBeNull();
    expect(rpcCalls).toEqual([
      ["replace_order_items", { p_order_id: "o1", p_items: [] }],
      ["approve_benefit_payment", { p_order_id: "o1" }],
      [
        "courier_update_delivery",
        {
          p_order_id: "o1",
          p_status: "out_for_delivery",
          p_notes: undefined,
          p_cod_collected: false,
          p_cod_amount: undefined,
        },
      ],
    ]);
  });

  it("surface RPC failures: thrown for writes, returned for courier fallbacks", async () => {
    rpcReply = () => ({ data: null, error: new Error("INSUFFICIENT_STOCK") });
    await expect(replaceOrderItems("o1", [])).rejects.toThrow("INSUFFICIENT_STOCK");
    const err = await courierUpdateDelivery({
      orderId: "o1",
      status: "delivered",
      notes: "left at door",
      codCollected: true,
      codAmount: 12,
    });
    expect(err).toBeInstanceOf(Error);
  });

  it("invalidate the brand's queue and open orders together", () => {
    const invalidateQueries = vi.fn();
    invalidateOrders({ invalidateQueries } as never, "b1");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["orders", "b1"] });
  });
});
