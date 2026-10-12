import { beforeEach, describe, expect, it, vi } from "vitest";

// The readers a screen takes for the whole list, against a server that answers a range with at
// most 1,000 rows (as the API does): each returns every row, keeps its filters on every page, and
// asks in a fixed order.

vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in whole-list reader tests");
});

const SERVER_LIMIT = 1000;

type Call = [string, ...unknown[]];
type Request = { table: string; select?: string; counted: boolean; calls: Call[] };

const requests: Request[] = [];
let tables: Record<string, unknown[]> = {};

function builder(table: string) {
  const request: Request = { table, counted: false, calls: [] };
  requests.push(request);
  const record =
    (kind: string) =>
    (...args: unknown[]) => (request.calls.push([kind, ...args]), chain);
  const chain = {
    select(columns: string, options?: { count?: string }) {
      request.select = columns;
      request.counted = options?.count === "exact";
      return chain;
    },
    eq: record("eq"),
    in: record("in"),
    not: record("not"),
    gt: record("gt"),
    gte: record("gte"),
    lte: record("lte"),
    lt: record("lt"),
    or: record("or"),
    order: record("order"),
    limit: record("limit"),
    range: record("range"),
    then(resolve: (reply: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      const rows = tables[table] ?? [];
      const range = request.calls.find(([kind]) => kind === "range") as
        [string, number, number] | undefined;
      const from = range ? range[1] : 0;
      const to = range ? range[2] : rows.length - 1;
      const limit = request.calls.find(([kind]) => kind === "limit") as
        [string, number] | undefined;
      const asked = limit ? Math.min(to + 1, from + limit[1]) : to + 1;
      const data = rows.slice(from, Math.min(asked, from + SERVER_LIMIT));
      const reply = { data, error: null, count: request.counted ? rows.length : null, status: 200 };
      return Promise.resolve(reply).then(resolve, reject);
    },
  };
  return chain;
}

const fake = {
  from: (table: string) => builder(table),
  auth: { getUser: async () => ({ data: { user: { id: "courier-1" } } }) },
};
const client = { supabase: fake, publicSupabase: fake };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const catalog = await import("../src/lib/data/catalog");
const customers = await import("../src/lib/data/customers");
const orders = await import("../src/lib/data/orders");
const bookings = await import("../src/lib/data/bookings");
const storefront = await import("../src/lib/data/storefront/queries");
const incubators = await import("../src/lib/data/incubators");

const rows = (length: number, make: (index: number) => Record<string, unknown>) =>
  Array.from({ length }, (_, index) => make(index));
const callsOf = (request: Request, kind: string) =>
  request.calls.filter(([k]) => k === kind).map(([, ...rest]) => rest);
const to = (table: string) => requests.filter((request) => request.table === table);

beforeEach(() => {
  requests.length = 0;
  tables = {};
});

describe("the admin catalog", () => {
  it("reads every variant and its cost past the row limit", async () => {
    tables.product_variants = rows(2300, (i) => ({ id: `v${i}`, product_id: "p1", stock_main: 1 }));
    tables.variant_costs = rows(2300, (i) => ({ variant_id: `v${i}`, cost_price: i + 1 }));

    const variants = await catalog.fetchAdminVariants("b1");

    expect(variants).toHaveLength(2300);
    expect(new Set(variants.map((variant) => variant.id)).size).toBe(2300);
    // The last variant's cost is its own, not the zero a cut list would leave.
    expect(variants[2299]).toMatchObject({ id: "v2299", cost_price: 2300 });
    for (const request of [...to("product_variants"), ...to("variant_costs")]) {
      expect(request.counted).toBe(true);
      expect(callsOf(request, "eq")).toContainEqual(["brand_id", "b1"]);
    }
    expect(to("product_variants").map((request) => callsOf(request, "range")[0])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    // A fixed order that ends on the id: a row cannot sit on two pages.
    expect(callsOf(to("product_variants")[0], "order").map(([column]) => column)).toEqual([
      "created_at",
      "id",
    ]);
  });

  it("asks once for a store's list that fits", async () => {
    tables.products = rows(33, (i) => ({ id: `p${i}`, media: [], custom_fields: [] }));
    tables.product_costs = rows(33, (i) => ({ product_id: `p${i}`, cost_price: 4 }));
    expect(await catalog.fetchAdminProducts("b1")).toHaveLength(33);
    expect(to("products")).toHaveLength(1);
    expect(to("product_costs")).toHaveLength(1);
  });
});

describe("customers and orders", () => {
  it("reads every customer for the duplicate check and the list", async () => {
    tables.customers = rows(1500, (i) => ({ id: `c${i}`, phone: `9733${i}`, email: null }));
    expect(await customers.fetchCustomerIdentities("b1")).toHaveLength(1500);
    expect(await customers.fetchCustomers("b1")).toHaveLength(1500);
  });

  it("keeps a courier's filters on every page of the orders list", async () => {
    tables.orders = rows(1200, (i) => ({ id: `o${i}` }));
    const list = await orders.fetchOrderList("b1", "assigned-courier");
    expect(list).toHaveLength(1200);
    expect(to("orders")).toHaveLength(2);
    for (const request of to("orders")) {
      expect(callsOf(request, "eq")).toEqual([
        ["brand_id", "b1"],
        ["assigned_to", "courier-1"],
        ["fulfillment_method", "delivery"],
      ]);
    }
  });

  it("keeps the dates of the cost-of-goods read apart from the page it asks for", async () => {
    tables.orders = rows(1100, (i) => ({ id: `o${i}` }));
    expect(await orders.fetchCogsOrders("b1", "2026-09-01", "2026-09-30")).toHaveLength(1100);
    for (const request of to("orders")) {
      expect(callsOf(request, "gte")).toEqual([["created_at", new Date(2026, 8, 1).toISOString()]]);
      expect(callsOf(request, "lt")).toEqual([["created_at", new Date(2026, 9, 1).toISOString()]]);
    }
    expect(to("orders").map((request) => callsOf(request, "range")[0])).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});

describe("bookings", () => {
  it("filters by the days asked for, not by the page", async () => {
    tables.bookings = rows(3, (i) => ({ id: `k${i}` }));
    await bookings.fetchBookingsInRange("b1", "2026-10-01", "2026-10-31");
    const [request] = to("bookings");
    expect(callsOf(request, "gte")).toEqual([["event_date", "2026-10-01"]]);
    expect(callsOf(request, "lte")).toEqual([["event_date", "2026-10-31"]]);
    expect(callsOf(request, "range")).toEqual([[0, 999]]);
  });
});

describe("the storefront", () => {
  const brand = { id: "b1", slug: "zh" };
  const product = (i: number) => ({ id: `p${i}`, product_variants: [] });

  it("shows every product of the store and of a category", async () => {
    tables.products = rows(1400, product);
    expect(await storefront.fetchStorefrontProducts("b1")).toHaveLength(1400);
    requests.length = 0;
    const inCategory = await storefront.fetchCategoryProducts(brand, {
      kind: "categories",
      values: ["abayas"],
    });
    expect(inCategory).toHaveLength(1400);
    for (const request of to("products")) {
      expect(callsOf(request, "in")).toEqual([["category", ["abayas"]]]);
      expect(callsOf(request, "eq")).toContainEqual(["is_active", true]);
    }
  });

  it("still shows only the latest sixty new arrivals, with one request", async () => {
    tables.products = rows(1400, product);
    const latest = await storefront.fetchCategoryProducts(brand, { kind: "new" });
    expect(latest).toHaveLength(60);
    expect(to("products")).toHaveLength(1);
    expect(callsOf(to("products")[0], "limit")).toEqual([[60]]);
  });
});

describe("partners", () => {
  it("reads every sale and every piece held", async () => {
    tables.incubator_sales = rows(1001, (i) => ({ id: `s${i}` }));
    tables.incubator_inventory = rows(1001, (i) => ({ id: `i${i}` }));
    expect(await incubators.fetchIncubatorSales("b1")).toHaveLength(1001);
    expect(await incubators.fetchIncubatorInventory("b1")).toHaveLength(1001);
  });
});
