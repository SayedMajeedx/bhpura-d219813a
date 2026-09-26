import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in integrations data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "upsert" | "rpc";
  payload?: unknown;
  options?: unknown;
  filters: Array<[string, ...unknown[]]>;
};
type Reply = { data?: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });

function builder(table: string) {
  const request: Request = { table, op: "select", filters: [] };
  requests.push(request);
  const chain = {
    select: () => chain,
    upsert(payload: unknown, options: unknown) {
      request.op = "upsert";
      request.payload = payload;
      request.options = options;
      return chain;
    },
    eq: (...args: unknown[]) => (request.filters.push(["eq", ...args]), chain),
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

const integrations = await import("../src/lib/data/integrations");

const denied = { message: "denied" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("integration credentials", () => {
  it("are listed masked through the brand's function, under the brand's prefix", async () => {
    const options = integrations.integrationsQueries.credentials("b1");
    expect(options.queryKey).toEqual(["integrations", "b1", "credentials"]);
    expect(integrations.integrationsQueries.credentials("").enabled).toBe(false);
    await integrations.fetchIntegrationCredentials("b1");
    expect(requests[0]).toEqual({
      table: "list_integration_credentials",
      op: "rpc",
      payload: { p_brand_id: "b1" },
      filters: [],
    });
  });

  it("are created with a NULL id and updated by id, every argument passed", async () => {
    const input = {
      provider: "tap",
      baseUrl: "https://api.tap.company",
      apiKey: "sk_test_x",
      webhookSecret: "",
      isActive: true,
      notes: null,
    };
    await integrations.saveIntegrationCredential("b1", { ...input, id: null });
    await integrations.saveIntegrationCredential("b1", { ...input, id: "c1" });
    expect(requests.map((r) => r.payload)).toEqual([
      {
        p_id: null,
        p_brand_id: "b1",
        p_provider: "tap",
        p_base_url: "https://api.tap.company",
        p_api_key: "sk_test_x",
        p_webhook_secret: "",
        p_is_active: true,
        p_notes: null,
      },
      expect.objectContaining({ p_id: "c1", p_brand_id: "b1" }),
    ]);
  });

  it("are deleted within the brand, and every call throws its error", async () => {
    await integrations.deleteIntegrationCredential("b1", "c1");
    expect(requests[0]).toMatchObject({
      table: "delete_integration_credential",
      payload: { p_id: "c1", p_brand_id: "b1" },
    });
    respond = () => ({ data: null, error: denied });
    await expect(integrations.fetchIntegrationCredentials("b1")).rejects.toBe(denied);
    await expect(integrations.deleteIntegrationCredential("b1", "c1")).rejects.toBe(denied);
  });

  it("refresh only the credentials list, not the tracking form being edited", async () => {
    const qc = new QueryClient();
    qc.setQueryData(integrations.integrationsQueries.credentials("b1").queryKey, []);
    qc.setQueryData(integrations.integrationsQueries.tracking("b1").queryKey, null);
    await integrations.invalidateIntegrationCredentials(qc, "b1");
    expect(
      qc
        .getQueryCache()
        .getAll()
        .map((query) => [query.queryKey.at(-1), query.state.isInvalidated]),
    ).toEqual([
      ["credentials", true],
      ["tracking", false],
    ]);
  });
});

describe("tracking settings", () => {
  it("are read for the brand, none before the first save", async () => {
    respond = () => ({ data: null, error: { code: "PGRST116", message: "no rows" } });
    expect(await integrations.fetchTrackingSettings("b1")).toBeNull();
    expect(requests[0].filters).toEqual([["eq", "brand_id", "b1"]]);
    respond = () => ({ data: null, error: denied });
    await expect(integrations.fetchTrackingSettings("b1")).rejects.toBe(denied);
  });

  it("are saved as one row per brand", async () => {
    await integrations.saveTrackingSettings("b1", {
      google_analytics_enabled: true,
      google_analytics_id: "G-ABC123",
    });
    expect(requests[0]).toMatchObject({
      table: "brand_tracking_settings",
      op: "upsert",
      payload: { google_analytics_id: "G-ABC123", brand_id: "b1" },
      options: { onConflict: "brand_id" },
    });
  });
});
