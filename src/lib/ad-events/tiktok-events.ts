import {
  cleanBrowsing,
  clientAgent,
  clientIp,
  hashOf,
  normalEmail,
  normalPhone,
  orderPieces,
  plainId,
  sourceUrl,
  type AdEvent,
  type AdPlatform,
  type SendResult,
  type ServerEvent,
} from "./shared";

/**
 * TikTok's Events API (v1.3): the store's server sends TikTok the same events as its pixel, so
 * TikTok ads learn from sales the pixel missed. Pure: the request in TikTok's words. TikTok counts
 * an event once when the pixel and the server send it with the same `event_id`, the ids the
 * storefront gives both (`purchase:<order>`, else the browser's own).
 */

/** The credential the store's Events API access token is kept under (encrypted). */
export const TIKTOK_EVENTS_PROVIDER = "tiktok_events";

export const TIKTOK_ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

/**
 * The storefront events by TikTok's standard names. A purchase is `CompletePayment`, the name
 * every TikTok setup recognises (its newer `Purchase` is not read everywhere yet).
 */
export const TIKTOK_EVENTS: Record<ServerEvent, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "CompletePayment",
};

/** A TikTok pixel code as TikTok gives it: upper-case letters and digits. */
export function validTiktokPixel(value: string | null | undefined): value is string {
  return /^[A-Z0-9]{15,30}$/.test(String(value ?? ""));
}

/** TikTok's phone rule: the international format, "+" and the digits, then hashed. */
export function tiktokPhone(value: string | null | undefined): string | null {
  const digits = normalPhone(value);
  return digits ? `+${digits}` : null;
}

async function tiktokUser(event: AdEvent) {
  const user: Record<string, unknown> = {
    email: await hashOf(normalEmail(event.shopper.email)),
    phone: await hashOf(tiktokPhone(event.shopper.phone)),
    external_id: await hashOf(event.shopper.customerId ? String(event.shopper.customerId) : null),
    ip: clientIp(event.visit),
    user_agent: clientAgent(event.visit),
    ttclid: plainId(event.visit.ttclid) ?? undefined,
    ttp: plainId(event.visit.ttp) ?? undefined,
  };
  return Object.fromEntries(Object.entries(user).filter(([, value]) => value !== undefined));
}

/** `properties`: a purchase from the order the database wrote, else what the storefront said. */
export function tiktokProperties(event: AdEvent) {
  if (event.order) {
    return {
      currency: event.order.currency.toUpperCase(),
      value: Math.max(0, Number(event.order.total.toFixed(3))),
      content_type: "product",
      order_id: event.order.id,
      contents: orderPieces(event.order).map((piece) => ({
        content_id: piece.id,
        quantity: piece.quantity,
        price: piece.price,
      })),
    };
  }
  const clean = cleanBrowsing(event.browsing ?? {});
  const out: Record<string, unknown> = { content_type: "product" };
  if (clean.currency) out.currency = clean.currency;
  if (clean.value !== undefined) out.value = clean.value;
  if (clean.contentIds.length) out.contents = clean.contentIds.map((id) => ({ content_id: id }));
  return out;
}

export async function tiktokBody(pixelId: string, event: AdEvent, testCode?: string | null) {
  const url = sourceUrl(event.pageUrl);
  const test = String(testCode ?? "").trim();
  return {
    event_source: "web",
    event_source_id: pixelId,
    ...(/^[A-Za-z0-9]{3,40}$/.test(test) ? { test_event_code: test } : {}),
    data: [
      {
        event: TIKTOK_EVENTS[event.event],
        event_time: Math.floor(event.now / 1000),
        event_id: event.eventId.slice(0, 200),
        user: await tiktokUser(event),
        ...(url ? { page: { url } } : {}),
        properties: tiktokProperties(event),
      },
    ],
  };
}

/** TikTok answers `code: 0` when it took the events, else a code and a message. */
export function readTiktokAnswer(status: number, body: unknown): SendResult {
  const answer = (body ?? {}) as { code?: number; message?: string };
  if (status >= 200 && status < 300 && answer.code === 0) return { sent: true, received: 1 };
  const message = answer.message ? String(answer.message).slice(0, 300) : undefined;
  return { sent: false, reason: "refused", detail: message ?? `HTTP ${status}` };
}

async function tiktokRequest(
  pixelId: string,
  token: string,
  event: AdEvent,
  testCode?: string | null,
) {
  return {
    url: TIKTOK_ENDPOINT,
    headers: { "Content-Type": "application/json", "Access-Token": token },
    body: await tiktokBody(pixelId, event, testCode),
  };
}

export const tiktokPlatform: AdPlatform = {
  credential: TIKTOK_EVENTS_PROVIDER,
  validPixel: validTiktokPixel,
  request: tiktokRequest,
  testRequest: tiktokRequest,
  readAnswer: readTiktokAnswer,
};
