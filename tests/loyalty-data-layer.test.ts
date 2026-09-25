import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in loyalty data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "upsert" | "rpc";
  payload?: unknown;
  options?: unknown;
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
    limit: record("limit"),
    maybeSingle: () => chain,
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

const loyalty = await import("../src/lib/data/loyalty");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);
const denied = { message: "denied" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("keys", () => {
  it("put everything of a brand under one prefix, so a manual adjustment refreshes the KPIs", async () => {
    const keys = [
      loyalty.loyaltyQueries.program("b1").queryKey,
      loyalty.loyaltyQueries.tiers("b1").queryKey,
      loyalty.loyaltyQueries.ledger("b1").queryKey,
      loyalty.loyaltyQueries.summary("b1").queryKey,
      loyalty.loyaltyQueries.account("b1", "c1").queryKey,
      loyalty.loyaltyQueries.customerLedger("b1", "c1").queryKey,
    ];
    expect(new Set(keys.map((k) => JSON.stringify(k))).size).toBe(keys.length);
    for (const key of keys) expect(key.slice(0, 2)).toEqual(["loyalty", "b1"]);

    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await loyalty.invalidateLoyalty(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["loyalty", "b1"]]);
  });

  it("wait for a customer before reading their account or history", () => {
    expect(loyalty.loyaltyQueries.account("b1", "").enabled).toBe(false);
    expect(loyalty.loyaltyQueries.customerLedger("b1", "").enabled).toBe(false);
  });
});

describe("reads", () => {
  it("scope every read by brand and keep each list's order", async () => {
    respond = () => ({ data: null, error: null });
    await loyalty.fetchLoyaltyProgram("b1");
    await loyalty.fetchLoyaltyTiers("b1");
    await loyalty.fetchLoyaltyTier("b1", "gold");
    await loyalty.fetchLoyaltyAccount("b1", "c1");
    await loyalty.fetchLoyaltyLedger("b1");
    await loyalty.fetchCustomerLoyaltyLedger("b1", "c1");
    for (const request of requests) expect(filters(request, "eq")[0]).toEqual(["brand_id", "b1"]);
    expect(filters(requests[1], "order")).toEqual([["min_spend", { ascending: true }]]);
    expect(filters(requests[2], "eq")[1]).toEqual(["tier_key", "gold"]);
    expect(filters(requests[3], "eq")[1]).toEqual(["customer_id", "c1"]);
    expect(requests[4].select).toBe("*, customers(name, email, phone)");
    expect(filters(requests[4], "limit")).toEqual([[200]]);
    expect(filters(requests[5], "limit")).toEqual([[50]]);
  });

  it("sum active and redeemed points across the brand's accounts", async () => {
    respond = () => ({
      data: [
        { active_points: 120, lifetime_spent_points: 30 },
        { active_points: 0, lifetime_spent_points: 0 },
        { active_points: 40, lifetime_spent_points: 10 },
      ],
      error: null,
    });
    expect(await loyalty.fetchLoyaltySummary("b1")).toEqual({
      totalActive: 160,
      totalRedeemed: 40,
      customerCount: 3,
    });
  });

  it("throw on error", async () => {
    respond = () => ({ data: null, error: denied });
    await expect(loyalty.fetchLoyaltyProgram("b1")).rejects.toBe(denied);
    await expect(loyalty.fetchLoyaltySummary("b1")).rejects.toBe(denied);
  });
});

describe("writes", () => {
  it("save the program for the brand passed, with a fresh updated_at", async () => {
    await loyalty.saveLoyaltyProgram("b1", { is_enabled: false });
    expect(requests[0]).toMatchObject({
      table: "brand_loyalty_programs",
      op: "upsert",
      options: { onConflict: "brand_id" },
    });
    expect(requests[0].payload).toMatchObject({ is_enabled: false, brand_id: "b1" });
    expect(typeof (requests[0].payload as { updated_at: string }).updated_at).toBe("string");
  });

  it("save tiers by brand and key", async () => {
    await loyalty.saveLoyaltyTiers("b1", [{ tier_key: "gold", name_ar: "ذهبي", name_en: "Gold" }]);
    expect(requests[0]).toMatchObject({
      table: "brand_loyalty_tiers",
      options: { onConflict: "brand_id,tier_key" },
      payload: [{ tier_key: "gold", name_ar: "ذهبي", name_en: "Gold", brand_id: "b1" }],
    });
    respond = () => ({ error: denied });
    await expect(loyalty.saveLoyaltyTiers("b1", [])).rejects.toBe(denied);
  });

  it("adjust points through the audited ledger function", async () => {
    await loyalty.adjustLoyaltyPoints({
      brandId: "b1",
      customerId: "c1",
      pointsDelta: -50,
      reasonAr: "تصحيح",
      reasonEn: "Correction",
    });
    expect(requests[0]).toMatchObject({
      table: "rpc_manual_adjust_loyalty_points",
      payload: {
        p_brand_id: "b1",
        p_customer_id: "c1",
        p_points_delta: -50,
        p_reason_ar: "تصحيح",
        p_reason_en: "Correction",
      },
    });
    respond = () => ({ data: null, error: denied });
    await expect(
      loyalty.adjustLoyaltyPoints({
        brandId: "b1",
        customerId: "c1",
        pointsDelta: 1,
        reasonAr: "x",
        reasonEn: "x",
      }),
    ).rejects.toBe(denied);
  });
});
