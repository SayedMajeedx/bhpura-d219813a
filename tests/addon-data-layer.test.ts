import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in addon data tests");
});

type Request = {
  table: string;
  select?: string;
  options?: unknown;
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
    select(columns: string, options?: unknown) {
      request.select = columns;
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

const addons = await import("../src/lib/data/addons");
const { queryKeys } = await import("../src/lib/query-keys");

const denied = { message: "denied" };
const eqs = (request: Request) =>
  request.filters.filter(([k]) => k === "eq").map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("installed addons for the invoice", () => {
  it("read only installed addons of the brand, none when unreadable", async () => {
    await addons.fetchInstalledAddonIds("b1");
    expect(eqs(requests[0])).toEqual([
      ["brand_id", "b1"],
      ["status", "installed"],
    ]);
    respond = () => ({ data: null, error: denied });
    expect(await addons.fetchInstalledAddonIds("b1")).toEqual([]);
  });

  it("refresh when an addon is installed or disabled (the addons prefix)", async () => {
    const qc = new QueryClient();
    qc.setQueryData(addons.addonDataQueries.installedIds("b1").queryKey, []);
    await qc.invalidateQueries({ queryKey: queryKeys.addons.all("b1") });
    expect(qc.getQueryCache().getAll()[0].state.isInvalidated).toBe(true);
  });
});

describe("size guides", () => {
  it("list the brand's active guides in display order, none when unreadable", async () => {
    await addons.fetchActiveSizeGuides("b1");
    expect(eqs(requests[0])).toEqual([
      ["brand_id", "b1"],
      ["is_active", true],
    ]);
    expect(requests[0].filters).toContainEqual(["order", "sort_order", { ascending: true }]);
    respond = () => ({ data: null, error: denied });
    expect(await addons.fetchActiveSizeGuides("b1")).toEqual([]);
  });
});

describe("fit passports", () => {
  it("count the brand's saved passports without reading them, zero when unreadable", async () => {
    respond = () => ({ error: null, count: 7 });
    expect(await addons.countFitPassports("b1")).toBe(7);
    expect(requests[0].options).toEqual({ count: "exact", head: true });
    respond = () => ({ error: denied, count: null });
    expect(await addons.countFitPassports("b1")).toBe(0);
  });

  it("read one customer's measurements within the brand, and throw on error", async () => {
    respond = () => ({ data: null, error: null });
    expect(await addons.fetchCustomerFitPassport("b1", "c1")).toBeNull();
    expect(eqs(requests[0])).toEqual([
      ["brand_id", "b1"],
      ["customer_id", "c1"],
    ]);
    expect(addons.addonDataQueries.customerFitPassport("b1", "").enabled).toBe(false);
    respond = () => ({ data: null, error: denied });
    await expect(addons.fetchCustomerFitPassport("b1", "c1")).rejects.toBe(denied);
  });
});
