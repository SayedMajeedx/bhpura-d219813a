import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";
import { sha256Hex } from "../src/lib/ad-events/shared";

// The store's server sends each event to every ad platform the store set up (pixel on, token
// saved): Meta, TikTok and Snapchat. A purchase is read from the fresh order, never the browser;
// each platform answers on its own, and one that fails stops neither the others nor the page.

const state = vi.hoisted(() => ({ admin: null as unknown, ip: "10.0.0.1" }));
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({
    headers: new Headers({ "cf-connecting-ip": state.ip, "user-agent": "Mozilla/5.0 Test" }),
  }),
}));
const adminClient = {
  get supabaseAdmin() {
    return state.admin;
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);

const fns = (await import("../src/lib/ad-events.functions")) as unknown as {
  sendAdPurchase: ServerFn;
  sendAdBrowsingEvent: ServerFn;
  testAdPlatform: ServerFn;
};

const ORDER_ID = "00000000-0000-4000-8000-0000000000d1";
const PIXELS = {
  meta: "123456789012345",
  tiktok: "C4ABCD1234567890ABCD",
  snap: "5c1a2b3d-0000-4000-8000-abcdef012345",
};
const TOKENS: Record<string, string> = {
  meta_capi: "EAAGtesttokenvalue1234567890abcdef",
  tiktok_events: "tiktoktokenvalue1234567890abcdef",
  snap_capi: "eyJhbGciOiJIUzI1NiJ9.snaptokenvalue.sig",
};
let ipCount = 0;
let brandCount = 0;
const newBrand = () => `00000000-0000-4000-8000-${String(++brandCount).padStart(12, "0")}`;

function store(opts: {
  order?: Record<string, unknown> | null;
  on?: Partial<Record<"meta" | "tiktok" | "snap", boolean>>;
  tokens?: Partial<Record<string, string | null>>;
}) {
  const on = { meta: true, tiktok: true, snap: true, ...opts.on };
  const fake = fakeSupabase({
    rows: {
      orders: opts.order ?? null,
      brand_tracking_settings: {
        meta_pixel_enabled: on.meta,
        meta_pixel_id: PIXELS.meta,
        tiktok_pixel_enabled: on.tiktok,
        tiktok_pixel_id: PIXELS.tiktok,
        snap_pixel_enabled: on.snap,
        snap_pixel_id: PIXELS.snap,
      },
      business_settings: { currency: "BHD" },
    },
  });
  const tokens = { ...TOKENS, ...opts.tokens };
  const rpc = vi.fn(async (name: string, args: { p_provider?: string }) => {
    const token = args.p_provider ? tokens[args.p_provider] : null;
    return {
      data:
        name === "get_integration_credential_secret" && token
          ? [{ api_key: token, is_active: true }]
          : [],
      error: null,
    };
  });
  state.admin = { ...fake.supabase, rpc };
}

function freshOrder(brand: string, overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    brand_id: brand,
    channel: "storefront",
    created_at: new Date().toISOString(),
    currency: "BHD",
    total: 48.5,
    customer_id: "cust-1",
    destination_country: "BH",
    customer_email_snapshot: "sara@example.com",
    customer_name_snapshot: "Sara Ahmed",
    customer_phone_snapshot: "+973 3995 0016",
    customers: null,
    order_items: [{ product_id: "p1", quantity: 2, line_total: 30 }],
    ...overrides,
  };
}

