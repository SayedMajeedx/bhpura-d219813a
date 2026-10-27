/**
 * Web Push for the installed admin (a phone's home-screen app, a laptop's): a message encrypted
 * for one browser's subscription (RFC 8291, `aes128gcm`) and signed with the platform's VAPID key
 * (RFC 8292), sent to the browser's push service, which wakes the service worker
 * (`public/admin-sw.js`) even while the app is closed. Web Crypto only, so the same code runs in
 * the edge function (Deno) and in the tests (Node), which decrypt what it writes.
 */

export type WebPushSubscription = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { publicKey: string; privateKey: string; subject: string };
export type WebPushMessage = { title: string; body: string; url: string; tag?: string };

const enc = new TextEncoder();

export function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** The body for one subscription: `aes128gcm`, one record, a fresh key and salt each time. */
export async function encryptPayload(
  sub: Pick<WebPushSubscription, "p256dh" | "auth">,
  plaintext: Uint8Array,
  fixed?: { serverKeys?: CryptoKeyPair; salt?: Uint8Array },
): Promise<Uint8Array> {
  const uaPublic = fromBase64Url(sub.p256dh);
  const authSecret = fromBase64Url(sub.auth);
  const serverKeys =
    fixed?.serverKeys ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey));
  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, serverKeys.privateKey, 256),
  );
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // One record: the message, then the delimiter that says it is the last.
  const record = concat(plaintext, new Uint8Array([2]));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record),
  );
  const recordSize = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** The VAPID header for a push service: a short ES256 token for its origin, and the public key. */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  now = Date.now(),
): Promise<string> {
  const publicBytes = fromBase64Url(keys.publicKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: keys.privateKey,
      x: toBase64Url(publicBytes.slice(1, 33)),
      y: toBase64Url(publicBytes.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = toBase64Url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = toBase64Url(
    enc.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 60 * 60,
        sub: keys.subject,
      }),
    ),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      enc.encode(`${header}.${claims}`),
    ),
  );
  return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${keys.publicKey}`;
}

/**
 * The request that delivers one message: high urgency (a new order is worth waking a phone), kept
 * by the push service for a day if the device is off, and replacing an earlier one of the same tag.
 */
export async function webPushRequest(
  sub: WebPushSubscription,
  message: WebPushMessage,
  keys: VapidKeys,
): Promise<{ url: string; init: RequestInit }> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)));
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(sub.endpoint, keys),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(24 * 60 * 60),
    Urgency: "high",
  };
  if (message.tag) headers.Topic = message.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  return { url: sub.endpoint, init: { method: "POST", headers, body } };
}

/** What a push service's answer means for the subscription: kept, or gone for good. */
export function pushOutcome(status: number): "sent" | "gone" | "failed" {
  if (status >= 200 && status < 300) return "sent";
  // 404 and 410: the browser unsubscribed or the subscription expired; it will not come back.
  if (status === 404 || status === 410) return "gone";
  return "failed";
}

/**
 * Which of a device's choices an event answers to (Settings → Account → Mobile Apps): its kind,
 * except a new order a member of staff typed in themselves, which has a choice of its own.
 */
export function alertChoice(event: {
  event_type: string;
  payload?: { channel?: unknown } | null;
}): string {
  if (event.event_type === "order_new" && event.payload?.channel === "admin") {
    return "order_new_staff";
  }
  return event.event_type;
}
