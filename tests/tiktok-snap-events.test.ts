import { describe, expect, it } from "vitest";
import { sha256Hex, type AdEvent } from "../src/lib/ad-events/shared";
import {
  readTiktokAnswer,
  tiktokPhone,
  tiktokPlatform,
  validTiktokPixel,
} from "../src/lib/ad-events/tiktok-events";
import {
  readSnapAnswer,
  snapEndpoint,
  snapEventId,
  snapPlatform,
  validSnapPixel,
} from "../src/lib/ad-events/snap-conversions";
import { landingClicks, snapPixelCall, tiktokPixelCall } from "../src/lib/ad-events/pixel-calls";
import { trackingProblem, typedPixel, testResultText } from "../src/lib/ad-events/platform-words";
import { pixelOf } from "../src/lib/ad-events/platforms";

// TikTok's Events API and Snapchat's Conversions API, beside Meta's: the same event in each
// platform's words, its own hashing rules, the ids each matches the pixel's on, and what the
// Integrations page checks before it saves.

const TIKTOK_PIXEL = "C4ABCD1234567890ABCD";
const SNAP_PIXEL = "5c1a2b3d-0000-4000-8000-abcdef012345";

const purchase: AdEvent = {
  event: "purchase",
  eventId: "purchase:o-1",
  now: 1_700_000_000_900,
  pageUrl: "https://pura.boutq.store/pura/checkout?token=secret",
  shopper: {
    email: " Sara@Example.com ",
    phone: "+973 3995 0016",
    name: "Sara Ahmed",
    country: "BH",
    customerId: "c-1",
  },
  visit: {
    ip: "1.2.3.4",
    userAgent: "UA",
    ttp: "ttp.abc_123",
    ttclid: "E.C.P.xyz123",
    scid: "scid-abc-123",
    scClickId: "sc-click-1",
  },
  order: {
    id: "o-1",
    currency: "bhd",
    total: 48.5,
    lines: [
      { productId: "p1", quantity: 2, lineTotal: 30 },
      { productId: "p2", quantity: 1, lineTotal: 18.5 },
    ],
  },
};

const view: AdEvent = {
  event: "view_item",
  eventId: "evt-12345678",
  now: 1_700_000_000_000,
  pageUrl: "https://pura.boutq.store/pura/product/p1",
  shopper: {},
  visit: { ip: "1.2.3.4", userAgent: "UA" },
  browsing: { currency: "BHD", value: 15, contentIds: ["p1"], numItems: 1 },
};

describe("TikTok's Events API", () => {
  it("sends a purchase as CompletePayment, from the order, under the pixel's id", async () => {
    const request = await tiktokPlatform.request(TIKTOK_PIXEL, "tok123", purchase);
    expect(request.url).toBe("https://business-api.tiktok.com/open_api/v1.3/event/track/");
    expect(request.headers["Access-Token"]).toBe("tok123");
    const body = request.body as { event_source: string; event_source_id: string; data: any[] };
    expect(body).toMatchObject({ event_source: "web", event_source_id: TIKTOK_PIXEL });
    const [event] = body.data;
    expect(event).toMatchObject({
      event: "CompletePayment",
      event_id: "purchase:o-1",
      event_time: 1_700_000_000,
      page: { url: "https://pura.boutq.store/pura/checkout" },
      properties: {
        currency: "BHD",
        value: 48.5,
        order_id: "o-1",
        contents: [
          { content_id: "p1", quantity: 2, price: 15 },
          { content_id: "p2", quantity: 1, price: 18.5 },
        ],
      },
    });
    expect(event.user.email).toBe(await sha256Hex("sara@example.com"));
    expect(event.user.phone).toBe(await sha256Hex("+97339950016"));
    expect(event.user).toMatchObject({ ip: "1.2.3.4", ttclid: "E.C.P.xyz123", ttp: "ttp.abc_123" });
    expect(JSON.stringify(event)).not.toContain("Sara");
  });

  it("writes a phone as TikTok hashes it: international, with a plus", () => {
    expect(tiktokPhone("00973 3995 0016")).toBe("+97339950016");
    expect(tiktokPhone("12")).toBeNull();
  });

  it("sends a test under its events tool's code, and reads its answer", async () => {
    const request = await tiktokPlatform.testRequest(TIKTOK_PIXEL, "tok123", view, "TEST42");
    expect(request.body).toHaveProperty("test_event_code", "TEST42");
    expect(readTiktokAnswer(200, { code: 0, message: "OK" })).toEqual({ sent: true, received: 1 });
    expect(readTiktokAnswer(200, { code: 40001, message: "Access token invalid" })).toEqual({
      sent: false,
      reason: "refused",
      detail: "Access token invalid",
    });
  });

  it("knows its pixel code", () => {
    expect(validTiktokPixel(TIKTOK_PIXEL)).toBe(true);
    expect(validTiktokPixel("c4abcd1234567890abcd")).toBe(false);
    expect(validTiktokPixel("123")).toBe(false);
  });
});

