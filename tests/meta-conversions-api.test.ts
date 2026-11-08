import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";
import {
  browsingData,
  cleanToken,
  eventsBody,
  fbcFromClickId,
  metaCookie,
  metaEvent,
  normalEmail,
  normalName,
  normalPhone,
  purchaseData,
  purchaseEventId,
  readMetaAnswer,
  sha256Hex,
  sourceUrl,
  userData,
} from "../src/lib/ad-events/meta-conversions";
import { metaPayload, readCookie } from "../src/lib/ad-events/meta-browser";

// Meta's Conversions API: the store's server sends Meta the purchase (read from the order) and the
// shopping steps, under the pixel's own event id, so Meta counts each once and ads learn from
// sales the browser pixel missed.

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
  sendMetaPurchase: ServerFn;
  sendMetaBrowsingEvent: ServerFn;
  testMetaConversions: ServerFn;
};

const TOKEN = "EAAGtesttokenvalue1234567890abcdef";
let ipCount = 0;
let brandCount = 0;
const newBrand = () => `00000000-0000-4000-8000-${String(++brandCount).padStart(12, "0")}`;

function store(opts: {
  brand: string;
  order?: Record<string, unknown> | null;
  pixel?: boolean;
  token?: string | null;
}) {
  const fake = fakeSupabase({
    rows: {
      orders: opts.order ?? null,
      brand_tracking_settings: {
        meta_pixel_enabled: opts.pixel ?? true,
        meta_pixel_id: "123456789012345",
      },
      business_settings: { currency: "BHD" },
    },
  });
  const rpc = vi.fn(async (name: string) => ({
    data:
      name === "get_integration_credential_secret" && opts.token !== null
        ? [{ api_key: opts.token ?? TOKEN, is_active: true }]
        : [],
    error: null,
  }));
  state.admin = { ...fake.supabase, rpc };
  return { rpc };
}

