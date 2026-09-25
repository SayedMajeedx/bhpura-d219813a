import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in these data-layer tests");
});

type Request = {
  table: string;
  select?: string;
  args?: unknown;
  filters: Array<[string, ...unknown[]]>;
};
type Reply = { data?: unknown; error: unknown; count?: number | null };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });

function builder(table: string) {
  const request: Request = { table, filters: [] };
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
    order: record("order"),
    limit: record("limit"),
    maybeSingle: () => chain,
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

const db = {
  from: (table: string) => builder(table),
  rpc: (fn: string, args: unknown) => {
    const request: Request = { table: fn, args, filters: [] };
    requests.push(request);
    return Promise.resolve(respond(request));
  },
};
const client = { supabase: db, publicSupabase: db };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);
vi.mock("@/lib/reporting.functions", () => ({ fetchCatalogInquiriesReporting: vi.fn() }));

const customers = await import("../src/lib/data/customers");
const storefront = await import("../src/lib/data/storefront");
const returns = await import("../src/lib/data/returns");
const reporting = await import("../src/lib/data/reporting");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);
const denied = { message: "denied", code: "42501" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("the shopper's orders", () => {
  it("read the latest 100 of their orders in this brand, newest first", async () => {
    await customers.fetchOwnOrders("b1", "c1");
    expect(requests[0].table).toBe("orders");
    expect(filters(requests[0], "eq")).toEqual([
      ["brand_id", "b1"],
      ["customer_id", "c1"],
    ]);
    expect(filters(requests[0], "order")).toEqual([["created_at", { ascending: false }]]);
    expect(filters(requests[0], "limit")).toEqual([[100]]);
  });

  it("sit with the shopper's other records and wait for a customer", () => {
    expect(customers.customersKeys.ownOrders("b1", "c1").slice(0, 3)).toEqual(
      customers.customersKeys.own("b1"),
    );
    expect(customers.ownCustomerQueries.orders("b1", undefined).enabled).toBe(false);
  });
});

describe("the thank-you page's order lookup", () => {
  it("reads how the order is fulfilled, under the store's key", async () => {
    respond = () => ({ data: null, error: null });
    expect(await storefront.fetchOrderConfirmation("o1")).toBeNull();
    expect(requests[0].select).toBe("fulfillment_method, digital_delivery_channel");
    expect(filters(requests[0], "eq")).toEqual([["id", "o1"]]);
    expect(storefront.storefrontQueries.orderConfirmation("pura", "o1").queryKey).toEqual([
      "storefront",
      "pura",
      "order",
      "o1",
    ]);
  });
});

describe("returns", () => {
  it("count the brand's returns that still need action, reading a failure as zero", async () => {
    respond = () => ({ count: 3, error: null });
    expect(await returns.fetchPendingReturnsCount("b1")).toBe(3);
    expect(filters(requests[0], "in")).toEqual([["status", returns.PENDING_RETURN_STATUSES]]);
    respond = () => ({ count: null, error: denied });
    expect(await returns.fetchPendingReturnsCount("b1")).toBe(0);
  });

  it("list one order's returns within the brand, reading a failure as none", async () => {
    await returns.fetchOrderReturns("b1", "o1");
    expect(filters(requests[0], "eq")).toEqual([
      ["brand_id", "b1"],
      ["order_id", "o1"],
    ]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    respond = () => ({ data: null, error: denied });
    expect(await returns.fetchOrderReturns("b1", "o1")).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    respond = () => ({ data: null, error: { message: "jwt expired", code: "PGRST301" } });
    expect(await returns.fetchOrderReturns("b1", "o1")).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("do not look up returns for an unsaved order", () => {
    expect(returns.returnsQueries.forOrder("b1", "new").enabled).toBe(false);
  });
});

describe("reporting", () => {
  it("keep the key values the packaging tab and realtime refresh invalidate", () => {
    expect(reporting.reportingKeys.overview("pura", "a", "b", "tz").slice(0, 2)).toEqual([
      "dashboard-reporting-overview",
      "pura",
    ]);
    expect(reporting.reportingKeys.previousOverview("pura", "a", "b", "tz").slice(0, 2)).toEqual([
      "dashboard-reporting-overview-previous",
      "pura",
    ]);
  });

  it("read 60 days of daily incubator sales and name the fields for the charts", async () => {
    respond = () => ({
      data: { timeseries: [{ time_bucket: "2026-09-01", gross_amount: 12, sale_count: 2 }] },
      error: null,
    });
    const now = new Date("2026-09-25T12:00:00Z");
    const rows = await reporting.fetchIncubatorSales("pura", 60, now, "Asia/Bahrain");
    expect(requests[0]).toMatchObject({
      table: "rpc_reporting_incubator_sales",
      args: {
        p_end_date: now.toISOString(),
        p_tz: "Asia/Bahrain",
        p_interval: "day",
        p_brand_slug: "pura",
      },
    });
    expect((requests[0].args as { p_start_date: string }).p_start_date.slice(0, 10)).toBe(
      "2026-07-27",
    );
    expect(rows).toEqual([
      {
        time_bucket: "2026-09-01",
        gross_amount: 12,
        sale_count: 2,
        sold_at: "2026-09-01",
        quantity: 2,
      },
    ]);
  });

  it("throw when the sales report fails", async () => {
    respond = () => ({ data: null, error: denied });
    await expect(reporting.fetchIncubatorSales("pura", 60)).rejects.toBe(denied);
  });
});
