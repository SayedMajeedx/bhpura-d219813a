import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in promo code data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "rpc";
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
  const write = (op: Request["op"]) => (payload?: unknown) => {
    request.op = op;
    request.payload = payload;
    return chain;
  };
  const chain = {
    select: () => chain,
    insert: write("insert"),
    update: write("update"),
    delete: write("delete"),
    eq: record("eq"),
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

const promo = await import("../src/lib/data/promo-codes");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("promo code list", () => {
  it("reads the brand's codes newest first, under a list key the page updates in place", async () => {
    await promo.fetchPromoCodes("b1");
    expect(filters(requests[0], "eq")).toEqual([["brand_id", "b1"]]);
    expect(filters(requests[0], "order")).toEqual([["created_at", { ascending: false }]]);
    expect(promo.promoCodesQueries.list("b1").queryKey).toEqual(["promo-codes", "b1", "list"]);
  });

  it("refreshes every promo list of the brand after a write", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await promo.invalidatePromoCodes(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["promo-codes", "b1"]]);
  });
});

describe("promo code writes", () => {
  it("scope creates, updates and deletes by brand", async () => {
    await promo.createPromoCode("b1", { code: "EID", brand_id: "other" });
    await promo.updatePromoCode("b1", "p1", { is_active: false });
    await promo.deletePromoCode("b1", "p1");
    expect(requests[0].payload).toEqual({ code: "EID", brand_id: "b1" });
    for (const request of requests.slice(1)) {
      expect(filters(request, "eq")).toEqual([
        ["id", "p1"],
        ["brand_id", "b1"],
      ]);
    }
  });

  it("keep the Postgres code so a duplicate can be told apart", async () => {
    const duplicate = { message: "duplicate key", code: "23505" };
    respond = () => ({ error: duplicate });
    await expect(promo.createPromoCode("b1", { code: "EID" })).rejects.toBe(duplicate);
  });
});

describe("validatePromoCode", () => {
  it("sends the basket and leaves a missing customer to the function's null default", async () => {
    respond = () => ({ data: { valid: true, code: "EID", discount_amount: 2.5 }, error: null });
    const result = await promo.validatePromoCode({
      brandSlug: "pura",
      code: "EID",
      subtotal: 25,
      items: [{ variant_id: "v1", line_total: 25 }],
      customerId: null,
    });
    expect(result).toEqual({ valid: true, code: "EID", discount_amount: 2.5 });
    expect(requests[0]).toMatchObject({
      table: "validate_promo_code",
      payload: {
        p_brand_slug: "pura",
        p_code: "EID",
        p_subtotal: 25,
        p_items: [{ variant_id: "v1", line_total: 25 }],
        p_customer_id: undefined,
      },
    });
  });

  it("passes a known customer and throws when the check fails", async () => {
    await promo.validatePromoCode({
      brandSlug: "pura",
      code: "EID",
      subtotal: 25,
      items: [],
      customerId: "c1",
    });
    expect((requests[0].payload as { p_customer_id: string }).p_customer_id).toBe("c1");
    const denied = { message: "denied" };
    respond = () => ({ data: null, error: denied });
    await expect(
      promo.validatePromoCode({ brandSlug: "pura", code: "X", subtotal: 1, items: [] }),
    ).rejects.toBe(denied);
  });
});
