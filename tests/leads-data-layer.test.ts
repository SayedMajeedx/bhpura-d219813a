import { beforeEach, describe, expect, it, vi } from "vitest";

// The sign-ups page's reads and writes: scoped by brand, read to the end of the list, and a
// write that changed nothing is an error, not a quiet success.

vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in leads data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "update" | "delete";
  payload?: unknown;
  filters: Array<[string, ...unknown[]]>;
};
const requests: Request[] = [];
let respond: (request: Request) => { data?: unknown; error: unknown } = () => ({
  data: [],
  error: null,
});

function builder(table: string) {
  const request: Request = { table, op: "select", filters: [] };
  requests.push(request);
  const record =
    (kind: string) =>
    (...args: unknown[]) => (request.filters.push([kind, ...args]), chain);
  const chain = {
    select: record("select"),
    update(payload: unknown) {
      request.op = "update";
      request.payload = payload;
      return chain;
    },
    delete() {
      request.op = "delete";
      return chain;
    },
    eq: record("eq"),
    in: record("in"),
    order: record("order"),
    range: record("range"),
    then(resolve: (reply: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}
const client = { supabase: { from: (table: string) => builder(table) } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);
const catalog = { catalogInsightKeys: { backInStockCount: (id: string) => ["count", id] } };
vi.mock("../src/lib/data/catalog", () => catalog);
vi.mock("@/lib/data/catalog", () => catalog);

const leads = await import("../src/lib/data/leads");
const of = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);
const denied = { message: "permission denied" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("reading what shoppers left", () => {
  it("reads the brand's requests and sign-ups, newest first, to the end of the list", async () => {
    await leads.fetchBackInStockRequests("b1");
    await leads.fetchNewsletterSubscribers("b1");
    expect(requests.map((request) => request.table)).toEqual([
      "back_in_stock_requests",
      "newsletter_subscribers",
    ]);
    for (const request of requests) {
      expect(of(request, "eq")).toEqual([["brand_id", "b1"]]);
      expect(of(request, "order")).toEqual([["created_at", { ascending: false }], ["id"]]);
      expect(of(request, "range")).toEqual([[0, 999]]);
    }
  });

  it("throws a failed read", async () => {
    respond = () => ({ data: null, error: denied });
    await expect(leads.fetchBackInStockRequests("b1")).rejects.toBe(denied);
  });
});

describe("answering a request", () => {
  it("marks requests as told, or as waiting again, within the brand", async () => {
    respond = () => ({ data: [{ id: "r1" }, { id: "r2" }], error: null });
    expect(await leads.setBackInStockTold("b1", ["r1", "r2"])).toBe(2);
    const [told] = requests;
    expect(told.op).toBe("update");
    expect((told.payload as { notified_at: string }).notified_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(of(told, "eq")).toEqual([["brand_id", "b1"]]);
    expect(of(told, "in")).toEqual([["id", ["r1", "r2"]]]);

    await leads.setBackInStockTold("b1", ["r1"], false);
    expect(requests[1].payload).toEqual({ notified_at: null });
  });

  it("is an error when nothing was changed, and asks nothing for an empty list", async () => {
    await expect(leads.setBackInStockTold("b1", ["r1"])).rejects.toThrow("REQUESTS_NOT_FOUND");
    requests.length = 0;
    expect(await leads.setBackInStockTold("b1", [])).toBe(0);
    await leads.deleteBackInStockRequests("b1", []);
    expect(requests).toEqual([]);
  });

  it("removes a request or a sign-up within the brand", async () => {
    await leads.deleteBackInStockRequests("b1", ["r1"]);
    await leads.deleteNewsletterSubscriber("b1", "s1");
    expect(requests.map((request) => [request.table, request.op])).toEqual([
      ["back_in_stock_requests", "delete"],
      ["newsletter_subscribers", "delete"],
    ]);
    expect(of(requests[0], "eq")).toEqual([["brand_id", "b1"]]);
    expect(of(requests[1], "eq")).toEqual([
      ["brand_id", "b1"],
      ["id", "s1"],
    ]);
    respond = () => ({ error: denied });
    await expect(leads.deleteNewsletterSubscriber("b1", "s1")).rejects.toBe(denied);
  });
});
