/**
 * What every ad platform's server events share (Meta's Conversions API, TikTok's Events API,
 * Snapchat's Conversions API): the storefront events the server also sends, how a shopper's
 * details are normalised and hashed before they leave, the order and the visit an event describes,
 * and what a platform answered. Pure: no request, no database. Each platform turns an `AdEvent`
 * into its own request (`meta-conversions.ts`, `tiktok-events.ts`, `snap-conversions.ts`), and the
 * server sends it (`src/lib/ad-events.functions.ts`).
 */

/** The storefront events the server also sends. A page view stays the pixels' alone. */
export const SERVER_EVENT_KEYS = [
  "view_item",
  "add_to_cart",
  "begin_checkout",
  "purchase",
] as const;

export type ServerEvent = (typeof SERVER_EVENT_KEYS)[number];

export function isServerEvent(event: string): event is ServerEvent {
  return (SERVER_EVENT_KEYS as readonly string[]).includes(event);
}

/** One order's purchase, from both sides: the pixel and the server name it the same. */
export function purchaseEventId(orderId: string): string {
  return `purchase:${orderId}`;
}

/** A token pasted with spaces or a line break around it is still the token. */
export function cleanToken(value: string | null | undefined): string | null {
  const token = String(value ?? "").trim();
  return /^[A-Za-z0-9_.-]{20,1000}$/.test(token) ? token : null;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A value hashed, or nothing when there is none. */
export async function hashOf(value: string | null): Promise<string | undefined> {
  return value ? sha256Hex(value) : undefined;
}

/** An email trimmed and in lower case (every platform's rule). */
export function normalEmail(value: string | null | undefined): string | null {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/**
 * A phone as digits only, with its country code and no leading zeros or plus (Meta's and
 * Snapchat's rule; TikTok puts a "+" before it). The checkout keeps the number with its code
 * (+973...); an international "00" is dropped.
 */
export function normalPhone(value: string | null | undefined): string | null {
  const digits = String(value ?? "")
    .replace(/\D/g, "")
    .replace(/^00/, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** A first or last name in lower case, with no spaces or punctuation (Arabic stays). */
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

/** A click id or cookie a platform set, kept only in a plain shape (never markup someone typed). */
export function plainId(value: string | null | undefined, max = 500): string | null {
  const id = String(value ?? "").trim();
  return id.length > 0 && id.length <= max && /^[A-Za-z0-9_.:|-]+$/.test(id) ? id : null;
}

export type Shopper = {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  country?: string | null;
  /** The store's own id for the customer, hashed as each platform's external id. */
  customerId?: string | null;
};

/** The visit an event came from: the browser and the ad platforms' own cookies and click ids. */
export type Visit = {
  ip?: string | null;
  userAgent?: string | null;
  /** Meta: `_fbp` and `_fbc` (or the `fbclid` the shopper landed with). */
  fbp?: string | null;
  fbc?: string | null;
  /** TikTok: `_ttp` and the `ttclid` the shopper landed with. */
  ttp?: string | null;
  ttclid?: string | null;
  /** Snapchat: `_scid` and the `ScCid` the shopper landed with. */
  scid?: string | null;
  scClickId?: string | null;
};

export function clientIp(visit: Visit): string | undefined {
  return visit.ip && visit.ip !== "unknown" ? visit.ip : undefined;
}

export function clientAgent(visit: Visit): string | undefined {
  return visit.userAgent ? visit.userAgent.slice(0, 500) : undefined;
}

export type Line = { productId: string | null; quantity: number; lineTotal: number };

export type PurchaseOrder = {
  id: string;
  currency: string;
  total: number;
  lines: Line[];
};

/** An order's lines with a product, each with its piece price, from what the database wrote. */
export function orderPieces(order: PurchaseOrder) {
  return order.lines
    .filter((line) => line.productId && line.quantity > 0)
    .map((line) => ({
      id: String(line.productId),
      quantity: line.quantity,
      price: Number((line.lineTotal / line.quantity).toFixed(3)),
    }));
}

export type BrowsingData = {
  currency?: string | null;
  value?: number | null;
  contentIds?: string[];
  numItems?: number | null;
};

/** What the storefront said about a view, an add or a checkout begun, kept only when well formed. */
export function cleanBrowsing(data: BrowsingData) {
  return {
    currency:
      data.currency && /^[A-Za-z]{3}$/.test(data.currency)
        ? data.currency.toUpperCase()
        : undefined,
    value:
      typeof data.value === "number" && Number.isFinite(data.value) && data.value >= 0
        ? Number(data.value.toFixed(3))
        : undefined,
    contentIds: (data.contentIds ?? [])
      .filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id))
      .slice(0, 50),
    numItems:
      typeof data.numItems === "number" && data.numItems > 0
        ? Math.floor(data.numItems)
        : undefined,
  };
}

/** One event as the server knows it, before a platform puts it in its own words. */
export type AdEvent = {
  event: ServerEvent;
  eventId: string;
  now: number;
  pageUrl?: string | null;
  shopper: Shopper;
  visit: Visit;
  /** A purchase's order (read from the database). */
  order?: PurchaseOrder;
  /** A view, an add or a checkout begun, as the storefront described it. */
  browsing?: BrowsingData;
};

/** A request to one platform, ready to send. */
export type AdRequest = { url: string; headers: Record<string, string>; body: unknown };

/** What a platform answered, in words the merchant can act on. */
export type SendResult =
  | { sent: true; received: number }
  | {
      sent: false;
      reason: "off" | "not_found" | "too_many" | "refused" | "unreachable";
      detail?: string;
    };

/** A platform's server events: its stored token's name and how it speaks. */
export type AdPlatform = {
  /** The integration credential its token is kept under (encrypted). */
  credential: string;
  /** Its pixel id's shape. */
  validPixel: (value: string | null | undefined) => value is string;
  request: (
    pixelId: string,
    token: string,
    event: AdEvent,
    testCode?: string | null,
  ) => Promise<AdRequest>;
  /** A test event's request, under the code its events tool shows (or its validation address). */
  testRequest: (
    pixelId: string,
    token: string,
    event: AdEvent,
    testCode?: string | null,
  ) => Promise<AdRequest>;
  readAnswer: (status: number, body: unknown) => SendResult;
};
