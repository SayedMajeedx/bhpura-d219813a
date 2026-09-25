import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in finance data-layer tests");
});

/** A stand-in for the Supabase query builder that records each request. */
type Request = {
  table: string;
  select: string;
  filters: Array<[string, ...unknown[]]>;
  write?: { kind: "update" | "insert" | "delete"; payload?: unknown };
};
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
    gte: record("gte"),
    lt: record("lt"),
    order: record("order"),
    limit: record("limit"),
    update: (payload: unknown) => ((request.write = { kind: "update", payload }), chain),
    insert: (payload: unknown) => ((request.write = { kind: "insert", payload }), chain),
    delete: () => ((request.write = { kind: "delete" }), chain),
    maybeSingle: () => Promise.resolve(respond(request)),
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
const expenses = await import("../src/lib/data/expenses");
const settings = await import("../src/lib/data/business-settings");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("one key per shape", () => {
  it("gives every finance read its own key under the brand", () => {
    const keys = [
      orders.ordersQueries.finance("b1").queryKey,
      orders.ordersQueries.recent("b1", 5).queryKey,
      orders.ordersQueries.reconciliation("b1", 20).queryKey,
      orders.ordersQueries.cogs("b1", "2026-09-01", "2026-09-30").queryKey,
      orders.ordersQueries.list("b1", "office").queryKey,
    ];
    expect(new Set(keys.map((k) => JSON.stringify(k))).size).toBe(keys.length);
    // All under the brand's orders, so one order write refreshes every view.
    for (const key of keys) expect(key.slice(0, 2)).toEqual(["orders", "b1"]);
  });

  it("reads the whole settings row and every expense with its vendor", () => {
    expect(settings.businessSettingsKeys.detail("b1")).toEqual(["business-settings", "b1"]);
    expect(expenses.EXPENSE_SELECT).toBe("*, vendors(name)");
    expect(expenses.expensesQueries.list("b1").queryKey.slice(0, 2)).toEqual(["expenses", "b1"]);
  });

  it("includes what the cash-flow statement needs in the finance orders", () => {
    expect(orders.ORDER_FINANCE_SELECT).toContain("reconciliation_status");
    expect(orders.ORDER_FINANCE_SELECT).toContain("packaging_cost_snapshot");
  });
});

describe("finance order reads", () => {
  it("scope every read by brand, newest first", async () => {
    await orders.fetchFinanceOrders("b1");
    await orders.fetchRecentOrders("b1", 5);
    await orders.fetchReconciliationOrders("b1", 20);
    for (const request of requests) {
      expect(filters(request, "eq")).toContainEqual(["brand_id", "b1"]);
      expect(filters(request, "order")).toContainEqual(["created_at", { ascending: false }]);
    }
    expect(filters(requests[1], "limit")).toEqual([[5]]);
    expect(filters(requests[2], "limit")).toEqual([[20]]);
  });

  it("counts only sold orders for COGS and includes the whole last day", async () => {
    await orders.fetchCogsOrders("b1", "2026-09-01", "2026-09-30");
    const [request] = requests;
    expect(filters(request, "in")).toEqual([["status", orders.COGS_ORDER_STATUSES]]);
    expect(filters(request, "gte")).toEqual([["created_at", "2026-09-01"]]);
    expect(filters(request, "lt")).toEqual([["created_at", "2026-10-01"]]);
  });

  it("leaves an empty COGS range open", async () => {
    await orders.fetchCogsOrders("b1", "", "");
    expect(filters(requests[0], "gte")).toEqual([]);
    expect(filters(requests[0], "lt")).toEqual([]);
  });
});

describe("business settings", () => {
  it("returns the row, or null for a brand without one", async () => {
    respond = () => ({ data: { brand_id: "b1", currency: "BHD" }, error: null });
    expect(await settings.fetchBusinessSettings("b1")).toEqual({ brand_id: "b1", currency: "BHD" });
    respond = () => ({ data: null, error: null });
    expect(await settings.fetchBusinessSettings("b1")).toBeNull();
    expect(requests[0].select).toBe("*");
  });
});

describe("expenses", () => {
  it("lists the brand's expenses newest first", async () => {
    await expenses.fetchExpenses("b1");
    expect(filters(requests[0], "eq")).toEqual([["brand_id", "b1"]]);
    expect(filters(requests[0], "order")).toEqual([["expense_date", { ascending: false }]]);
  });

  it("writes scoped to the brand and throws on failure", async () => {
    await expenses.updateExpense("b1", "e1", { amount: 5 });
    await expenses.deleteExpense("b1", "e1");
    for (const request of requests) {
      expect(filters(request, "eq")).toEqual([
        ["id", "e1"],
        ["brand_id", "b1"],
      ]);
    }
    respond = () => ({ data: null, error: new Error("denied") });
    await expect(
      expenses.createExpense({ brand_id: "b1", user_id: "u1", category: "Rent" }),
    ).rejects.toThrow("denied");
  });

  it("refresh every expenses view of the brand together", () => {
    const invalidateQueries = vi.fn();
    expenses.invalidateExpenses({ invalidateQueries } as never, "b1");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["expenses", "b1"] });
  });
});
