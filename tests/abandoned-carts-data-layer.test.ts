import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in abandoned-cart data-layer tests");
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

const client = { supabase: { from: (table: string) => builder(table) } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const carts = await import("../src/lib/data/abandoned-carts");
const { DEFAULT_ABANDONED_SEQUENCES } = await import("../src/lib/abandoned-carts.types");

const denied = { message: "denied" };
const eqs = (request: Request) =>
  request.filters.filter(([k]) => k === "eq").map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("the abandoned-carts screen's reads", () => {
  it("sit under the brand's prefix and wait for a brand", () => {
    const q = carts.abandonedCartsQueries;
    for (const options of [
      q.settings("b1"),
      q.sequences("b1"),
      q.carts("b1"),
      q.dispatchLogs("b1"),
    ]) {
      expect(options.queryKey.slice(0, 2)).toEqual(["abandoned-carts", "b1"]);
    }
    expect(q.carts("").enabled).toBe(false);
  });

  it("read each table for the brand, in the screen's order and limits", async () => {
    respond = (request) => ({
      data: request.table === "brand_abandoned_cart_settings" ? null : [],
      error: null,
    });
    expect(await carts.fetchAbandonedCartSettings("b1")).toBeNull();
    await carts.fetchRecoverySequences("b1");
    await carts.fetchAbandonedCarts("b1");
    await carts.fetchDispatchLogs("b1");
    for (const request of requests) expect(eqs(request)).toEqual([["brand_id", "b1"]]);
    expect(requests[1].filters).toContainEqual(["order", "step_number", { ascending: true }]);
    expect(requests[2].select).toBe("*, customers(name, email, phone)");
    expect(requests[2].filters).toContainEqual(["limit", 200]);
    expect(requests[3].filters).toContainEqual(["order", "sent_at", { ascending: false }]);
    expect(requests[3].filters).toContainEqual(["limit", 100]);
  });

  it("list only carts that still hold items", async () => {
    respond = () => ({
      data: [
        { id: "c1", cart_items: [{ product_id: "p1" }] },
        { id: "c2", cart_items: [] },
        { id: "c3", cart_items: null },
      ],
      error: null,
    });
    expect((await carts.fetchAbandonedCarts("b1")).map((c) => c.id)).toEqual(["c1"]);
  });

  it("throw a failed read", async () => {
    respond = () => ({ data: null, error: denied });
    await expect(carts.fetchDispatchLogs("b1")).rejects.toBe(denied);
    await expect(carts.fetchAbandonedCartSettings("b1")).rejects.toBe(denied);
  });
});

describe("the abandoned-carts screen's writes", () => {
  it("save the settings of the brand passed, one row per brand", async () => {
    await carts.saveAbandonedCartSettings("b1", { is_enabled: false, brand_id: "other" });
    expect(requests[0]).toMatchObject({
      table: "brand_abandoned_cart_settings",
      op: "upsert",
      payload: { is_enabled: false, brand_id: "b1" },
      options: { onConflict: "brand_id" },
    });
    expect((requests[0].payload as { updated_at: string }).updated_at).toMatch(/^\d{4}-/);
  });

  it("create the default steps and save one step, matched by step number", async () => {
    await carts.createDefaultRecoverySequences("b1");
    const defaults = requests[0].payload as Array<{ brand_id: string; step_number: number }>;
    expect(defaults).toHaveLength(DEFAULT_ABANDONED_SEQUENCES.length);
    expect(defaults.every((row) => row.brand_id === "b1")).toBe(true);
    expect(requests[0].options).toEqual({ onConflict: "brand_id,step_number" });

    const step = {
      ...DEFAULT_ABANDONED_SEQUENCES[0],
      id: "s1",
      brand_id: "b1",
      created_at: "",
      updated_at: "",
    };
    await carts.saveRecoverySequence("b1", step);
    expect(requests[1]).toMatchObject({
      table: "abandoned_cart_sequences",
      payload: { id: "s1", brand_id: "b1", step_number: step.step_number },
      options: { onConflict: "brand_id,step_number" },
    });

    respond = () => ({ error: denied });
    await expect(carts.saveRecoverySequence("b1", step)).rejects.toBe(denied);
  });

  it("refresh only the part of the screen that changed", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await carts.invalidateAbandonedCartSettings(qc, "b1");
    await carts.invalidateRecoverySequences(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      ["abandoned-carts", "b1", "settings"],
      ["abandoned-carts", "b1", "sequences"],
    ]);
  });
});
