import { describe, expect, it } from "vitest";
import {
  alertChoice,
  encryptPayload,
  fromBase64Url,
  pushOutcome,
  toBase64Url,
  vapidAuthorization,
  webPushRequest,
} from "../supabase/functions/send-mobile-push/web-push";

// The browser's side of RFC 8291: what a push service hands the service worker is decrypted with
// the subscription's own keys. If this test can read the message, a browser can.
const enc = new TextEncoder();
const dec = new TextDecoder();

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8),
  );
}

async function browserSubscription() {
  const keys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const p256dh = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    keys,
    sub: {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      p256dh: toBase64Url(p256dh),
      auth: toBase64Url(auth),
    },
  };
}

async function browserDecrypt(
  body: Uint8Array,
  keys: CryptoKeyPair,
  sub: { p256dh: string; auth: string },
) {
  const salt = body.slice(0, 16);
  const idLength = body[20];
  const asPublic = body.slice(21, 21 + idLength);
  const cipher = body.slice(21 + idLength);
  const asKey = await crypto.subtle.importKey(
    "raw",
    asPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, keys.privateKey, 256),
  );
  const uaPublic = fromBase64Url(sub.p256dh);
  const info = new Uint8Array([...enc.encode("WebPush: info\0"), ...uaPublic, ...asPublic]);
  const ikm = await hkdf(fromBase64Url(sub.auth), shared, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, cipher),
  );
  expect(plain[plain.length - 1]).toBe(2); // the last record's delimiter
  return dec.decode(plain.slice(0, -1));
}

async function vapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return {
    pair,
    keys: { publicKey: toBase64Url(raw), privateKey: jwk.d!, subject: "https://boutq.store" },
  };
}

describe("web push for the installed admin", () => {
  it("encrypts a message only that browser can read", async () => {
    const { keys, sub } = await browserSubscription();
    const message = JSON.stringify({
      title: "طلب جديد #1042",
      body: "Sara — 25.000 BHD",
      url: "/x",
    });
    const body = await encryptPayload(sub, enc.encode(message));
    expect(body.length).toBeLessThan(4096);
    expect(await browserDecrypt(body, keys, sub)).toBe(message);

    // Another browser's keys cannot read it.
    const other = await browserSubscription();
    await expect(browserDecrypt(body, other.keys, sub)).rejects.toThrow();
  });

  it("signs a VAPID token for the push service's origin, verifiable with the public key", async () => {
    const { pair, keys } = await vapidKeys();
    const now = Date.UTC(2026, 9, 27, 12);
    const header = await vapidAuthorization("https://web.push.apple.com/QABC/xyz", keys, now);
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(keys.publicKey);
    const [h, c, s] = token.split(".");
    const claims = JSON.parse(dec.decode(fromBase64Url(c)));
    expect(claims).toMatchObject({ aud: "https://web.push.apple.com", sub: "https://boutq.store" });
    expect(claims.exp).toBe(now / 1000 + 12 * 3600);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pair.publicKey,
      fromBase64Url(s),
      enc.encode(`${h}.${c}`),
    );
    expect(valid).toBe(true);
  });

  it("asks the push service to deliver at once and keep it a day", async () => {
    const { keys: browserKeys, sub } = await browserSubscription();
    const { keys } = await vapidKeys();
    const message = {
      title: "New order",
      body: "Sara",
      url: "/admin/b/pura/orders/1",
      tag: "order-new:1",
    };
    const { url, init } = await webPushRequest(sub, message, keys);
    expect(url).toBe(sub.endpoint);
    expect(init.headers).toMatchObject({
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Urgency: "high",
      Topic: "order-new1",
    });
    expect(JSON.parse(await browserDecrypt(init.body as Uint8Array, browserKeys, sub))).toEqual(
      message,
    );
  });

  it("forgets a subscription the browser dropped, and retries anything else", () => {
    expect(pushOutcome(201)).toBe("sent");
    expect(pushOutcome(410)).toBe("gone");
    expect(pushOutcome(404)).toBe("gone");
    expect(pushOutcome(429)).toBe("failed");
    expect(pushOutcome(500)).toBe("failed");
  });
});

describe("which choice an event answers to", () => {
  it("is its kind, except a new order staff typed in themselves", () => {
    expect(alertChoice({ event_type: "order_new", payload: { channel: "storefront" } })).toBe(
      "order_new",
    );
    expect(alertChoice({ event_type: "order_new", payload: { channel: "admin" } })).toBe(
      "order_new_staff",
    );
    // An event written before orders said their channel counts as a shopper's.
    expect(alertChoice({ event_type: "order_new", payload: {} })).toBe("order_new");
    expect(alertChoice({ event_type: "booking_new", payload: null })).toBe("booking_new");
    expect(alertChoice({ event_type: "low_stock" })).toBe("low_stock");
  });
});
