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
  sourceUrl,
  splitName,
  type AdEvent,
  type AdPlatform,
  type BrowsingData,
  type PurchaseOrder,
  type SendResult,
  type ServerEvent,
  type Shopper,
  type Visit,
} from "./shared";

export {
  cleanToken,
  isServerEvent,
  normalEmail,
  normalName,
  normalPhone,
  purchaseEventId,
  sha256Hex,
  sourceUrl,
  type BrowsingData,
  type Line,
  type PurchaseOrder,
  type SendResult,
  type ServerEvent,
  type Shopper,
  type Visit,
} from "./shared";

/**
 * Meta's Conversions API: the events a store's own server sends to Meta beside the browser pixel,
 * so a purchase is counted when the pixel was blocked (an ad blocker, Safari's tracking limits, an
 * Instagram in-app browser that drops the cookie) and Instagram ads learn from every sale.
 *
 * Pure rules only: what an event holds in Meta's words and the click id. Meta counts an event
 * once when the pixel and the server send it with the same name and `event_id`
 * (`purchaseEventId`, or the id the browser made for the event).
 */

/** The Graph API version the events are posted to: supported until 2028-07-29. */
export const META_GRAPH_VERSION = "v25.0";

/** The credential the store's Conversions API access token is kept under (encrypted). */
export const META_CAPI_PROVIDER = "meta_capi";

/** The storefront events the server also sends, by Meta's names. */
export const SERVER_EVENTS: Record<ServerEvent, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
};

/** A pixel id as Meta gives it: digits only. */
export function validPixelId(value: string | null | undefined): value is string {
  return /^\d{5,30}$/.test(String(value ?? ""));
}

/**
 * The click id Meta reads from an ad's link (`?fbclid=`), in the shape of its `_fbc` cookie:
 * `fb.1.<when>.<fbclid>`. Kept for the tab when the shopper lands, so a sale later in the visit
 * still names the ad, whether or not the pixel ever loaded.
 */
export function fbcFromClickId(fbclid: string | null | undefined, now: number): string | null {
  const id = String(fbclid ?? "").trim();
  return /^[A-Za-z0-9_-]{10,500}$/.test(id) ? `fb.1.${now}.${id}` : null;
}

/** An `_fbp` / `_fbc` value in Meta's own shape, or nothing (never a value someone made up). */
export function metaCookie(value: string | null | undefined): string | null {
  const cookie = String(value ?? "").trim();
  return /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_.-]{1,500}$/.test(cookie) ? cookie : null;
}

/** `user_data`: what lets Meta match the event to a person, every personal detail hashed. */
export async function userData(shopper: Shopper, visit: Visit) {
  const { first, last } = splitName(shopper.name);
  const hashed = async (value: string | null) => {
    const hash = await hashOf(value);
    return hash ? [hash] : undefined;
  };
  const data: Record<string, unknown> = {
    em: await hashed(normalEmail(shopper.email)),
    ph: await hashed(normalPhone(shopper.phone)),
    fn: await hashed(normalName(first)),
    ln: await hashed(normalName(last)),
    country: await hashed(normalCountry(shopper.country)),
    external_id: await hashed(shopper.customerId ? String(shopper.customerId) : null),
    client_ip_address: clientIp(visit),
    client_user_agent: clientAgent(visit),
    fbp: metaCookie(visit.fbp) ?? undefined,
    fbc: metaCookie(visit.fbc) ?? undefined,
  };
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

/** `custom_data` of a purchase, from the order the database wrote: never from the browser. */
export function purchaseData(order: PurchaseOrder) {
  const pieces = orderPieces(order);
  return {
    currency: order.currency.toUpperCase(),
    value: Math.max(0, Number(order.total.toFixed(3))),
    order_id: order.id,
    content_type: "product",
    content_ids: [...new Set(pieces.map((piece) => piece.id))],
    contents: pieces.map((piece) => ({
      id: piece.id,
      quantity: piece.quantity,
      item_price: piece.price,
    })),
    num_items: pieces.reduce((sum, piece) => sum + piece.quantity, 0),
  };
}

/** `custom_data` of a view, an add or a checkout begun, as the storefront described it. */
export function browsingData(data: BrowsingData) {
  const clean = cleanBrowsing(data);
  const out: Record<string, unknown> = { content_type: "product" };
  if (clean.currency) out.currency = clean.currency;
  if (clean.value !== undefined) out.value = clean.value;
  if (clean.contentIds.length) out.content_ids = clean.contentIds;
  if (clean.numItems !== undefined) out.num_items = clean.numItems;
  return out;
}

export type MetaEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url?: string;
  user_data: Record<string, unknown>;
  custom_data: Record<string, unknown>;
};

export function metaEvent(input: {
  event: ServerEvent;
  eventId: string;
  now: number;
  pageUrl?: string | null;
  user: Record<string, unknown>;
  custom: Record<string, unknown>;
}): MetaEvent {
  const url = sourceUrl(input.pageUrl);
  return {
    event_name: SERVER_EVENTS[input.event],
    event_time: Math.floor(input.now / 1000),
    event_id: input.eventId.slice(0, 200),
    action_source: "website",
    ...(url ? { event_source_url: url } : {}),
    user_data: input.user,
    custom_data: input.custom,
  };
}

/** Where the events go: the store's own pixel (its dataset). The token travels in the body. */
export function eventsEndpoint(pixelId: string): string {
  return `https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events`;
}

export function eventsBody(events: MetaEvent[], token: string, testEventCode?: string | null) {
  const test = String(testEventCode ?? "").trim();
  return {
    data: events,
    access_token: token,
    ...(/^[A-Za-z0-9]{3,40}$/.test(test) ? { test_event_code: test } : {}),
  };
}

export function readMetaAnswer(status: number, body: unknown): SendResult {
  const answer = (body ?? {}) as {
    events_received?: number;
    error?: { message?: string; code?: number };
  };
  if (status >= 200 && status < 300 && typeof answer.events_received === "number")
    return { sent: true, received: answer.events_received };
  const message = answer.error?.message ? String(answer.error.message).slice(0, 300) : undefined;
  return { sent: false, reason: "refused", detail: message ?? `HTTP ${status}` };
}

async function metaRequest(
  pixelId: string,
  token: string,
  event: AdEvent,
  testCode?: string | null,
) {
  const custom = event.order ? purchaseData(event.order) : browsingData(event.browsing ?? {});
  const body = eventsBody(
    [
      metaEvent({
        event: event.event,
        eventId: event.eventId,
        now: event.now,
        pageUrl: event.pageUrl,
        user: await userData(event.shopper, event.visit),
        custom,
      }),
    ],
    token,
    testCode,
  );
  return { url: eventsEndpoint(pixelId), headers: { "Content-Type": "application/json" }, body };
}

export const metaPlatform: AdPlatform = {
  credential: META_CAPI_PROVIDER,
  validPixel: validPixelId,
  request: metaRequest,
  testRequest: metaRequest,
  readAnswer: readMetaAnswer,
};
