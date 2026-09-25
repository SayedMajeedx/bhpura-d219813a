import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in returns data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "upsert";
  payload?: unknown;
  options?: unknown;
  select?: string;
  filters: Array<[string, ...unknown[]]>;
};
type Reply = { data?: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: null, error: null });

function builder(table: string) {
  const request: Request = { table, op: "select", filters: [] };
  requests.push(request);
  const record =
    (kind: string) =>
    (...args: unknown[]) => (request.filters.push([kind, ...args]), chain);
  const chain = {
    select(columns: string) {
      request.select = columns;
      return chain;
    },
    upsert(payload: unknown, options: unknown) {
      request.op = "upsert";
      request.payload = payload;
      request.options = options;
      return chain;
    },
    eq: record("eq"),
    order: record("order"),
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

const returns = await import("../src/lib/data/returns");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);
const denied = { message: "denied" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: null, error: null });
});

describe("the return policy", () => {
  it("is one read under the brand's returns prefix, shared by the editor, checklist and storefront", async () => {
    expect(returns.returnsQueries.policy("b1").queryKey).toEqual(["returns", "b1", "policy"]);
    expect(await returns.fetchReturnPolicy("b1")).toBeNull();
    expect(filters(requests[0], "eq")).toEqual([["brand_id", "b1"]]);
    respond = () => ({ data: null, error: denied });
    await expect(returns.fetchReturnPolicy("b1")).rejects.toBe(denied);
  });

  it("is saved for the brand passed, creating it when missing", async () => {
    await returns.saveReturnPolicy("b1", { return_window_days: 7 });
    expect(requests[0]).toMatchObject({
      table: "brand_return_policies",
      op: "upsert",
      payload: { return_window_days: 7, brand_id: "b1" },
      options: { onConflict: "brand_id" },
    });
    respond = () => ({ error: denied });
    await expect(returns.saveReturnPolicy("b1", {})).rejects.toBe(denied);
  });

  it("refreshes everything about the brand's returns after a save", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await returns.invalidateReturns(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["returns", "b1"]]);
  });
});

describe("the shopper's returns", () => {
  it("read their returns in the brand, newest first, and wait for a customer", async () => {
    respond = () => ({ data: [], error: null });
    await returns.fetchCustomerReturns("b1", "c1");
    expect(filters(requests[0], "eq")).toEqual([
      ["brand_id", "b1"],
      ["customer_id", "c1"],
    ]);
    expect(filters(requests[0], "order")).toEqual([["created_at", { ascending: false }]]);
    expect(returns.returnsQueries.customer("b1", "").enabled).toBe(false);
  });
});
