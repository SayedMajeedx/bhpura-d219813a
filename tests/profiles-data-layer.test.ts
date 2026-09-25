import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in profile data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "update";
  payload?: unknown;
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
    eq: record("eq"),
    in: record("in"),
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

const profiles = await import("../src/lib/data/profiles");
const { queryKeys } = await import("../src/lib/query-keys");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: null, error: null });
});

describe("the caller's profile", () => {
  it("reads every column a route guard checks, in one shape under one key", async () => {
    respond = () => ({ data: { id: "u1", role: "staff" }, error: null });
    expect(await profiles.fetchCallerProfile("u1")).toEqual({ id: "u1", role: "staff" });
    for (const column of [
      "role",
      "status",
      "email",
      "brand_id",
      "permissions",
      "must_change_password",
    ]) {
      expect(requests[0].select).toContain(column);
    }
    expect(filters(requests[0], "eq")).toEqual([["id", "u1"]]);
    const options = profiles.profilesQueries.caller("u1");
    expect(options.queryKey).toEqual(["profiles", "caller", "u1"]);
    expect(options.staleTime).toBe(1000 * 60 * 5);
  });

  it("reads a failed lookup as no profile, as every guard always treated it", async () => {
    respond = () => ({ data: null, error: { message: "denied" } });
    expect(await profiles.fetchCallerProfile("u1")).toBeNull();
  });

  it("turns stored permissions into the list the guards check", () => {
    expect(
      profiles.permissionsOf({ permissions: ["view_financials", 3, "manage_settings"] }),
    ).toEqual(["view_financials", "manage_settings"]);
    expect(profiles.permissionsOf({ permissions: null })).toEqual([]);
    expect(profiles.permissionsOf(null)).toEqual([]);
  });
});

describe("couriers and names", () => {
  it("list the brand's active couriers by name, under the key query-keys already uses", async () => {
    respond = () => ({ data: [], error: null });
    await profiles.fetchCouriers("b1");
    expect(filters(requests[0], "eq")).toEqual([
      ["brand_id", "b1"],
      ["role", "courier"],
      ["status", "active"],
    ]);
    expect(filters(requests[0], "order")).toEqual([["name"]]);
    expect(queryKeys.couriers.all("b1")).toEqual(profiles.profilesKeys.couriers("b1"));
  });

  it("read the names of some users and a failure as none", async () => {
    respond = () => ({ data: [{ id: "u1", full_name: "Sara", email: null }], error: null });
    expect(await profiles.fetchProfileNames(["u1"])).toHaveLength(1);
    expect(filters(requests[0], "in")).toEqual([["id", ["u1"]]]);
    respond = () => ({ data: null, error: { message: "denied" } });
    expect(await profiles.fetchProfileNames(["u1"])).toEqual([]);
  });
});

describe("updateProfile", () => {
  it("changes one profile and throws on error", async () => {
    await profiles.updateProfile("u1", { phone: "97333333333" });
    expect(requests[0]).toMatchObject({ op: "update", payload: { phone: "97333333333" } });
    expect(filters(requests[0], "eq")).toEqual([["id", "u1"]]);
    const denied = { message: "denied" };
    respond = () => ({ error: denied });
    await expect(profiles.updateProfile("u1", { phone: "1" })).rejects.toBe(denied);
  });
});
