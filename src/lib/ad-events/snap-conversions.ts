import {
  cleanBrowsing,
  clientAgent,
  clientIp,
  hashOf,
  normalCountry,
  normalEmail,
  normalName,
  normalPhone,
  orderPieces,
  plainId,
  sourceUrl,
  splitName,
  type AdEvent,
  type AdPlatform,
  type SendResult,
  type ServerEvent,
} from "./shared";

/**
 * Snapchat's Conversions API (v3): the store's server sends Snapchat the same events as its pixel.
 * Pure: the request in Snapchat's words. Snapchat counts an event once when the pixel and the
 * server name it the same: a purchase by the pixel's `transaction_id` (the order's id, which the
 * server sends as its `event_id`), anything else by the pixel's `client_dedup_id` (the id the
 * storefront gives both).
 */

/** The credential the store's Conversions API token is kept under (encrypted). */
export const SNAP_CAPI_PROVIDER = "snap_capi";

/** The storefront events by Snapchat's standard names. */
export const SNAP_EVENTS: Record<ServerEvent, string> = {
  view_item: "VIEW_CONTENT",
  add_to_cart: "ADD_CART",
  begin_checkout: "START_CHECKOUT",
  purchase: "PURCHASE",
};

/** A Snap pixel id as Snapchat gives it: a UUID. */
export function validSnapPixel(value: string | null | undefined): value is string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(value ?? ""));
}

/** The id Snapchat matches the pixel's on: a purchase's order id, else the event's own id. */
export function snapEventId(event: AdEvent): string {
  return (event.order ? event.order.id : event.eventId).slice(0, 200);
}

async function snapUser(event: AdEvent) {
  const { first, last } = splitName(event.shopper.name);
  const hashed = async (value: string | null) => {
    const hash = await hashOf(value);
    return hash ? [hash] : undefined;
  };
  const user: Record<string, unknown> = {
    em: await hashed(normalEmail(event.shopper.email)),
    ph: await hashed(normalPhone(event.shopper.phone)),
    fn: await hashed(normalName(first)),
    ln: await hashed(normalName(last)),
    country: await hashed(normalCountry(event.shopper.country)),
    external_id: await hashed(event.shopper.customerId ? String(event.shopper.customerId) : null),
    client_ip_address: clientIp(event.visit),
    client_user_agent: clientAgent(event.visit),
    sc_click_id: plainId(event.visit.scClickId) ?? undefined,
    sc_cookie1: plainId(event.visit.scid) ?? undefined,
  };
  return Object.fromEntries(Object.entries(user).filter(([, value]) => value !== undefined));
}

/** `custom_data`: a purchase from the order the database wrote, else what the storefront said. */
export function snapCustomData(event: AdEvent) {
  if (event.order) {
    const pieces = orderPieces(event.order);
    return {
      currency: event.order.currency.toUpperCase(),
      value: Math.max(0, Number(event.order.total.toFixed(3))),
      order_id: event.order.id,
      content_ids: [...new Set(pieces.map((piece) => piece.id))],
      contents: pieces.map((piece) => ({
        id: piece.id,
        quantity: piece.quantity,
        item_price: piece.price,
      })),
      // Snapchat reads the count as text.
      num_items: String(pieces.reduce((sum, piece) => sum + piece.quantity, 0)),
    };
  }
  const clean = cleanBrowsing(event.browsing ?? {});
  const out: Record<string, unknown> = {};
  if (clean.currency) out.currency = clean.currency;
  if (clean.value !== undefined) out.value = clean.value;
  if (clean.contentIds.length) out.content_ids = clean.contentIds;
  if (clean.numItems !== undefined) out.num_items = String(clean.numItems);
  return out;
}

/** Snapchat asks every event's page; a test with none names the platform's own address. */
const NO_PAGE = "https://boutq.store/";

export async function snapBody(event: AdEvent) {
  return {
    data: [
      {
        event_name: SNAP_EVENTS[event.event],
        action_source: "WEB",
        event_time: Math.floor(event.now / 1000),
        event_id: snapEventId(event),
        event_source_url: sourceUrl(event.pageUrl) ?? NO_PAGE,
        user_data: await snapUser(event),
        custom_data: snapCustomData(event),
      },
    ],
  };
}

/** The store's pixel's events address; the token travels in the address, as Snapchat asks. */
export function snapEndpoint(pixelId: string, token: string, validate = false): string {
  const path = validate ? "events/validate" : "events";
  return `https://tr.snapchat.com/v3/${pixelId}/${path}?access_token=${encodeURIComponent(token)}`;
}

/** Snapchat answers 2xx when it took the events; a refusal says why in `reason` or `message`. */
export function readSnapAnswer(status: number, body: unknown): SendResult {
  const answer = (body ?? {}) as { status?: string; reason?: string; message?: string };
  const refusedStatus = /^(INVALID|FAILED|ERROR)$/i.test(String(answer.status ?? ""));
  if (status >= 200 && status < 300 && !refusedStatus) return { sent: true, received: 1 };
  const message = answer.reason || answer.message;
  return {
    sent: false,
    reason: "refused",
    detail: message ? String(message).slice(0, 300) : `HTTP ${status}`,
  };
}

export const snapPlatform: AdPlatform = {
  credential: SNAP_CAPI_PROVIDER,
  validPixel: validSnapPixel,
  request: async (pixelId, token, event) => ({
    url: snapEndpoint(pixelId, token),
    headers: { "Content-Type": "application/json" },
    body: await snapBody(event),
  }),
  // Snapchat's test is its validation address: the event is checked and not recorded.
  testRequest: async (pixelId, token, event) => ({
    url: snapEndpoint(pixelId, token, true),
    headers: { "Content-Type": "application/json" },
    body: await snapBody(event),
  }),
  readAnswer: readSnapAnswer,
};
