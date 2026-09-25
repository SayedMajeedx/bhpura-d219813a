import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in push data-layer tests");
});

type Request = { table: string; args?: unknown; filters: Array<[string, ...unknown[]]> };
type Reply = { data?: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });

function builder(table: string) {
  const request: Request = { table, filters: [] };
  requests.push(request);
  const record =
    (kind: string) =>
    (...args: unknown[]) => (request.filters.push([kind, ...args]), chain);
  const chain = {
    select: () => chain,
    eq: record("eq"),
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
      const request: Request = { table: fn, args, filters: [] };
      requests.push(request);
      return Promise.resolve(respond(request));
    },
  },
};
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const push = await import("../src/lib/data/push");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("push reads", () => {
  it("read the brand's enabled devices and latest 30 marketing campaigns", async () => {
    await push.fetchPushDevices("b1");
    await push.fetchPushCampaigns("b1");
    expect(filters(requests[0], "eq")).toEqual([
      ["brand_id", "b1"],
      ["enabled", true],
    ]);
    expect(filters(requests[1], "eq")).toEqual([
      ["brand_id", "b1"],
      ["event_type", "marketing"],
    ]);
    expect(filters(requests[1], "order")).toEqual([["created_at", { ascending: false }]]);
    expect(filters(requests[1], "limit")).toEqual([[30]]);
  });

  it("keep both lists under the brand's push prefix", async () => {
    for (const key of [
      push.pushQueries.devices("b1").queryKey,
      push.pushQueries.campaigns("b1").queryKey,
    ]) {
      expect(key.slice(0, 2)).toEqual(["push", "b1"]);
    }
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await push.invalidatePush(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["push", "b1"]]);
  });
});

describe("campaignTargetUrl (bug backlog #23)", () => {
  it("opens the brand's own storefront, not Pura's", () => {
    expect(push.campaignTargetUrl({ slug: "noor" })).toBe("https://noor.boutq.store");
    expect(push.campaignTargetUrl({ slug: "pura" })).toBe("https://pura.boutq.store");
  });

  it("prefers the brand's custom domain", () => {
    expect(push.campaignTargetUrl({ slug: "noor", custom_domain: "shop.noor.bh" })).toBe(
      "https://shop.noor.bh",
    );
  });
});

describe("createPushCampaign", () => {
  it("queues a campaign for everyone by leaving the customer to the NULL default", async () => {
    await push.createPushCampaign({
      brandId: "b1",
      title: "Eid",
      body: "Sale",
      customerId: null,
      targetUrl: "https://x",
    });
    expect(requests[0]).toMatchObject({
      table: "create_customer_push_campaign",
      args: { p_brand_id: "b1", p_title: "Eid", p_body: "Sale", p_customer_id: undefined },
    });
  });

  it("throws when queueing fails", async () => {
    const denied = { message: "denied" };
    respond = () => ({ data: null, error: denied });
    await expect(
      push.createPushCampaign({ brandId: "b1", title: "t", body: "b", targetUrl: "u" }),
    ).rejects.toBe(denied);
  });
});
