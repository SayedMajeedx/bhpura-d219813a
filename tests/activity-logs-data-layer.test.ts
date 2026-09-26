import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in activity log tests");
});

type Request = {
  table: string;
  op: "select" | "insert";
  payload?: unknown;
  filters: Array<[string, ...unknown[]]>;
};
type Reply = { data?: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });

function builder(table: string) {
  const request: Request = { table, op: "select", filters: [] };
  requests.push(request);
  const record =
    (kind: string) =>
    (...args: unknown[]) => (request.filters.push([kind, ...args]), chain);
  const chain = {
    select: () => chain,
    insert(payload: unknown) {
      request.op = "insert";
      request.payload = payload;
      return chain;
    },
    eq: record("eq"),
    in: record("in"),
    order: record("order"),
    limit: record("limit"),
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

const client = {
  supabase: {
    from: (table: string) => builder(table),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  },
};
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const logs = await import("../src/lib/data/activity-logs");
const { logActivity, logActivityBatch } = await import("../src/lib/activity-log");

const denied = { message: "denied" };
const eqs = (request: Request) =>
  request.filters.filter(([k]) => k === "eq").map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("activity lists", () => {
  it("read an order's newest 50 entries within the brand", async () => {
    await logs.fetchActivityLogs({ orderId: "o1", brandId: "b1" });
    expect(eqs(requests[0])).toEqual([
      ["brand_id", "b1"],
      ["order_id", "o1"],
    ]);
    expect(requests[0].filters).toContainEqual(["limit", 50]);
    expect(requests[0].filters).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("read the inventory actions when no order or product is given", async () => {
    await logs.fetchActivityLogs({ scope: "inventory", brandId: "b1", limit: 20 });
    expect(requests[0].filters).toContainEqual(["in", "action", logs.INVENTORY_ACTIONS]);
    expect(requests[0].filters).toContainEqual(["limit", 20]);
    await logs.fetchActivityLogs({ productId: "p1" });
    expect(eqs(requests[1])).toEqual([["product_id", "p1"]]);
  });

  it("read a return's order history within the brand, and throw on error", async () => {
    await logs.fetchOrderActivityLogs("b1", "o1");
    expect(eqs(requests[0])).toEqual([
      ["brand_id", "b1"],
      ["order_id", "o1"],
    ]);
    expect(logs.activityLogsQueries.forOrder("b1", "").enabled).toBe(false);
    respond = () => ({ data: null, error: denied });
    await expect(logs.fetchOrderActivityLogs("b1", "o1")).rejects.toBe(denied);
  });

  it("all refresh through the one prefix the order screens invalidate", async () => {
    const qc = new QueryClient();
    qc.setQueryData(logs.activityLogsQueries.list({ orderId: "o1" }).queryKey, []);
    qc.setQueryData(logs.activityLogsQueries.forOrder("b1", "o1").queryKey, []);
    await logs.invalidateActivityLogs(qc);
    expect(
      qc
        .getQueryCache()
        .getAll()
        .every((query) => query.state.isInvalidated),
    ).toBe(true);
  });
});

describe("writing activity", () => {
  it("records the writer and leaves a missing brand to the database trigger", async () => {
    await logActivity({ action: "status_change", en: "Shipped", ar: "شُحن", order_id: "o1" });
    expect(requests[0]).toMatchObject({ table: "activity_logs", op: "insert" });
    expect(requests[0].payload).toEqual([
      {
        user_id: "u1",
        brand_id: null,
        order_id: "o1",
        product_id: null,
        variant_id: null,
        action: "status_change",
        message_en: "Shipped",
        message_ar: "شُحن",
        metadata: {},
      },
    ]);
  });

  it("writes a batch in one insert, nothing for an empty batch, and ignores a failed write", async () => {
    await logActivityBatch([]);
    expect(requests).toHaveLength(0);
    respond = () => ({ error: denied });
    await logActivityBatch([
      { action: "stock_change", en: "a", ar: "أ" },
      { action: "stock_change", en: "b", ar: "ب" },
    ]);
    expect((requests[0].payload as unknown[]).length).toBe(2);
  });
});
