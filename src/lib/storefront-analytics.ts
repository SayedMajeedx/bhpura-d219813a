import { stepToSend, visitSource } from "@/lib/funnel";
import { recordFunnelStep } from "@/lib/data/storefront-funnel";
import {
  sendAdBrowsingEvent,
  sendAdGiftCardPurchase,
  sendAdPurchase,
} from "@/lib/ad-events.functions";
import { metaPayload, readCookie } from "@/lib/ad-events/meta-browser";
import { landingClicks, snapPixelCall, tiktokPixelCall } from "@/lib/ad-events/pixel-calls";
import { purchaseEventId } from "@/lib/ad-events/shared";
export type StorefrontEvent =
  | "page_view"
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase"
  | "search"
  | "view_size_guide";

type AnalyticsConfig = {
  brandId: string;
  gaId: string | null;
  metaId: string | null;
  tiktokId?: string | null;
  snapId?: string | null;
  analyticsAllowed: boolean;
  marketingAllowed: boolean;
};

let config: AnalyticsConfig | null = null;

/**
 * Events from before the analytics were set up. The storefront sets them up after the first scroll
 * or tap, or 5 seconds (so the first screen is not slowed), while the landing page's view, and a
 * product's when the shopper lands on one, are sent at once: they used to find nothing set up and
 * were dropped, so no visit's first page ever reached Google or the ad platforms (2026-11-08). They
 * wait here and are sent, under the choices made by then, once the analytics are set up.
 */
type Waiting = {
  event: StorefrontEvent;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  done: () => void;
};
const MAX_WAITING = 20;
let waiting: Waiting[] = [];

export function setStorefrontAnalyticsConfig(next: AnalyticsConfig | null) {
  config = next;
  if (!next || !waiting.length) return;
  const held = waiting;
  waiting = [];
  for (const item of held)
    void sendEvent(next, item.event, item.payload, item.dedupeKey).then(item.done);
}

/**
 * The store's own count of visits and how far they go (`src/lib/funnel.ts`), apart from Google and
 * Meta: on unless the store asks for consent and the shopper did not allow analytics. A visit is a
 * random id kept for the tab only (sessionStorage); nothing that names the shopper is sent.
 */
let funnel: { slug: string; allowed: boolean } | null = null;

export function setFunnelRecording(next: { slug: string; allowed: boolean } | null) {
  funnel = next;
}

function recordFunnel(event: StorefrontEvent) {
  if (!funnel?.allowed) return;
  const { slug } = funnel;
  try {
    const visitKey = `boutq-visit:${slug}`;
    const stepKey = `boutq-visit-step:${slug}`;
    const step = stepToSend(event, Number(sessionStorage.getItem(stepKey) ?? 0));
    if (!step) return;
    let visit = sessionStorage.getItem(visitKey);
    if (!visit) {
      visit = crypto.randomUUID();
      sessionStorage.setItem(visitKey, visit);
    }
    sessionStorage.setItem(stepKey, String(step));
    // Read once, as the visit starts: later pages of the store are not where it came from.
    const sourceKey = `boutq-visit-source:${slug}`;
    let source = sessionStorage.getItem(sourceKey);
    if (!source) {
      source = visitSource({
        search: window.location.search,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
        host: window.location.hostname,
      });
      sessionStorage.setItem(sourceKey, source);
    }
    void recordFunnelStep(slug, visit, step, source).catch(() => {
      // A step that could not be sent is not counted; the page goes on.
    });
  } catch {
    // Storage unavailable (a private window): this visit is not counted.
  }
}

/** The ads' click ids from the landing page's address, kept for the tab (`landingClicks`). */
const CLICK_KEYS = { fbc: "boutq-fbc", ttclid: "boutq-ttclid", scClickId: "boutq-sccid" } as const;

export function rememberAdClick() {
  try {
    const clicks = landingClicks(window.location.search, Date.now());
    for (const key of Object.keys(CLICK_KEYS) as (keyof typeof CLICK_KEYS)[]) {
      const value = clicks[key];
      if (value) sessionStorage.setItem(CLICK_KEYS[key], value);
    }
  } catch {
    // Storage unavailable: the pixels' own cookies, if any, still name the ad.
  }
}

function keptClick(key: keyof typeof CLICK_KEYS): string | null {
  try {
    return sessionStorage.getItem(CLICK_KEYS[key]);
  } catch {
    return null;
  }
}

