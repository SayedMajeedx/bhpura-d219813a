import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in incubator data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "insert" | "update" | "rpc";
  payload?: unknown;
  select?: string;
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
  const write = (op: Request["op"]) => (payload?: unknown) => {
    request.op = op;
    request.payload = payload;
    return chain;
  };
  const chain = {
    select(columns: string) {
      request.select = columns;
      return chain;
    },
    insert: write("insert"),
    update: write("update"),
    eq: record("eq"),
    in: record("in"),
    gt: record("gt"),
    order: record("order"),
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

const client = {
  supabase: {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      const request: Request = { table: fn, op: "rpc", payload: args, filters: [] };
      requests.push(request);
      return Promise.resolve(respond(request));
    },
  },
};
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const incubators = await import("../src/lib/data/incubators");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);
const denied = { message: "INSUFFICIENT_MAIN_STOCK" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("keys", () => {
  it("keep everything of a brand under one prefix, so the batch modal refreshes the page", async () => {
    const keys = [
      incubators.incubatorsQueries.list("b1").queryKey,
      incubators.incubatorsQueries.active("b1").queryKey,
      incubators.incubatorsQueries.inventory("b1").queryKey,
      incubators.incubatorsQueries.sales("b1").queryKey,
      incubators.incubatorsQueries.payments("b1").queryKey,
      incubators.incubatorsQueries.transferOptions("b1").queryKey,
      incubators.incubatorsQueries.batchVariants("b1", ["p1"]).queryKey,
    ];
    expect(new Set(keys.map((k) => JSON.stringify(k))).size).toBe(keys.length);
    for (const key of keys) expect(key.slice(0, 2)).toEqual(["incubators", "b1"]);

    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await incubators.invalidateIncubators(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["incubators", "b1"]]);
  });
});

describe("reads", () => {
  it("scope each list by brand and keep its order", async () => {
    await incubators.fetchIncubators("b1");
    await incubators.fetchActiveIncubators("b1");
    await incubators.fetchIncubatorInventory("b1");
    await incubators.fetchIncubatorSales("b1");
    await incubators.fetchIncubatorPayments("b1");
    for (const request of requests) expect(filters(request, "eq")[0]).toEqual(["brand_id", "b1"]);
    expect(requests.map((r) => filters(r, "order")[0])).toEqual([
      ["name"],
      ["created_at", { ascending: true }],
      ["updated_at", { ascending: false }],
      ["sold_at", { ascending: false }],
      ["payment_date", { ascending: false }],
    ]);
    expect(filters(requests[1], "eq")[1]).toEqual(["is_active", true]);
  });

  it("offer only variants with main stock left, through their product's brand", async () => {
    await incubators.fetchTransferOptions("b1");
    expect(filters(requests[0], "eq")).toEqual([["products.brand_id", "b1"]]);
    expect(filters(requests[0], "gt")).toEqual([["stock_main", 0]]);
  });

  it("read batch variants within the brand, and nothing for no products", async () => {
    expect(await incubators.fetchBatchTransferVariants("b1", [])).toEqual([]);
    expect(requests).toHaveLength(0);
    await incubators.fetchBatchTransferVariants("b1", ["p1", "p2"]);
    expect(filters(requests[0], "eq")).toEqual([["brand_id", "b1"]]);
    expect(filters(requests[0], "in")).toEqual([["product_id", ["p1", "p2"]]]);
  });
});

describe("writes", () => {
  it("create and update incubators within the brand", async () => {
    await incubators.createIncubator("b1", { name: "Souq", brand_id: "other" });
    await incubators.updateIncubator("b1", "i1", { is_active: false });
    expect(requests[0].payload).toEqual({ name: "Souq", brand_id: "b1" });
    expect(filters(requests[1], "eq")).toEqual([
      ["id", "i1"],
      ["brand_id", "b1"],
    ]);
  });

  it("leave empty optional text to the functions' NULL defaults", async () => {
    await incubators.transferStockToIncubator({
      incubatorId: "i1",
      variantId: "v1",
      quantity: 2,
      externalCode: null,
      price: 10,
      commissionType: "percentage",
      commissionValue: 20,
      notes: null,
    });
    await incubators.recordIncubatorPayment({
      incubatorId: "i1",
      amount: 30,
      paymentDate: "2026-09-25",
      paymentMethod: null,
      reference: null,
      notes: null,
    });
    expect(requests[0]).toMatchObject({
      table: "transfer_stock_to_incubator",
      payload: {
        p_incubator_id: "i1",
        p_variant_id: "v1",
        p_quantity: 2,
        p_external_code: undefined,
        p_price: 10,
        p_notes: undefined,
      },
    });
    expect(requests[1].payload).toMatchObject({
      p_amount: 30,
      p_payment_date: "2026-09-25",
      p_payment_method: undefined,
      p_reference: undefined,
    });
  });

  it("throw the server's error so the page can map its code", async () => {
    respond = () => ({ data: null, error: denied });
    await expect(
      incubators.returnStockFromIncubator({ incubatorId: "i1", variantId: "v1", quantity: 1 }),
    ).rejects.toBe(denied);
    await expect(incubators.reverseIncubatorSale("s1", "Manual")).rejects.toBe(denied);
  });

  it("report how many prices a sync changed", async () => {
    respond = () => ({ data: 3, error: null });
    expect(await incubators.syncIncubatorPrices("i1")).toBe(3);
    respond = () => ({ data: null, error: null });
    expect(await incubators.syncIncubatorPrices("i1")).toBe(0);
  });
});
