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
type Reply = { data?: unknown; count?: number; error: unknown };

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
    range: record("range"),
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
      incubators.incubatorsQueries.allocations("b1").queryKey,
      incubators.incubatorsQueries.movements("b1", "i1", 1, 20).queryKey,
      incubators.incubatorsQueries.movements("b1", "i1", 2, 20).queryKey,
      incubators.incubatorsQueries.summaries("b1", "2026-10-11", "Asia/Bahrain").queryKey,
      incubators.incubatorsQueries.orderHolds("b1").queryKey,
      incubators.incubatorsQueries.orderPickups("b1", "o1").queryKey,
      incubators.incubatorsQueries.partnerTotals("b1").queryKey,
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

  it("read what orders take from partners within the brand, for all orders or one", async () => {
    await incubators.fetchPartnerOrderHolds("b1");
    await incubators.fetchOrderPartnerPickups("b1", "o1");
    expect(requests.map((r) => r.table)).toEqual([
      "order_incubator_allocations",
      "order_incubator_allocations",
    ]);
    expect(filters(requests[0], "eq")).toEqual([["brand_id", "b1"]]);
    expect(filters(requests[1], "eq")).toEqual([
      ["brand_id", "b1"],
      ["order_id", "o1"],
    ]);
  });

  it("read a partner's history a page at a time, newest first, with the total", async () => {
    respond = () => ({ data: [{ id: "m1" }], count: 41, error: null });
    const page = await incubators.fetchIncubatorMovements({
      brandId: "b1",
      incubatorId: "i1",
      page: 3,
      pageSize: 20,
    });
    expect(page).toEqual({ rows: [{ id: "m1" }], total: 41 });
    expect(requests[0].table).toBe("incubator_movements");
    expect(filters(requests[0], "eq")).toEqual([
      ["brand_id", "b1"],
      ["incubator_id", "i1"],
    ]);
    expect(filters(requests[0], "order")[0]).toEqual(["occurred_at", { ascending: false }]);
    expect(filters(requests[0], "range")).toEqual([[40, 59]]);
  });

  it("read which sales each payment settled, through the payment's brand", async () => {
    respond = () => ({
      data: [{ payment_id: "p1", sale_id: "s1", amount: "4.500", incubator_payments: {} }],
      error: null,
    });
    expect(await incubators.fetchIncubatorPaymentAllocations("b1")).toEqual([
      { payment_id: "p1", sale_id: "s1", amount: 4.5 },
    ]);
    expect(requests[0].table).toBe("incubator_payment_allocations");
    expect(filters(requests[0], "eq")).toEqual([["incubator_payments.brand_id", "b1"]]);
  });

  it("ask the database for every partner's figures, as of the reader's own day", async () => {
    respond = () => ({ data: [{ incubator_id: "i1", due: 9.5 }], error: null });
    expect(await incubators.fetchIncubatorSummaries("b1", "2026-10-11", "Asia/Bahrain")).toEqual([
      { incubator_id: "i1", due: 9.5 },
    ]);
    expect(requests[0]).toMatchObject({
      table: "incubator_summaries",
      op: "rpc",
      payload: { p_brand_id: "b1", p_today: "2026-10-11", p_tz: "Asia/Bahrain" },
    });
  });

  it("read a whole catalog's variants by brand, not by a list of ids too long for an address", async () => {
    const many = Array.from({ length: incubators.BATCH_VARIANTS_ID_LIMIT + 1 }, (_, i) => `p${i}`);
    respond = (request) =>
      request.table === "product_variants"
        ? {
            data: [
              { id: "v1", product_id: "p3" },
              { id: "v2", product_id: "other" },
            ],
            error: null,
          }
        : { data: [], error: null };
    const rows = await incubators.fetchBatchTransferVariants("b1", many);
    expect(filters(requests[0], "in")).toEqual([]);
    expect(filters(requests[0], "eq")).toEqual([["brand_id", "b1"]]);
    // Only the wanted products' variants are kept.
    expect(rows.map((row) => row.id)).toEqual(["v1"]);
  });

  it("read the variants that say they have pieces at partners, by named columns", async () => {
    await incubators.fetchPartnerTotals("b1");
    expect(requests[0].table).toBe("product_variants");
    expect(requests[0].select).not.toContain("*");
    expect(filters(requests[0], "eq")).toEqual([["brand_id", "b1"]]);
    expect(filters(requests[0], "gt")).toEqual([["stock_incubator", 0]]);
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

  it("void a payment with its reason", async () => {
    await incubators.voidIncubatorPayment("pay1", "Recorded twice");
    expect(requests[0]).toMatchObject({
      table: "void_incubator_payment",
      op: "rpc",
      payload: { p_payment_id: "pay1", p_reason: "Recorded twice" },
    });
    respond = () => ({ data: null, error: denied });
    await expect(incubators.voidIncubatorPayment("pay1", "x")).rejects.toBe(denied);
  });

  it("send a batch of transfers in one call, and say how many pieces moved", async () => {
    respond = () => ({ data: 5, error: null });
    const pieces = await incubators.transferStockBatchToIncubator({
      incubatorId: "i1",
      notes: null,
      items: [
        {
          variantId: "v1",
          quantity: 2,
          externalCode: "SB-1",
          price: 30,
          commissionType: "percentage",
          commissionValue: 10,
        },
        {
          variantId: "v2",
          quantity: 3,
          externalCode: null,
          price: 12,
          commissionType: "fixed",
          commissionValue: 1,
        },
      ],
    });
    expect(pieces).toBe(5);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      table: "transfer_stock_to_incubator_batch",
      op: "rpc",
      payload: {
        p_incubator_id: "i1",
        p_notes: undefined,
        p_items: [
          {
            variant_id: "v1",
            quantity: 2,
            external_code: "SB-1",
            price: 30,
            commission_type: "percentage",
            commission_value: 10,
          },
          {
            variant_id: "v2",
            quantity: 3,
            external_code: "",
            price: 12,
            commission_type: "fixed",
            commission_value: 1,
          },
        ],
      },
    });
  });

  it("report how many prices a sync changed", async () => {
    respond = () => ({ data: 3, error: null });
    expect(await incubators.syncIncubatorPrices("i1")).toBe(3);
    respond = () => ({ data: null, error: null });
    expect(await incubators.syncIncubatorPrices("i1")).toBe(0);
  });
});