const fetchMock = vi.fn();
beforeEach(() => {
  state.ip = `10.0.2.${++ipCount}`;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("tiktok")) return new Response(JSON.stringify({ code: 0, message: "OK" }));
    if (url.includes("snapchat")) return new Response(JSON.stringify({ status: "VALID" }));
    return new Response(JSON.stringify({ events_received: 1 }));
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** The body each platform was sent, by its host. */
function sent() {
  const out: Record<string, any> = {};
  for (const [url, init] of fetchMock.mock.calls) {
    const host = new URL(url).host;
    out[host] = { url, headers: init.headers, body: JSON.parse(String(init.body)) };
  }
  return out;
}

describe("a purchase", () => {
  it("reaches every platform the store set up, each under the pixel's own id", async () => {
    const brand = newBrand();
    store({ order: freshOrder(brand) });
    const result = await fns.sendAdPurchase({
      data: {
        orderId: ORDER_ID,
        pageUrl: "https://pura.boutq.store/pura/checkout",
        ttclid: "E.C.P.1",
      },
    });
    expect(result).toEqual({
      meta: { sent: true, received: 1 },
      tiktok: { sent: true, received: 1 },
      snap: { sent: true, received: 1 },
    });
    const bodies = sent();
    expect(bodies["graph.facebook.com"].body.data[0]).toMatchObject({
      event_name: "Purchase",
      event_id: `purchase:${ORDER_ID}`,
      custom_data: { value: 48.5 },
    });
    expect(bodies["business-api.tiktok.com"].headers["Access-Token"]).toBe(TOKENS.tiktok_events);
    expect(bodies["business-api.tiktok.com"].body.data[0]).toMatchObject({
      event: "CompletePayment",
      event_id: `purchase:${ORDER_ID}`,
      properties: { value: 48.5, order_id: ORDER_ID },
      user: { ttclid: "E.C.P.1", phone: await sha256Hex("+97339950016") },
    });
    expect(bodies["tr.snapchat.com"].url).toContain(`/v3/${PIXELS.snap}/events?access_token=`);
    expect(bodies["tr.snapchat.com"].body.data[0]).toMatchObject({
      event_name: "PURCHASE",
      event_id: ORDER_ID,
      custom_data: { value: 48.5, num_items: "2" },
    });
  });

  it("goes only to the platforms with their pixel on and a token saved", async () => {
    const brand = newBrand();
    store({ order: freshOrder(brand), on: { snap: false }, tokens: { meta_capi: null } });
    const result = await fns.sendAdPurchase({ data: { orderId: ORDER_ID } });
    expect(Object.keys(result as object)).toEqual(["tiktok"]);
    expect(Object.keys(sent())).toEqual(["business-api.tiktok.com"]);
  });

  it("is not sent for an old order, a staff order, or a store with nothing set up", async () => {
    const brand = newBrand();
    store({ order: freshOrder(brand, { channel: "admin" }) });
    expect(await fns.sendAdPurchase({ data: { orderId: ORDER_ID } })).toEqual({
      skipped: "not_found",
    });
    const old = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    store({ order: freshOrder(brand, { created_at: old }) });
    expect(await fns.sendAdPurchase({ data: { orderId: ORDER_ID } })).toEqual({
      skipped: "not_found",
    });
    const bare = newBrand();
    store({
      order: freshOrder(bare),
      tokens: { meta_capi: null, tiktok_events: null, snap_capi: null },
    });
    expect(await fns.sendAdPurchase({ data: { orderId: ORDER_ID } })).toEqual({ skipped: "off" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still reaches the others when one platform cannot be reached", async () => {
    const brand = newBrand();
    store({ order: freshOrder(brand) });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("tiktok")) throw new Error("network");
      if (url.includes("snapchat")) return new Response(JSON.stringify({ status: "VALID" }));
      return new Response(JSON.stringify({ events_received: 1 }));
    });
    expect(await fns.sendAdPurchase({ data: { orderId: ORDER_ID } })).toEqual({
      meta: { sent: true, received: 1 },
      tiktok: { sent: false, reason: "unreachable" },
      snap: { sent: true, received: 1 },
    });
  });
});

describe("a shopping step", () => {
  it("carries the browser's event id to each platform", async () => {
    const brand = newBrand();
    store({});
    await fns.sendAdBrowsingEvent({
      data: {
        brandId: brand,
        event: "add_to_cart",
        eventId: "evt-1234567890",
        contentIds: ["p1"],
        value: 15,
      },
    });
    const bodies = sent();
    expect(bodies["graph.facebook.com"].body.data[0]).toMatchObject({
      event_name: "AddToCart",
      event_id: "evt-1234567890",
    });
    expect(bodies["business-api.tiktok.com"].body.data[0]).toMatchObject({
      event: "AddToCart",
      event_id: "evt-1234567890",
    });
    expect(bodies["tr.snapchat.com"].body.data[0]).toMatchObject({
      event_name: "ADD_CART",
      event_id: "evt-1234567890",
    });
  });

  it("refuses a page view", async () => {
    await expect(
      fns.sendAdBrowsingEvent({
        data: { brandId: newBrand(), event: "page_view", eventId: "evt-1234567890" },
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the Integrations page's test", () => {
  const admin = () => fakeSupabase({ rpc: { can_access_brand: true, is_admin: true } }).supabase;

  it("tests one platform only, TikTok under its events tool's code", async () => {
    const brand = newBrand();
    store({});
    const result = await fns.testAdPlatform({
      data: { brandId: brand, platform: "tiktok", testEventCode: "TEST42" },
      context: { supabase: admin() },
    });
    expect(result).toEqual({ sent: true, received: 1 });
    expect(Object.keys(sent())).toEqual(["business-api.tiktok.com"]);
    expect(sent()["business-api.tiktok.com"].body.test_event_code).toBe("TEST42");
  });

  it("tests Snapchat at its validation address, with no code", async () => {
    const brand = newBrand();
    store({});
    await fns.testAdPlatform({
      data: { brandId: brand, platform: "snap" },
      context: { supabase: admin() },
    });
    expect(sent()["tr.snapchat.com"].url).toContain("/events/validate?");
  });

  it("says a platform is off until its pixel and token are saved", async () => {
    const brand = newBrand();
    store({ tokens: { snap_capi: null } });
    expect(
      await fns.testAdPlatform({
        data: { brandId: brand, platform: "snap" },
        context: { supabase: admin() },
      }),
    ).toEqual({ sent: false, reason: "off" });
  });

  it("is refused to anyone who is not the store's admin", async () => {
    const brand = newBrand();
    store({});
    const user = fakeSupabase({ rpc: { can_access_brand: true, is_admin: false } });
    await expect(
      fns.testAdPlatform({
        data: { brandId: brand, platform: "meta", testEventCode: "TEST1" },
        context: { supabase: user.supabase },
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
