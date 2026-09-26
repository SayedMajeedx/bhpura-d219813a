import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in branches data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "rpc";
  payload?: unknown;
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
    eq: record("eq"),
    order: record("order"),
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

const branches = await import("../src/lib/data/branches");

const denied = { message: "denied" };
const eqs = (request: Request) =>
  request.filters.filter(([k]) => k === "eq").map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("admin branch reads", () => {
  it("list every branch of the brand for the order editor, and throw on error", async () => {
    await branches.fetchBranches("b1");
    expect(eqs(requests[0])).toEqual([["brand_id", "b1"]]);
    expect(requests[0].select).toContain("location_en");
    respond = () => ({ data: null, error: denied });
    await expect(branches.fetchBranches("b1")).rejects.toBe(denied);
  });

  it("list only active branches, in display order, for the returns inspection", async () => {
    await branches.fetchActiveBranches("b1");
    expect(eqs(requests[0])).toEqual([
      ["brand_id", "b1"],
      ["is_active", true],
    ]);
    expect(requests[0].filters).toContainEqual(["order", "sort_order", { ascending: true }]);
  });

  it("read an invoice's branch within the brand, none when it cannot be read", async () => {
    respond = () => ({ data: { name_en: "Seef" }, error: null });
    expect(await branches.fetchBranch("b1", "br1")).toEqual({ name_en: "Seef" });
    expect(eqs(requests[0])).toEqual([
      ["id", "br1"],
      ["brand_id", "b1"],
    ]);
    respond = () => ({ data: null, error: denied });
    expect(await branches.fetchBranch("b1", "br1")).toBeNull();
    expect(branches.branchesQueries.one("b1", "").enabled).toBe(false);
  });

  it("keep every list under the brand's branches prefix", () => {
    for (const options of [
      branches.branchesQueries.list("b1"),
      branches.branchesQueries.active("b1"),
      branches.branchesQueries.one("b1", "br1"),
    ]) {
      expect(options.queryKey.slice(0, 2)).toEqual(["branches", "b1"]);
    }
  });
});

describe("checkout pickup branches", () => {
  it("come from the public function, and a failure offers none", async () => {
    respond = () => ({ data: [{ id: "br1" }], error: null });
    expect(await branches.fetchPublicBranches("b1")).toEqual([{ id: "br1" }]);
    expect(requests[0]).toMatchObject({
      table: "get_public_branches",
      payload: { p_brand_id: "b1" },
    });
    respond = () => ({ data: null, error: denied });
    expect(await branches.fetchPublicBranches("b1")).toEqual([]);
  });
});
