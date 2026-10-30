import { stepToSend } from "@/lib/funnel";
import { recordFunnelStep } from "@/lib/data/storefront-funnel";
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
    void recordFunnelStep(slug, visit, step).catch(() => {
      // A step that could not be sent is not counted; the page goes on.
    });
  } catch {
    // Storage unavailable (a private window): this visit is not counted.
  }
}

export function trackStorefrontEvent(
  event: StorefrontEvent,
  payload: Record<string, unknown> = {},
  dedupeKey?: string,
) {
  if (typeof window === "undefined") return;
  recordFunnel(event);
  if (!config) return;
  if (dedupeKey) {
    const key = `boutq-event:${config.brandId}:${event}:${dedupeKey}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  }
  const w = window as any;
  if (config.analyticsAllowed && config.gaId && typeof w.gtag === "function") {
    w.gtag("event", event, { ...payload, send_to: config.gaId });
  }
  if (config.marketingAllowed && config.metaId && typeof w.fbq === "function") {
    const names: Record<StorefrontEvent, string> = {
      page_view: "PageView",
      view_item: "ViewContent",
      add_to_cart: "AddToCart",
      begin_checkout: "InitiateCheckout",
      purchase: "Purchase",
      search: "Search",
      view_size_guide: "ViewContent",
    };
    w.fbq("trackSingle", config.metaId, names[event], payload);
  }
}
