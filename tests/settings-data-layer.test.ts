import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in settings data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "update" | "upsert";
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
    update(payload: unknown) {
      request.op = "update";
      request.payload = payload;
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

const settings = await import("../src/lib/data/business-settings");
const brands = await import("../src/lib/data/brands");
const { queryKeys } = await import("../src/lib/query-keys");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);
const denied = { message: "denied" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: null, error: null });
});

describe("keys", () => {
  it("keep the values existing invalidations use", () => {
    expect(queryKeys.brand.businessSettings("b1")).toEqual(
      settings.businessSettingsKeys.detail("b1"),
    );
    expect(queryKeys.brand.storeProfile("b1")).toEqual(["store-profile", "b1"]);
    expect(queryKeys.brand.profile("b1")).toEqual(brands.brandKeys.profile("b1"));
    expect(brands.brandKeys.list()).toEqual(["brands"]);
  });
});

describe("business settings writes", () => {
  it("save only the columns passed, for the brand passed, creating the row if missing", async () => {
    await settings.saveBusinessSettings("b1", { currency: "BHD" });
    expect(requests[0]).toMatchObject({
      table: "business_settings",
      op: "upsert",
      payload: { currency: "BHD", brand_id: "b1" },
      options: { onConflict: "brand_id" },
    });
  });

  it("update the brand's existing row only", async () => {
    await settings.updateBusinessSettings("b1", { bom_enabled: false });
    expect(requests[0]).toMatchObject({ op: "update", payload: { bom_enabled: false } });
    expect(filters(requests[0], "eq")).toEqual([["brand_id", "b1"]]);
  });

  it("throw the Supabase error so the form can show it", async () => {
    respond = () => ({ error: denied });
    await expect(settings.saveBusinessSettings("b1", { currency: "BHD" })).rejects.toBe(denied);
    await expect(settings.updateBusinessSettings("b1", { pages: [] })).rejects.toBe(denied);
  });

  it("refresh the settings row and the store profile read from it", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await settings.invalidateBusinessSettings(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([
      ["business-settings", "b1"],
      ["store-profile", "b1"],
    ]);
  });
});

describe("brand reads and writes", () => {
  it("read the settings profile columns of one brand", async () => {
    respond = () => ({ data: { id: "b1" }, error: null });
    expect(await brands.fetchBrandProfile("b1")).toEqual({ id: "b1" });
    expect(requests[0].select).toContain("hero_media");
    expect(filters(requests[0], "eq")).toEqual([["id", "b1"]]);
  });

  it("list brands newest first and throw on error", async () => {
    await brands.fetchBrands();
    expect(filters(requests[0], "order")).toEqual([["created_at", { ascending: false }]]);
    respond = () => ({ data: null, error: denied });
    await expect(brands.fetchBrands()).rejects.toBe(denied);
  });

  it("update one brand and throw on error", async () => {
    await brands.updateBrand("b1", { about_en: "Hi" });
    expect(requests[0]).toMatchObject({
      table: "brands",
      op: "update",
      payload: { about_en: "Hi" },
    });
    expect(filters(requests[0], "eq")).toEqual([["id", "b1"]]);
    respond = () => ({ error: denied });
    await expect(brands.updateBrand("b1", { about_en: "Hi" })).rejects.toBe(denied);
  });

  it("refresh the brand's profile and the brand list after a write", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await brands.invalidateBrand(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["brand", "b1"], ["brands"]]);
  });
});