/** The visit's ad cookies and click ids, for the store's server. */
function visitCookies() {
  const cookies = document.cookie;
  return {
    pageUrl: window.location.href,
    fbp: readCookie(cookies, "_fbp"),
    fbc: readCookie(cookies, "_fbc") ?? keptClick("fbc"),
    ttp: readCookie(cookies, "_ttp"),
    ttclid: keptClick("ttclid"),
    scid: readCookie(cookies, "_scid"),
    scClickId: keptClick("scClickId"),
  };
}

/**
 * The event sent by the store's server too (Meta, TikTok and Snapchat's server APIs), under the
 * pixels' own event id so each platform counts it once. The server sends it only to a platform
 * whose token the store saved; a purchase is read there from the order. Resolves when it is sent
 * or could not be, never rejects.
 */
function sendToServer(
  event: StorefrontEvent,
  payload: Record<string, unknown>,
  eventId: string,
  brandId: string,
): Promise<void> {
  const cookies = visitCookies();
  const meta = metaPayload(payload);
  let sending: Promise<unknown> | null = null;
  const giftCardPurchase = payload.gift_card_purchase_id;
  if (event === "purchase" && typeof giftCardPurchase === "string" && giftCardPurchase)
    sending = sendAdGiftCardPurchase({ data: { purchaseId: giftCardPurchase, ...cookies } });
  else if (
    event === "purchase" &&
    typeof payload.transaction_id === "string" &&
    payload.transaction_id
  )
    sending = sendAdPurchase({ data: { orderId: payload.transaction_id, ...cookies } });
  else if (event === "view_item" || event === "add_to_cart" || event === "begin_checkout")
    sending = sendAdBrowsingEvent({
      data: {
        brandId,
        event,
        eventId,
        ...cookies,
        currency: typeof meta.currency === "string" ? meta.currency : null,
        value: typeof meta.value === "number" ? meta.value : null,
        contentIds: meta.content_ids,
        numItems: meta.num_items ?? null,
      },
    });
  return sending
    ? sending.then(
        () => undefined,
        () => undefined,
      )
    : Promise.resolve();
}

function newEventId(event: StorefrontEvent, payload: Record<string, unknown>): string {
  if (event === "purchase" && typeof payload.transaction_id === "string" && payload.transaction_id)
    return purchaseEventId(payload.transaction_id);
  try {
    return crypto.randomUUID();
  } catch {
    return `${event}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Sends a storefront event to the store's analytics, or holds it until they are set up. Resolves
 * once the store's server has sent its copy to the ad platforms (or could not): checkout waits a
 * moment for a purchase's before it leaves for the card page.
 */
export function trackStorefrontEvent(
  event: StorefrontEvent,
  payload: Record<string, unknown> = {},
  dedupeKey?: string,
): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  recordFunnel(event);
  if (config) return sendEvent(config, event, payload, dedupeKey);
  if (waiting.length >= MAX_WAITING) return Promise.resolve();
  return new Promise((done) => waiting.push({ event, payload, dedupeKey, done }));
}

function sendEvent(
  config: AnalyticsConfig,
  event: StorefrontEvent,
  payload: Record<string, unknown>,
  dedupeKey?: string,
): Promise<void> {
  if (dedupeKey) {
    const key = `boutq-event:${config.brandId}:${event}:${dedupeKey}`;
    if (sessionStorage.getItem(key)) return Promise.resolve();
    sessionStorage.setItem(key, "1");
  }
  const w = window as any;
  if (config.analyticsAllowed && config.gaId && typeof w.gtag === "function") {
    w.gtag("event", event, { ...payload, send_to: config.gaId });
  }
  const { metaId, tiktokId, snapId } = config;
  if (!config.marketingAllowed || !(metaId || tiktokId || snapId)) return Promise.resolve();
  const eventId = newEventId(event, payload);
  if (metaId && typeof w.fbq === "function") {
    const names: Record<StorefrontEvent, string> = {
      page_view: "PageView",
      view_item: "ViewContent",
      add_to_cart: "AddToCart",
      begin_checkout: "InitiateCheckout",
      purchase: "Purchase",
      search: "Search",
      view_size_guide: "ViewContent",
    };
    w.fbq(
      "trackSingle",
      metaId,
      names[event],
      { ...payload, ...metaPayload(payload) },
      {
        eventID: eventId,
      },
    );
  }
  const tiktok = tiktokId && w.ttq ? tiktokPixelCall(event, payload, eventId) : null;
  if (tiktok?.kind === "page") w.ttq.page();
  else if (tiktok) w.ttq.track(tiktok.name, tiktok.props, tiktok.options);
  const snap =
    snapId && typeof w.snaptr === "function" ? snapPixelCall(event, payload, eventId) : null;
  if (snap) w.snaptr("track", snap.name, snap.props);
  return sendToServer(event, payload, eventId, config.brandId);
}
