import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in these data-layer tests");
});

type Request = {
  client: "session" | "public";
  table: string;
  op: "select" | "rpc";
  payload?: unknown;
  filters: Array<[string, ...unknown[]]>;
};
type Reply = { data?: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });

function makeClient(client: Request["client"]) {
  return {
    from(table: string) {
      const request: Request = { client, table, op: "select", filters: [] };
      requests.push(request);
      const chain = {
        select: () => chain,
        eq: (...args: unknown[]) => (request.filters.push(["eq", ...args]), chain),
        order: (...args: unknown[]) => (request.filters.push(["order", ...args]), chain),
        maybeSingle: () => chain,
        then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(respond(request)).then(resolve, reject);
        },
      };
      return chain;
    },
    rpc(fn: string, args: unknown) {
      const request: Request = { client, table: fn, op: "rpc", payload: args, filters: [] };
      requests.push(request);
      return Promise.resolve(respond(request));
    },
  };
}

const client = { supabase: makeClient("session"), publicSupabase: makeClient("public") };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const orders = await import("../src/lib/data/orders");
const recipients = await import("../src/lib/data/notification-recipients");
const systemSettings = await import("../src/lib/data/system-settings");
const brands = await import("../src/lib/data/brands");
const superAdmin = await import("../src/lib/data/super-admin");

const denied = { message: "denied" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("courier", () => {
  it("assigns a courier, unassigns with NULL, and throws the database error", async () => {
    await orders.assignOrderCourier("o1", "c1");
    await orders.assignOrderCourier("o1", null);
    expect(requests.map((r) => r.payload)).toEqual([
      { p_order_id: "o1", p_courier_id: "c1" },
      { p_order_id: "o1", p_courier_id: null },
    ]);
    respond = () => ({ error: denied });
    await expect(orders.assignOrderCourier("o1", "c1")).rejects.toBe(denied);
  });

  it("reads the delivery message under the brand's orders prefix", async () => {
    respond = () => ({ data: { message_en: "On the way" }, error: null });
    expect(await orders.fetchCourierDeliveryMessage("o1")).toEqual({ message_en: "On the way" });
    const options = orders.courierQueries.deliveryMessage("b1", "o1");
    expect(options.queryKey.slice(0, 2)).toEqual(orders.ordersKeys.all("b1"));
    expect(options.staleTime).toBe(300_000);
  });
});

describe("notification activity", () => {
  it("lists the brand's latest 200 order notifications, and throws on error", async () => {
    await recipients.fetchNotificationActivity("b1");
    expect(requests[0]).toMatchObject({
      table: "list_brand_email_notifications",
      payload: { p_brand_id: "b1", p_limit: 200, p_offset: 0 },
    });
    respond = () => ({ data: null, error: denied });
    await expect(recipients.fetchNotificationActivity("b1")).rejects.toBe(denied);
  });
});

describe("platform reads", () => {
  it("list mobile app releases newest first", async () => {
    await systemSettings.fetchMobileAppReleases();
    expect(requests[0]).toMatchObject({ table: "mobile_app_releases_public" });
    expect(requests[0].filters).toEqual([["order", "created_at", { ascending: false }]]);
  });

  it("read a storefront's loader text, none when unreadable", async () => {
    respond = () => ({ data: { storefront_loader_text_en: "Welcome" }, error: null });
    expect(await brands.fetchStorefrontLoaderText("b1")).toEqual({
      storefront_loader_text_en: "Welcome",
    });
    expect(requests[0].filters).toEqual([["eq", "brand_id", "b1"]]);
    respond = () => ({ data: null, error: denied });
    expect(await brands.fetchStorefrontLoaderText("b1")).toBeNull();
  });

  it("submit a grant application through the anonymous client", async () => {
    respond = () => ({ data: "g1", error: null });
    const id = await superAdmin.submitGrantApplication({
      businessName: "Pura",
      instagramHandle: "pura",
      whatsappNumber: "+97339001122",
      productCategory: "abaya",
      readinessStatus: "ready",
      currentSalesChannel: "instagram",
      biggestChallenge: null,
    });
    expect(id).toBe("g1");
    expect(requests[0]).toMatchObject({
      client: "public",
      table: "submit_grant_application",
      payload: { p_business_name: "Pura", p_biggest_challenge: undefined },
    });
    respond = () => ({ data: null, error: denied });
    await expect(
      superAdmin.submitGrantApplication({
        businessName: "x",
        instagramHandle: "x",
        whatsappNumber: "x",
        productCategory: "x",
        readinessStatus: "x",
        currentSalesChannel: "x",
        biggestChallenge: "x",
      }),
    ).rejects.toBe(denied);
  });
});
