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
};
type Reply = { data: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });
let signedInUser: { id: string } | null = { id: "courier-1" };

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
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => builder(table),
    auth: { getUser: () => Promise.resolve({ data: { user: signedInUser } }) },
  },
}));

const { fetchOrderDetail, fetchOrderList, ordersKeys, ordersQueries, ORDER_DETAIL_SELECT } =
  await import("../src/lib/data/orders");

const eqs = (request: Request) =>
  Object.fromEntries(
    request.filters.filter(([kind]) => kind === "eq").map(([, column, value]) => [column, value]),
  );

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
  signedInUser = { id: "courier-1" };
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
