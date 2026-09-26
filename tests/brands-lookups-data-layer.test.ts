import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in brand lookup tests");
});

type Request = { table: string; select?: string; filters: Array<[string, ...unknown[]]> };
type Reply = { data?: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: null, error: null });

function builder(table: string) {
  const request: Request = { table, filters: [] };
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

const brands = await import("../src/lib/data/brands");

const eqs = (request: Request) =>
  request.filters.filter(([k]) => k === "eq").map(([, ...rest]) => rest);
const denied = { message: "denied" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: null, error: null });
});

describe("the brand the admin route guard opens", () => {
  it("is read by slug with the plan and subscription columns, cached five minutes", async () => {
    respond = () => ({ data: { id: "b1", slug: "pura" }, error: null });
    const options = brands.brandQueries.adminBySlug("pura");
    expect(options.staleTime).toBe(5 * 60 * 1000);
    expect(await brands.fetchAdminBrandBySlug("pura")).toEqual({ id: "b1", slug: "pura" });
    expect(eqs(requests[0])).toEqual([["slug", "pura"]]);
    for (const column of ["subscription_status", "plan_type", "trial_ends_at", "custom_domain"]) {
      expect(requests[0].select).toContain(column);
    }
  });

  it("is null when missing or unreadable, so the guard redirects instead of retrying", async () => {
    expect(await brands.fetchAdminBrandBySlug("gone")).toBeNull();
    respond = () => ({ data: null, error: denied });
    expect(await brands.fetchAdminBrandBySlug("pura")).toBeNull();
  });

  it("is refreshed with the brand list after a brand write", async () => {
    const qc = new QueryClient();
    qc.setQueryData(brands.brandQueries.adminBySlug("pura").queryKey, null);
    qc.setQueryData(brands.brandQueries.directory().queryKey, []);
    qc.setQueryData(brands.brandQueries.iconsBySlug("pura").queryKey, null);
    await brands.invalidateBrand(qc, "b1");
    expect(
      qc
        .getQueryCache()
        .getAll()
        .every((query) => query.state.isInvalidated),
    ).toBe(true);
  });
});

describe("the brand's icons", () => {
  it("come from the settings of the brand with that slug", async () => {
    respond = (request) =>
      request.table === "brands"
        ? { data: { id: "b1" }, error: null }
        : { data: { favicon_url: "f.png", logo_url: "l.png" }, error: null };
    expect(await brands.fetchBrandIconsBySlug("pura")).toEqual({
      favicon_url: "f.png",
      logo_url: "l.png",
    });
    expect(requests.map((r) => [r.table, eqs(r)])).toEqual([
      ["brands", [["slug", "pura"]]],
      ["business_settings", [["brand_id", "b1"]]],
    ]);
  });

  it("are null without reading settings when the brand is unknown", async () => {
    expect(await brands.fetchBrandIconsBySlug("gone")).toBeNull();
    expect(requests.map((r) => r.table)).toEqual(["brands"]);
  });
});

describe("best-effort lookups", () => {
  it("resolve ids and slugs, and fall back to null on a failed read", async () => {
    respond = () => ({ data: { id: "b1", slug: "pura" }, error: null });
    expect(await brands.fetchBrandIdBySlug("pura")).toBe("b1");
    expect(await brands.fetchBrandSlug("b1")).toBe("pura");
    expect(await brands.fetchAnyBrandSlug()).toBe("pura");
    expect(eqs(requests[0])).toEqual([["slug", "pura"]]);
    expect(eqs(requests[1])).toEqual([["id", "b1"]]);
    expect(requests[2].filters).toEqual([["limit", 1]]);

    respond = () => ({ data: null, error: denied });
    expect(await brands.fetchBrandIdBySlug("pura")).toBeNull();
    expect(await brands.fetchBrandSlug("b1")).toBeNull();
    expect(await brands.fetchAnyBrandSlug()).toBeNull();
  });

  it("find only active brands for a storefront subdomain or custom domain", async () => {
    respond = () => ({ data: { id: "b1", slug: "pura" }, error: null });
    await brands.findActiveBrand({ slug: "pura" });
    await brands.findActiveBrand({ customDomain: "shop.pura.bh" });
    expect(eqs(requests[0])).toEqual([
      ["is_active", true],
      ["slug", "pura"],
    ]);
    expect(eqs(requests[1])).toEqual([
      ["is_active", true],
      ["custom_domain", "shop.pura.bh"],
    ]);
    // Anonymous visitors may not filter by custom domain: that is "no match".
    respond = () => ({ data: null, error: denied });
    expect(await brands.findActiveBrand({ customDomain: "shop.pura.bh" })).toBeNull();
  });

  it("treat a slug as taken when a brand has it or the check fails", async () => {
    expect(await brands.isBrandSlugTaken("new-store")).toBe(false);
    respond = () => ({ data: { id: "b1" }, error: null });
    expect(await brands.isBrandSlugTaken("pura")).toBe(true);
    respond = () => ({ data: null, error: denied });
    expect(await brands.isBrandSlugTaken("pura")).toBe(true);
  });
});

describe("the brand directory", () => {
  it("lists every brand by English name with the columns the pickers show", async () => {
    respond = () => ({ data: [], error: null });
    await brands.fetchBrandDirectory();
    expect(requests[0].select).toBe("id, slug, name_en, name_ar, is_active, plan_type");
    expect(requests[0].filters).toEqual([["order", "name_en", { ascending: true }]]);
    respond = () => ({ data: null, error: denied });
    await expect(brands.fetchBrandDirectory()).rejects.toBe(denied);
  });
});
