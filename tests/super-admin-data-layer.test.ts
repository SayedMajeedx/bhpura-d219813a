import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in super admin data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "update" | "delete" | "rpc" | "invoke";
  payload?: unknown;
  select?: string;
  options?: unknown;
  filters: Array<[string, ...unknown[]]>;
};
type Reply = { data?: unknown; error: unknown; count?: number | null };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });

function builder(table: string) {
  const request: Request = { table, op: "select", filters: [] };
  requests.push(request);
  const record =
    (kind: string) =>
    (...args: unknown[]) => (request.filters.push([kind, ...args]), chain);
  const chain = {
    select(columns: string, options?: unknown) {
      request.select = columns.replace(/\s+/g, " ").trim();
      request.options = options;
      return chain;
    },
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
    limit: record("limit"),
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
    functions: {
      invoke: (fn: string, options: { body: unknown }) => {
        const request: Request = { table: fn, op: "invoke", payload: options.body, filters: [] };
        requests.push(request);
        return Promise.resolve(respond(request));
      },
    },
  },
};
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const superAdmin = await import("../src/lib/data/super-admin");

const denied = { message: "denied" };
const eqs = (request: Request) =>
  request.filters.filter(([k]) => k === "eq").map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("tenants", () => {
  it("offer only active plans, in display order, and read a failure as none", async () => {
    await superAdmin.fetchActivePlans();
    expect(requests[0]).toMatchObject({ table: "saas_plans" });
    expect(eqs(requests[0])).toEqual([["is_active", true]]);
    expect(requests[0].filters).toContainEqual(["order", "sort_order", { ascending: true }]);
    respond = () => ({ data: null, error: denied });
    expect(await superAdmin.fetchActivePlans()).toEqual([]);
  });

  it("look up pending subscriptions only for the brands awaiting approval", async () => {
    expect(await superAdmin.fetchPendingSubscriptions([])).toEqual([]);
    expect(requests).toHaveLength(0);
    expect(superAdmin.superAdminQueries.pendingSubscriptions([]).enabled).toBe(false);
    await superAdmin.fetchPendingSubscriptions(["b1", "b2"]);
    expect(requests[0].filters).toEqual([["in", "brand_id", ["b1", "b2"]]]);
    expect(requests[0].select).toContain("target_plan:saas_plans!");
  });

  it("count a brand's orders, products and customers before deletion", async () => {
    respond = (request) => ({
      error: null,
      count: { orders: 12, products: 4, customers: null }[request.table],
    });
    expect(await superAdmin.fetchBrandUsage("b1")).toEqual({
      orders: 12,
      products: 4,
      customers: 0,
    });
    for (const request of requests) {
      expect(eqs(request)).toEqual([["brand_id", "b1"]]);
      expect(request.options).toEqual({ head: true, count: "exact" });
    }
  });

  it("delete a brand through its function and throw the error as is", async () => {
    await superAdmin.deleteBrand("b1", true);
    expect(requests[0]).toMatchObject({
      table: "delete_brand",
      payload: { p_brand_id: "b1", p_hard: true },
    });
    const notFound = { message: "BRAND_NOT_FOUND" };
    respond = () => ({ error: notFound });
    await expect(superAdmin.deleteBrand("b1", true)).rejects.toBe(notFound);
  });
});

describe("white-label apps", () => {
  it("provision through the edge function and surface its own error message", async () => {
    respond = () => ({ data: { requires_github_connection: true }, error: null });
    expect(await superAdmin.provisionWhiteLabelApp("b1", false)).toEqual({
      requires_github_connection: true,
    });
    expect(requests[0]).toMatchObject({
      table: "provision-white-label-app",
      op: "invoke",
      payload: { brand_id: "b1", rebuild: false },
    });
    respond = () => ({ data: { error: "Firebase quota" }, error: null });
    await expect(superAdmin.provisionWhiteLabelApp("b1", true)).rejects.toThrow("Firebase quota");
    respond = () => ({ data: null, error: { message: "offline" } });
    await expect(superAdmin.provisionWhiteLabelApp("b1", true)).rejects.toThrow("offline");
  });

  it("activate a build and refresh the apps (and builds when asked)", async () => {
    await superAdmin.activateWhiteLabelBuild("build-1");
    expect(requests[0]).toMatchObject({
      table: "activate_white_label_build",
      payload: { p_build_id: "build-1" },
    });
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await superAdmin.invalidateWhiteLabel(qc, { builds: false });
    await superAdmin.invalidateWhiteLabel(qc);
    expect(spy.mock.calls.map(([f]) => f?.queryKey?.at(-1))).toEqual([
      "white-label-apps",
      "white-label-apps",
      "white-label-builds",
    ]);
  });
});

describe("grant applications", () => {
  it("are updated with a fresh timestamp, deleted by id, and throw their errors", async () => {
    await superAdmin.updateGrantApplication("g1", { status: "approved" });
    await superAdmin.deleteGrantApplication("g1");
    expect(requests.map((r) => [r.table, r.op, eqs(r)])).toEqual([
      ["merchant_grant_applications", "update", [["id", "g1"]]],
      ["merchant_grant_applications", "delete", [["id", "g1"]]],
    ]);
    expect(requests[0].payload).toMatchObject({ status: "approved" });
    expect((requests[0].payload as { updated_at: string }).updated_at).toMatch(/^\d{4}-/);
    respond = () => ({ error: denied });
    await expect(superAdmin.deleteGrantApplication("g1")).rejects.toBe(denied);
  });
});

describe("overrides and tenant requests", () => {
  it("read a brand's overrides only once a brand is picked", async () => {
    expect(superAdmin.superAdminQueries.entitlementOverrides("").enabled).toBe(false);
    await superAdmin.fetchEntitlementOverrides("b1");
    expect(eqs(requests[0])).toEqual([["brand_id", "b1"]]);
  });

  it("list pending requests, newest first", async () => {
    await superAdmin.fetchPendingTenantRequests();
    expect(eqs(requests[0])).toEqual([["status", "pending"]]);
    expect(requests[0].filters).toContainEqual(["order", "created_at", { ascending: false }]);
    respond = () => ({ data: null, error: denied });
    await expect(superAdmin.fetchPendingTenantRequests()).rejects.toBe(denied);
  });

  it("keep every platform key under the super admin prefix", () => {
    const q = superAdmin.superAdminQueries;
    for (const options of [
      q.activePlans(),
      q.brandUsage("b1"),
      q.whiteLabelApps(),
      q.grantApplications(),
      q.systemHealth(),
      q.tenantRequests(),
    ]) {
      expect(options.queryKey[0]).toBe("super-admin");
    }
  });
});