describe("Snapchat's Conversions API", () => {
  it("sends a purchase under the order's id, which the pixel sends as its transaction id", async () => {
    const request = await snapPlatform.request(SNAP_PIXEL, "eyJ.tok", purchase);
    expect(request.url).toBe(
      `https://tr.snapchat.com/v3/${SNAP_PIXEL}/events?access_token=eyJ.tok`,
    );
    const [event] = (request.body as { data: any[] }).data;
    expect(event).toMatchObject({
      event_name: "PURCHASE",
      action_source: "WEB",
      event_id: "o-1",
      event_time: 1_700_000_000,
      event_source_url: "https://pura.boutq.store/pura/checkout",
      custom_data: { currency: "BHD", value: 48.5, order_id: "o-1", num_items: "3" },
    });
    expect(event.user_data.ph).toEqual([await sha256Hex("97339950016")]);
    expect(event.user_data.em).toEqual([await sha256Hex("sara@example.com")]);
    expect(event.user_data).toMatchObject({
      sc_click_id: "sc-click-1",
      sc_cookie1: "scid-abc-123",
    });
    expect(
      snapPixelCall("purchase", { transaction_id: "o-1", value: 48.5 }, "purchase:o-1")?.props,
    ).toMatchObject({ transaction_id: "o-1" });
  });

  it("names a browsing event by the id the pixel sends as its dedup id", async () => {
    expect(snapEventId(view)).toBe("evt-12345678");
    expect(snapPixelCall("view_item", {}, "evt-12345678")?.props).toMatchObject({
      client_dedup_id: "evt-12345678",
    });
    const [event] = (
      (await snapPlatform.request(SNAP_PIXEL, "eyJ.tok", view)).body as { data: any[] }
    ).data;
    expect(event).toMatchObject({
      event_name: "VIEW_CONTENT",
      custom_data: { content_ids: ["p1"] },
    });
  });

  it("tests at its validation address, which records nothing", async () => {
    const request = await snapPlatform.testRequest(SNAP_PIXEL, "eyJ.tok", view);
    expect(request.url).toBe(snapEndpoint(SNAP_PIXEL, "eyJ.tok", true));
    expect(request.url).toContain("/events/validate?");
  });

  it("reads its answer", () => {
    expect(readSnapAnswer(200, { status: "VALID" })).toEqual({ sent: true, received: 1 });
    expect(readSnapAnswer(200, { status: "INVALID", reason: "Missing event_name" })).toMatchObject({
      sent: false,
      detail: "Missing event_name",
    });
    expect(readSnapAnswer(401, { message: "Unauthorized" })).toMatchObject({
      sent: false,
      detail: "Unauthorized",
    });
  });

  it("knows its pixel id", () => {
    expect(validSnapPixel(SNAP_PIXEL)).toBe(true);
    expect(validSnapPixel("5C1A2B3D-0000-4000-8000-ABCDEF012345")).toBe(false);
  });
});

describe("the storefront's pixels", () => {
  it("tell TikTok a page view as a page, and an add with its event id", () => {
    expect(tiktokPixelCall("page_view", {}, "x")).toEqual({ kind: "page" });
    expect(
      tiktokPixelCall(
        "add_to_cart",
        { currency: "BHD", value: 15, items: [{ item_id: "p1", price: 15, quantity: 1 }] },
        "evt-1",
      ),
    ).toEqual({
      kind: "track",
      name: "AddToCart",
      props: {
        content_type: "product",
        currency: "BHD",
        value: 15,
        contents: [{ content_id: "p1", quantity: 1, price: 15 }],
      },
      options: { event_id: "evt-1" },
    });
  });

  it("keep each ad's click id from the landing address", () => {
    expect(
      landingClicks("?ttclid=E.C.P.abc&ScCid=sc-1&fbclid=IwAR2abcDEF_123", 1700000000000),
    ).toEqual({
      fbc: "fb.1.1700000000000.IwAR2abcDEF_123",
      ttclid: "E.C.P.abc",
      scClickId: "sc-1",
    });
    expect(landingClicks("?ttclid=<script>", 1)).toEqual({
      fbc: null,
      ttclid: null,
      scClickId: null,
    });
  });
});

describe("the Integrations page", () => {
  const form = {
    google_analytics_enabled: false,
    google_analytics_id: "",
    meta: { enabled: false, id: "" },
    tiktok: { enabled: true, id: TIKTOK_PIXEL },
    snap: { enabled: true, id: SNAP_PIXEL },
  };

  it("saves pixel ids of each platform's shape, and says which one is wrong", () => {
    expect(trackingProblem(form, false)).toBeNull();
    expect(trackingProblem({ ...form, snap: { enabled: true, id: "abc" } }, false)).toBe(
      "The Snap Pixel ID is not valid: Pixel ID as Snapchat shows it",
    );
    expect(trackingProblem({ ...form, snap: { enabled: false, id: "abc" } }, false)).toBeNull();
  });

  it("keeps a typed id to its platform's characters", () => {
    expect(typedPixel("tiktok", "c4ab cd-12")).toBe("C4ABCD12");
    expect(typedPixel("snap", " 5C1A-2b ")).toBe("5c1a-2b");
    expect(typedPixel("meta", "12 34a")).toBe("1234");
  });

  it("reads a pixel only when it is on and of its shape", () => {
    expect(pixelOf("tiktok", { tiktok_pixel_enabled: true, tiktok_pixel_id: TIKTOK_PIXEL })).toBe(
      TIKTOK_PIXEL,
    );
    expect(
      pixelOf("tiktok", { tiktok_pixel_enabled: false, tiktok_pixel_id: TIKTOK_PIXEL }),
    ).toBeNull();
    expect(pixelOf("snap", { snap_pixel_enabled: true, snap_pixel_id: "nope" })).toBeNull();
  });

  it("says what each platform's test answered", () => {
    expect(testResultText("snap", { sent: true, received: 1 }, false)).toBe(
      "Snapchat checked the event and found it valid.",
    );
    expect(
      testResultText(
        "tiktok",
        { sent: false, reason: "refused", detail: "Access token invalid" },
        false,
      ),
    ).toBe("TikTok refused the event: Access token invalid");
  });
});
