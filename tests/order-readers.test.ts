import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in order-reader tests");
});

type Request = { table: string; select: string; filters: Array<[string, ...unknown[]]> };
type Reply = { data: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });

function builder(table: string) {
  const request: Request = { table, select: "", filters: [] };
  requests.push(request);
  const record =
    (kind: string) =>
    (...args: unknown[]) => (request.filters.push([kind, ...args]), chain);
  const chain = {
    select(columns: string) {
      request.select = columns;
      return chain;
    },
    eq: record("eq"),
    in: record("in"),
    not: record("not"),
    gte: record("gte"),
    or: record("or"),
    order: record("order"),
    limit: record("limit"),
    maybeSingle: () => chain,
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

const client = { supabase: { from: (table: string) => builder(table) } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const orders = await import("../src/lib/data/orders");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);
const denied = { message: "denied" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("reader keys", () => {
  it("sit under the brand's orders prefix, so invalidateOrders refreshes them", () => {
    const keys = [
      orders.ordersQueries.customerMetrics("b1").queryKey,
      orders.ordersQueries.customerOrders("b1", "c1").queryKey,
      orders.ordersQueries.promoOrders("b1").queryKey,
      orders.ordersQueries.variantSales("b1", 45).queryKey,
      orders.ordersQueries.exportRows("b1").queryKey,
      orders.ordersQueries.story("b1", "o1").queryKey,
      orders.ordersQueries.invoiceNumber("b1", "o1").queryKey,
    ];
    expect(new Set(keys.map((k) => JSON.stringify(k))).size).toBe(keys.length);
    for (const key of keys) expect(key.slice(0, 2)).toEqual(orders.ordersKeys.all("b1"));
    // Never on the lists branch, which in-place updates assume holds only queue arrays.
    for (const key of keys) expect(key[2]).not.toBe("list");
  });

  it("stay idle until they know what to read", () => {
    expect(orders.ordersQueries.story("b1", "").enabled).toBe(false);
    expect(orders.ordersQueries.invoiceNumber("", "o1").enabled).toBe(false);
    expect(orders.ordersQueries.customerOrders("b1", "").enabled).toBe(false);
  });
});

describe("readers", () => {
  it("scope every read by brand", async () => {
    await orders.fetchCustomerMetricOrders("b1");
    await orders.fetchCustomerOrders("b1", "c1");
    await orders.fetchPromoOrders("b1");
    await orders.fetchOrdersForExport("b1");
    await orders.fetchOrderForStory("b1", "o1");
    await orders.fetchOrderInvoiceNumber("b1", "o1");
    await orders.fetchInvoiceNumbers("b1", ["o1"]);
    await orders.searchOrders("b1", "sara");
    for (const request of requests) {
      expect(request.table).toBe("orders");
      expect(filters(request, "eq")[0]).toEqual(["brand_id", "b1"]);
    }
  });

  it("list a customer's orders newest first", async () => {
    await orders.fetchCustomerOrders("b1", "c1");
    expect(filters(requests[0], "eq")).toEqual([
      ["brand_id", "b1"],
      ["customer_id", "c1"],
    ]);
    expect(filters(requests[0], "order")).toEqual([["created_at", { ascending: false }]]);
  });

  it("read only orders that used a promo code", async () => {
    await orders.fetchPromoOrders("b1");
    expect(filters(requests[0], "not")).toEqual([["promo_code_id", "is", null]]);
  });

  it("read sold orders of the last N days", async () => {
    await orders.fetchVariantSales("b1", 45, new Date("2026-09-25T12:00:00Z"));
    expect(filters(requests[0], "in")).toEqual([["status", orders.SOLD_ORDER_STATUSES]]);
    const [[column, since]] = filters(requests[0], "gte") as [[string, string]];
    expect(column).toBe("created_at");
    expect(since.slice(0, 10)).toBe("2026-08-11");
  });

  it("search by invoice number or name for a number, by name or phone otherwise", async () => {
    await orders.searchOrders("b1", "1042");
    await orders.searchOrders("b1", "sara");
    expect(filters(requests[0], "or")).toEqual([
      ["invoice_number.eq.1042,customer_name_snapshot.ilike.%1042%"],
    ]);
    expect(filters(requests[1], "or")).toEqual([
      ["customer_name_snapshot.ilike.%sara%,customer_phone_snapshot.ilike.%sara%"],
    ]);
    expect(filters(requests[1], "limit")).toEqual([[6]]);
  });

  it("throw on error where the screen shows an error state", async () => {
    respond = () => ({ data: null, error: denied });
    await expect(orders.fetchCustomerMetricOrders("b1")).rejects.toBe(denied);
    await expect(orders.fetchCustomerOrders("b1", "c1")).rejects.toBe(denied);
    await expect(orders.fetchPromoOrders("b1")).rejects.toBe(denied);
    await expect(orders.fetchVariantSales("b1", 45)).rejects.toBe(denied);
  });

  it("read a failure as empty where the screen falls back", async () => {
    respond = () => ({ data: null, error: denied });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await orders.fetchOrdersForExport("b1")).toEqual([]);
    expect(await orders.fetchOrderForStory("b1", "o1")).toBeNull();
    expect(await orders.fetchOrderInvoiceNumber("b1", "o1")).toBeNull();
    expect(await orders.fetchInvoiceNumbers("b1", ["o1"])).toEqual([]);
    expect(await orders.searchOrders("b1", "x")).toEqual([]);
    warn.mockRestore();
    log.mockRestore();
  });
});
