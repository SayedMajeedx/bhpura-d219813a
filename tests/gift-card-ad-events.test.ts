import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";
import { sha256Hex } from "../src/lib/ad-events/shared";
import {
  GIFT_CARD_CONTENT_ID,
  giftCardPixelPayload,
  giftCardPurchaseEvent,
  giftCardPurchaseFresh,
  giftCardPurchaseTotal,
  type GiftCardPurchaseRow,
} from "../src/lib/ad-events/gift-card-events";

// A gift card bought on the storefront reaches the store's ad platforms as a purchase, as an order
// does: the pixel and the server under one event id, its value read from the purchase the database
// wrote (the card's value and the printing fee), never from the browser. Before this a card
// purchase reached no platform, so an ad for gift cards could not learn who buys them.

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
  sendAdGiftCardPurchase: ServerFn;
};

const PURCHASE_ID = "00000000-0000-4000-8000-0000000000c7";
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
let brandCount = 900;
const newBrand = () => `00000000-0000-4000-8000-${String(++brandCount).padStart(12, "0")}`;

function purchase(brand: string, overrides: Partial<GiftCardPurchaseRow> = {}) {
  return {
    id: PURCHASE_ID,
    brand_id: brand,
    created_at: new Date().toISOString(),
    status: "awaiting_transfer",
    currency: "BHD",
    amount: 30,
    total_due: 32,
    buyer_name: "Sara Ahmed",
    buyer_email: "sara@example.com",
    buyer_phone: "+973 3995 0016",
    ...overrides,
  };
}

function store(row: Record<string, unknown> | null, tokens: Partial<typeof TOKENS> = TOKENS) {
  const fake = fakeSupabase({
    rows: {
      gift_card_purchases: row,
      brand_tracking_settings: {
        meta_pixel_enabled: true,
        meta_pixel_id: PIXELS.meta,
        tiktok_pixel_enabled: true,
        tiktok_pixel_id: PIXELS.tiktok,
        snap_pixel_enabled: true,
        snap_pixel_id: PIXELS.snap,
      },
    },
  });
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

const fetchMock = vi.fn();
beforeEach(() => {
  state.ip = `10.0.9.${++ipCount}`;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("tiktok")) return new Response(JSON.stringify({ code: 0, message: "OK" }));
    if (url.includes("snapchat")) return new Response(JSON.stringify({ status: "VALID" }));
    return new Response(JSON.stringify({ events_received: 1 }));
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function sent() {
  const out: Record<string, any> = {};
  for (const [url, init] of fetchMock.mock.calls)
    out[new URL(url).host] = { url, body: JSON.parse(String(init.body)) };
  return out;
}

describe("the rules", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");

  it("count what the buyer pays: the card and the printing fee", () => {
    expect(giftCardPurchaseTotal({ amount: 30, total_due: 32 })).toBe(32);
    expect(giftCardPurchaseTotal({ amount: 25, total_due: null })).toBe(25);
    expect(giftCardPurchaseTotal({ amount: null, total_due: null })).toBe(0);
  });

  it("send a purchase while it is fresh and not cancelled", () => {
    const at = (hours: number) => new Date(now - hours * 3600_000).toISOString();
    expect(giftCardPurchaseFresh({ created_at: at(1), status: "paid" }, now)).toBe(true);
    expect(giftCardPurchaseFresh({ created_at: at(7), status: "paid" }, now)).toBe(false);
    expect(giftCardPurchaseFresh({ created_at: at(1), status: "cancelled" }, now)).toBe(false);
    expect(giftCardPurchaseFresh({ created_at: null, status: "paid" }, now)).toBe(false);
  });

  it("describe the purchase as one gift card, under the pixel's own event id", () => {
    const event = giftCardPurchaseEvent(
      { ...purchase("b1"), created_at: new Date(now - 60_000).toISOString() },
      { now, visit: {} },
    );
    expect(event).toMatchObject({
      event: "purchase",
      eventId: `purchase:${PURCHASE_ID}`,
      shopper: { email: "sara@example.com", name: "Sara Ahmed" },
      order: {
        id: PURCHASE_ID,
        currency: "BHD",
        total: 32,
        lines: [{ productId: GIFT_CARD_CONTENT_ID, quantity: 1, lineTotal: 32 }],
      },
    });
    expect(
      giftCardPurchaseEvent({ ...purchase("b1"), total_due: 0, amount: 0 }, { now, visit: {} }),
    ).toBeNull();
  });

  it("tell the pixels the card as checkout tells them an order", () => {
    expect(giftCardPixelPayload({ purchaseId: "p1", currency: "BHD", value: 32 })).toEqual({
      transaction_id: "p1",
      gift_card_purchase_id: "p1",
      currency: "BHD",
      value: 32,
      items: [{ item_id: "gift-card", item_name: "Gift card", price: 32, quantity: 1 }],
    });
    // A view has no purchase yet, and no amount chosen.
    expect(giftCardPixelPayload({ currency: "BHD", value: Number.NaN })).not.toHaveProperty(
      "transaction_id",
    );
  });
});

describe("the server's send", () => {
  it("reaches every platform the store set up, with the value the database wrote", async () => {
    store(purchase(newBrand()));
    const result = await fns.sendAdGiftCardPurchase({
      data: { purchaseId: PURCHASE_ID, pageUrl: "https://pura.boutq.store/pura/gift-cards" },
    });
    expect(result).toEqual({
      meta: { sent: true, received: 1 },
      tiktok: { sent: true, received: 1 },
      snap: { sent: true, received: 1 },
    });
    const bodies = sent();
    expect(bodies["graph.facebook.com"].body.data[0]).toMatchObject({
      event_name: "Purchase",
      event_id: `purchase:${PURCHASE_ID}`,
      custom_data: { value: 32, currency: "BHD", content_ids: ["gift-card"] },
    });
    expect(bodies["business-api.tiktok.com"].body.data[0]).toMatchObject({
      event: "CompletePayment",
      event_id: `purchase:${PURCHASE_ID}`,
      user: { phone: await sha256Hex("+97339950016") },
    });
    expect(bodies["tr.snapchat.com"].body.data[0]).toMatchObject({ event_name: "PURCHASE" });
  });

  it("sends nothing for an old, cancelled or missing purchase, or a store with nothing set up", async () => {
    const brand = newBrand();
    const old = new Date(Date.now() - 7 * 3600_000).toISOString();
    store(purchase(brand, { created_at: old }));
    expect(await fns.sendAdGiftCardPurchase({ data: { purchaseId: PURCHASE_ID } })).toEqual({
      skipped: "not_found",
    });
    store(purchase(brand, { status: "cancelled" }));
    expect(await fns.sendAdGiftCardPurchase({ data: { purchaseId: PURCHASE_ID } })).toEqual({
      skipped: "not_found",
    });
    store(null);
    expect(await fns.sendAdGiftCardPurchase({ data: { purchaseId: PURCHASE_ID } })).toEqual({
      skipped: "not_found",
    });
    store(purchase(newBrand()), {});
    expect(await fns.sendAdGiftCardPurchase({ data: { purchaseId: PURCHASE_ID } })).toEqual({
      skipped: "off",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
