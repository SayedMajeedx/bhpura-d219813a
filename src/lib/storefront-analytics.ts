import { stepToSend, visitSource } from "@/lib/funnel";
import { recordFunnelStep } from "@/lib/data/storefront-funnel";
import { sendMetaBrowsingEvent, sendMetaPurchase } from "@/lib/ad-events.functions";
import { metaPayload, readCookie } from "@/lib/ad-events/meta-browser";
import { fbcFromClickId, purchaseEventId } from "@/lib/ad-events/meta-conversions";
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
  analyticsAllowed: boolean;
  marketingAllowed: boolean;
};

let config: AnalyticsConfig | null = null;

export function setStorefrontAnalyticsConfig(next: AnalyticsConfig | null) {
  config = next;
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

/** The ad's click id from the landing page's address, kept for the tab (see `fbcFromClickId`). */
const CLICK_KEY = "boutq-fbc";

export function rememberAdClick() {
  try {
    const fbc = fbcFromClickId(
      new URLSearchParams(window.location.search).get("fbclid"),
      Date.now(),
    );
    if (fbc) sessionStorage.setItem(CLICK_KEY, fbc);
  } catch {
    // Storage unavailable: the pixel's own cookie, if any, still names the ad.
  }
}

function adClick(): string | null {
  const cookie = readCookie(document.cookie, "_fbc");
  if (cookie) return cookie;
  try {
    return sessionStorage.getItem(CLICK_KEY);
  } catch {
    return null;
  }
}

/**
 * The event sent by the store's server too (Meta's Conversions API), under the pixel's own event
 * id so Meta counts it once. The server sends it only for a store that saved its token; a purchase
 * is read there from the order. Resolves when it is sent or could not be, never rejects.
 */
function sendToServer(
  event: StorefrontEvent,
  payload: Record<string, unknown>,
  eventId: string,
  brandId: string,
): Promise<void> {
  const cookies = {
    pageUrl: window.location.href,
    fbp: readCookie(document.cookie, "_fbp"),
    fbc: adClick(),
  };
  const meta = metaPayload(payload);
  let sending: Promise<unknown> | null = null;
  if (event === "purchase" && typeof payload.transaction_id === "string" && payload.transaction_id)
    sending = sendMetaPurchase({ data: { orderId: payload.transaction_id, ...cookies } });
  else if (event === "view_item" || event === "add_to_cart" || event === "begin_checkout")
    sending = sendMetaBrowsingEvent({
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
 * Sends a storefront event to the store's analytics. Resolves once the store's server has sent
 * its copy to Meta (or could not): checkout waits a moment for a purchase's before it leaves for
 * the card page.
 */
export function trackStorefrontEvent(
  event: StorefrontEvent,
  payload: Record<string, unknown> = {},
  dedupeKey?: string,
): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  recordFunnel(event);
  if (!config) return Promise.resolve();
  if (dedupeKey) {
    const key = `boutq-event:${config.brandId}:${event}:${dedupeKey}`;
    if (sessionStorage.getItem(key)) return Promise.resolve();
    sessionStorage.setItem(key, "1");
  }
  const w = window as any;
  if (config.analyticsAllowed && config.gaId && typeof w.gtag === "function") {
    w.gtag("event", event, { ...payload, send_to: config.gaId });
  }
  if (!config.marketingAllowed || !config.metaId) return Promise.resolve();
  const eventId = newEventId(event, payload);
  if (typeof w.fbq === "function") {
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
      config.metaId,
      names[event],
      { ...payload, ...metaPayload(payload) },
      {
        eventID: eventId,
      },
    );
  }
  return sendToServer(event, payload, eventId, config.brandId);
}