const fetchMock = vi.fn();
beforeEach(() => {
  state.ip = `10.0.1.${++ipCount}`;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const sentBody = () => JSON.parse(String(fetchMock.mock.calls[0][1].body));

function freshOrder(brand: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-0000000000d1",
    brand_id: brand,
    channel: "storefront",
    created_at: new Date().toISOString(),
    currency: "BHD",
    total: 48.5,
    customer_id: "cust-1",
    destination_country: "BH",
    customer_email_snapshot: " Sara@Example.com ",
    customer_name_snapshot: "Sara Ahmed",
    customer_phone_snapshot: "+973 3995 0016",
    customers: null,
    order_items: [
      { product_id: "p1", quantity: 2, line_total: 30 },
      { product_id: "p2", quantity: 1, line_total: 18.5 },
    ],
    ...overrides,
  };
}

describe("a shopper's details, as Meta reads them", () => {
  it("normalises before hashing and hashes with SHA-256", async () => {
    expect(normalEmail(" Test@Example.COM ")).toBe("test@example.com");
    expect(normalEmail("not an email")).toBeNull();
    expect(normalPhone("+973 3995-0016")).toBe("97339950016");
    expect(normalPhone("0097339950016")).toBe("97339950016");
    expect(normalPhone("123")).toBeNull();
    expect(normalName("Sara-Ahmed!")).toBe("saraahmed");
    expect(normalName("سارة")).toBe("سارة");
    expect(await sha256Hex("test@example.com")).toBe(
      "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b",
    );
  });

  it("sends every personal detail hashed and only Meta's own cookie shapes", async () => {
    const user = await userData(
      {
        email: "a@b.co",
        phone: "+97339950016",
        name: "Sara Ahmed",
        country: "BH",
        customerId: "c1",
      },
      { ip: "1.2.3.4", userAgent: "UA", fbp: "fb.1.1700000000000.123", fbc: "made-up" },
    );
    expect(user.em).toEqual([await sha256Hex("a@b.co")]);
    expect(user.ph).toEqual([await sha256Hex("97339950016")]);
    expect(user.fn).toEqual([await sha256Hex("sara")]);
    expect(user.ln).toEqual([await sha256Hex("ahmed")]);
    expect(user.country).toEqual([await sha256Hex("bh")]);
    expect(user.client_ip_address).toBe("1.2.3.4");
    expect(user.fbp).toBe("fb.1.1700000000000.123");
    expect(user).not.toHaveProperty("fbc");
    expect(JSON.stringify(user)).not.toContain("a@b.co");
  });

  it("keeps an ad's click id in the shape of Meta's cookie", () => {
    expect(fbcFromClickId("IwAR2abcDEF_123-xyz", 1700000000000)).toBe(
      "fb.1.1700000000000.IwAR2abcDEF_123-xyz",
    );
    expect(fbcFromClickId("<script>", 1)).toBeNull();
    expect(metaCookie(fbcFromClickId("IwAR2abcDEF_123-xyz", 1700000000000))).not.toBeNull();
    expect(readCookie("a=1; _fbp=fb.1.1700000000000.99; b=2", "_fbp")).toBe(
      "fb.1.1700000000000.99",
    );
    expect(readCookie("a=1", "_fbp")).toBeNull();
  });
});

describe("what an event holds", () => {
  it("prices a purchase from the order's own lines and total", () => {
    expect(
      purchaseData({
        id: "o1",
        currency: "bhd",
        total: 48.5,
        lines: [
          { productId: "p1", quantity: 2, lineTotal: 30 },
          { productId: null, quantity: 1, lineTotal: 5 },
        ],
      }),
    ).toEqual({
      currency: "BHD",
      value: 48.5,
      order_id: "o1",
      content_type: "product",
      content_ids: ["p1"],
      contents: [{ id: "p1", quantity: 2, item_price: 15 }],
      num_items: 2,
    });
  });

  it("keeps only well-formed browsing data", () => {
    expect(
      browsingData({ currency: "sar", value: 12.3456, contentIds: ["p1", "bad id!"], numItems: 2 }),
    ).toEqual({
      content_type: "product",
      currency: "SAR",
      value: 12.346,
      content_ids: ["p1"],
      num_items: 2,
    });
  });

  it("names the page without its query, and the test code only when it is one", () => {
    expect(sourceUrl("https://pura.boutq.store/pura/thank-you/1?t=secret")).toBe(
      "https://pura.boutq.store/pura/thank-you/1",
    );
    expect(sourceUrl("javascript:alert(1)")).toBeUndefined();
    const event = metaEvent({
      event: "purchase",
      eventId: purchaseEventId("o1"),
      now: 1_700_000_000_500,
      user: {},
      custom: {},
    });
    expect(event).toMatchObject({
      event_name: "Purchase",
      event_id: "purchase:o1",
      event_time: 1_700_000_000,
    });
    expect(eventsBody([event], TOKEN, "TEST123")).toHaveProperty("test_event_code", "TEST123");
    expect(eventsBody([event], TOKEN, "")).not.toHaveProperty("test_event_code");
  });

  it("reads Meta's answer", () => {
    expect(readMetaAnswer(200, { events_received: 1 })).toEqual({ sent: true, received: 1 });
    expect(readMetaAnswer(400, { error: { message: "Invalid OAuth access token" } })).toEqual({
      sent: false,
      reason: "refused",
      detail: "Invalid OAuth access token",
    });
  });

  it("accepts a pasted token and nothing else", () => {
    expect(cleanToken(`  ${TOKEN}\n`)).toBe(TOKEN);
    expect(cleanToken("short")).toBeNull();
    expect(cleanToken("has spaces in the middle of it 123456")).toBeNull();
  });

  it("gives the pixel Meta's names beside Google's", () => {
    expect(
      metaPayload({
        currency: "BHD",
        value: 30,
        transaction_id: "o1",
        items: [{ item_id: "p1", price: 15, quantity: 2 }],
      }),
    ).toEqual({
      currency: "BHD",
      value: 30,
      content_type: "product",
      content_ids: ["p1"],
      contents: [{ id: "p1", quantity: 2, item_price: 15 }],
      num_items: 2,
      order_id: "o1",
    });
  });
});

describe("the purchase the server sends", () => {
  it("is read from the fresh order and sent under the pixel's event id", async () => {
    const brand = newBrand();
    store({ brand, order: freshOrder(brand) });
    const result = await fns.sendMetaPurchase({
      data: {
        orderId: "00000000-0000-4000-8000-0000000000d1",
        pageUrl: "https://pura.boutq.store/pura/checkout?x=1",
        fbp: "fb.1.1700000000000.42",
      },
    });
    expect(result).toEqual({ sent: true, received: 1 });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://graph.facebook.com/v25.0/123456789012345/events",
    );
    const body = sentBody();
    expect(body.access_token).toBe(TOKEN);
    const [event] = body.data;
    expect(event.event_name).toBe("Purchase");
    expect(event.event_id).toBe("purchase:00000000-0000-4000-8000-0000000000d1");
    expect(event.event_source_url).toBe("https://pura.boutq.store/pura/checkout");
    expect(event.custom_data.value).toBe(48.5);
    expect(event.custom_data.num_items).toBe(3);
    expect(event.user_data.em).toEqual([await sha256Hex("sara@example.com")]);
    expect(event.user_data.ph).toEqual([await sha256Hex("97339950016")]);
    expect(event.user_data.client_user_agent).toBe("Mozilla/5.0 Test");
    expect(event.user_data.fbp).toBe("fb.1.1700000000000.42");
  });

  it("sends nothing for an old order, a staff order or a missing one", async () => {
    const brand = newBrand();
    const old = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    for (const order of [
      freshOrder(brand, { created_at: old }),
      freshOrder(brand, { channel: "admin" }),
      null,
    ]) {
      store({ brand, order });
      expect(
        await fns.sendMetaPurchase({ data: { orderId: "00000000-0000-4000-8000-0000000000d1" } }),
      ).toEqual({ sent: false, reason: "not_found" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing for a store with no token or with the pixel off", async () => {
    for (const setup of [{ token: null }, { pixel: false }]) {
      const brand = newBrand();
      store({ brand, order: freshOrder(brand), ...setup });
      expect(
        await fns.sendMetaPurchase({ data: { orderId: "00000000-0000-4000-8000-0000000000d1" } }),
      ).toEqual({ sent: false, reason: "off" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers, never throws, when Meta cannot be reached", async () => {
    const brand = newBrand();
    store({ brand, order: freshOrder(brand) });
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect(
      await fns.sendMetaPurchase({ data: { orderId: "00000000-0000-4000-8000-0000000000d1" } }),
    ).toEqual({ sent: false, reason: "unreachable" });
  });
});

describe("a shopping step the server sends", () => {
  it("carries the browser's event id and the product", async () => {
    const brand = newBrand();
    store({ brand });
    await fns.sendMetaBrowsingEvent({
      data: {
        brandId: brand,
        event: "add_to_cart",
        eventId: "evt-1234567890",
        currency: "BHD",
        value: 15,
        contentIds: ["p1"],
        numItems: 1,
      },
    });
    const [event] = sentBody().data;
    expect(event).toMatchObject({
      event_name: "AddToCart",
      event_id: "evt-1234567890",
      custom_data: { currency: "BHD", value: 15, content_ids: ["p1"], num_items: 1 },
    });
    expect(event.user_data).not.toHaveProperty("em");
  });

  it("refuses a page view or anything it does not send", async () => {
    await expect(
      fns.sendMetaBrowsingEvent({
        data: { brandId: newBrand(), event: "page_view", eventId: "evt-1234567890" },
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the Integrations page's test", () => {
  it("sends one event under Events Manager's test code, for a store admin", async () => {
    const brand = newBrand();
    store({ brand });
    const user = fakeSupabase({ rpc: { can_access_brand: true, is_admin: true } });
    const result = await fns.testMetaConversions({
      data: { brandId: brand, testEventCode: "TEST123" },
      context: { supabase: user.supabase },
    });
    expect(result).toEqual({ sent: true, received: 1 });
    expect(sentBody().test_event_code).toBe("TEST123");
  });

  it("is refused to anyone who is not the store's admin", async () => {
    const brand = newBrand();
    store({ brand });
    const user = fakeSupabase({ rpc: { can_access_brand: true, is_admin: false } });
    await expect(
      fns.testMetaConversions({
        data: { brandId: brand, testEventCode: "TEST123" },
        context: { supabase: user.supabase },
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
