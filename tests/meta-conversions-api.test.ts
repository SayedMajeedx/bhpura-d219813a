import { describe, expect, it } from "vitest";
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

// Meta's Conversions API, its pure rules: a shopper's details normalised and hashed, the event in
// Meta's words and Meta's answer. The server sending to every platform is tests/ad-events-server.test.ts.

const TOKEN = "EAAGtesttokenvalue1234567890abcdef";

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
