/**
 * Meta's Conversions API: the events a store's own server sends to Meta beside the browser pixel,
 * so a purchase is counted when the pixel was blocked (an ad blocker, Safari's tracking limits, an
 * Instagram in-app browser that drops the cookie) and Instagram ads learn from every sale.
 *
 * Pure rules only (no request, no database): what an event holds, how a shopper's details are
 * hashed, and the click id. The server sends what these return (`src/lib/ad-events.functions.ts`).
 * Meta counts an event once when the pixel and the server send it with the same name and
 * `event_id` (`purchaseEventId`, or the id the browser made for the event).
 */

/** The Graph API version the events are posted to: supported until 2028-07-29. */
export const META_GRAPH_VERSION = "v25.0";

/** The credential the store's Conversions API access token is kept under (encrypted). */
export const META_CAPI_PROVIDER = "meta_capi";

/** The storefront events the server also sends, by Meta's names. A page view stays the pixel's. */
export const SERVER_EVENTS = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
} as const;

export type ServerEvent = keyof typeof SERVER_EVENTS;

export function isServerEvent(event: string): event is ServerEvent {
  return Object.prototype.hasOwnProperty.call(SERVER_EVENTS, event);
}

/** One order's purchase, from both sides: the pixel and the server name it the same. */
export function purchaseEventId(orderId: string): string {
  return `purchase:${orderId}`;
}

/** A pixel id as Meta gives it: digits only. */
export function validPixelId(value: string | null | undefined): value is string {
  return /^\d{5,30}$/.test(String(value ?? ""));
}

/** A token pasted with spaces or a line break around it is still the token. */
export function cleanToken(value: string | null | undefined): string | null {
  const token = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{20,1000}$/.test(token) ? token : null;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Meta's normalisation before hashing: an email trimmed and in lower case. */
export function normalEmail(value: string | null | undefined): string | null {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/**
 * A phone as Meta wants it: digits only, with its country code and no leading zeros or plus. The
 * checkout keeps the number with its code (+973...); an international "00" is dropped.
 */
export function normalPhone(value: string | null | undefined): string | null {
  const digits = String(value ?? "")
    .replace(/\D/g, "")
    .replace(/^00/, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** A first or last name in lower case, with no spaces or punctuation (Meta's rule; Arabic stays). */
export function normalName(value: string | null | undefined): string | null {
  const name = String(value ?? "")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}\d]/gu, "");
  return name || null;
}

export function normalCountry(value: string | null | undefined): string | null {
  const code = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^[a-z]{2}$/.test(code) ? code : null;
}

/** First name and the rest, from the one name the checkout asks. */
export function splitName(full: string | null | undefined): {
  first: string | null;
  last: string | null;
} {
  const parts = String(full ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first: null, last: null };
  return { first: parts[0], last: parts.length > 1 ? parts[parts.length - 1] : null };
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

export type Shopper = {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  country?: string | null;
  /** The store's own id for the customer, hashed as `external_id`. */
  customerId?: string | null;
};

export type Visit = {
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

/** `user_data`: what lets Meta match the event to a person, every personal detail hashed. */
export async function userData(shopper: Shopper, visit: Visit) {
  const { first, last } = splitName(shopper.name);
  const hashed = async (value: string | null) => (value ? [await sha256Hex(value)] : undefined);
  const data: Record<string, unknown> = {
    em: await hashed(normalEmail(shopper.email)),
    ph: await hashed(normalPhone(shopper.phone)),
    fn: await hashed(normalName(first)),
    ln: await hashed(normalName(last)),
    country: await hashed(normalCountry(shopper.country)),
    external_id: await hashed(shopper.customerId ? String(shopper.customerId) : null),
    client_ip_address: visit.ip && visit.ip !== "unknown" ? visit.ip : undefined,
    client_user_agent: visit.userAgent ? visit.userAgent.slice(0, 500) : undefined,
    fbp: metaCookie(visit.fbp) ?? undefined,
    fbc: metaCookie(visit.fbc) ?? undefined,
  };
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

export type Line = { productId: string | null; quantity: number; lineTotal: number };

export type PurchaseOrder = {
  id: string;
  currency: string;
  total: number;
  lines: Line[];
};

/** `custom_data` of a purchase, from the order the database wrote: never from the browser. */
export function purchaseData(order: PurchaseOrder) {
  const lines = order.lines.filter((line) => line.productId && line.quantity > 0);
  return {
    currency: order.currency.toUpperCase(),
    value: Math.max(0, Number(order.total.toFixed(3))),
    order_id: order.id,
    content_type: "product",
    content_ids: [...new Set(lines.map((line) => String(line.productId)))],
    contents: lines.map((line) => ({
      id: String(line.productId),
      quantity: line.quantity,
      item_price: Number((line.lineTotal / line.quantity).toFixed(3)),
    })),
    num_items: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

export type BrowsingData = {
  currency?: string | null;
  value?: number | null;
  contentIds?: string[];
  numItems?: number | null;
};

/** `custom_data` of a view, an add or a checkout begun, as the storefront described it. */
export function browsingData(data: BrowsingData) {
  const out: Record<string, unknown> = { content_type: "product" };
  if (data.currency && /^[A-Za-z]{3}$/.test(data.currency))
    out.currency = data.currency.toUpperCase();
  if (typeof data.value === "number" && Number.isFinite(data.value) && data.value >= 0)
    out.value = Number(data.value.toFixed(3));
  const ids = (data.contentIds ?? []).filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)).slice(0, 50);
  if (ids.length) out.content_ids = ids;
  if (typeof data.numItems === "number" && data.numItems > 0)
    out.num_items = Math.floor(data.numItems);
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

/** A page address worth sending: the store's own page, without its query (it can hold tokens). */
export function sourceUrl(value: string | null | undefined): string | undefined {
  try {
    const url = new URL(String(value ?? ""));
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return `${url.origin}${url.pathname}`.slice(0, 1000);
  } catch {
    return undefined;
  }
}

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

/** What Meta answered, in words the merchant can act on. */
export type SendResult =
  | { sent: true; received: number }
  | {
      sent: false;
      reason: "off" | "not_found" | "too_many" | "refused" | "unreachable";
      detail?: string;
    };

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
