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
    for (const options of [q.settings("b1"), q.carts("b1")]) {
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
    await carts.fetchAbandonedCarts("b1");
    for (const request of requests) expect(eqs(request)).toEqual([["brand_id", "b1"]]);
    // Each cart with its customer and the order it became (what a recovery brought in).
    expect(requests[1].select).toBe(
      "*, customers(name, email, phone), orders(total, status, currency)",
    );
    expect(requests[1].filters).toContainEqual(["limit", 200]);
    // Nothing reads the tables of an automatic sender that never existed.
    expect(requests.map((r) => r.table)).toEqual([
      "brand_abandoned_cart_settings",
      "abandoned_carts",
    ]);
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
    await expect(carts.fetchAbandonedCarts("b1")).rejects.toBe(denied);
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

  it("refresh only the part of the screen that changed", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await carts.invalidateAbandonedCartSettings(qc, "b1");
    await carts.invalidateAbandonedCarts(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      ["abandoned-carts", "b1", "settings"],
      ["abandoned-carts", "b1", "carts"],
    ]);
  });
});
