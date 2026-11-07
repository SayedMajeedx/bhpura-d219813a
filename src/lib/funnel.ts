/**
 * A store's funnel: how many visits reached each step (a visit, a product looked at, a piece added
 * to the bag, checkout begun) and how many orders were placed. The storefront records the furthest
 * step of each visit (`record_storefront_step`, migration 20261031100000); the dashboard reads the
 * counts of a period (`storefront_funnel`). Nothing that names a shopper is kept.
 */

export type FunnelEvent = "page_view" | "view_item" | "add_to_cart" | "begin_checkout" | "purchase";

/** The step each storefront event reaches. */
export const FUNNEL_STEP: Record<FunnelEvent, 1 | 2 | 3 | 4 | 5> = {
  page_view: 1,
  view_item: 2,
  add_to_cart: 3,
  begin_checkout: 4,
  purchase: 5,
};

export type FunnelCounts = {
  visits: number;
  product_views: number;
  carts: number;
  checkouts: number;
  orders: number;
};

/** A step is sent only when it goes further than the visit has gone: one request per step. */
export function stepToSend(event: string, reached: number): number | null {
  const step = FUNNEL_STEP[event as FunnelEvent];
  return step && step > reached ? step : null;
}

/** Where a visit came from: one word, and nothing else about it (migration 20261122100000). */
export const VISIT_SOURCES = [
  "instagram",
  "facebook",
  "tiktok",
  "snapchat",
  "whatsapp",
  "google",
  "other",
  "direct",
] as const;
export type VisitSource = (typeof VISIT_SOURCES)[number];

export type SourceCounts = { source: VisitSource; visits: number; orders: number };

const NAMED_SOURCES: Record<string, VisitSource> = {
  instagram: "instagram",
  ig: "instagram",
  facebook: "facebook",
  fb: "facebook",
  tiktok: "tiktok",
  snapchat: "snapchat",
  whatsapp: "whatsapp",
  wa: "whatsapp",
  google: "google",
};

const APP_BROWSERS: [RegExp, VisitSource][] = [
  [/Instagram/i, "instagram"],
  [/FBAN|FBAV|FB_IAB/, "facebook"],
  [/musical_ly|BytedanceWebview|TikTok/i, "tiktok"],
  [/Snapchat/i, "snapchat"],
];

const REFERRING_HOSTS: [RegExp, VisitSource][] = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook\.com|fb\.com)$/, "facebook"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)snapchat\.com$/, "snapchat"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
];

/**
 * Where a visit came from. A link the store tagged says it outright. Then the app's own browser,
 * since a link in an Instagram bio opens inside Instagram, usually with no referrer. Then the page
 * it came from. A visit from the store's own pages, or from nowhere, is direct.
 */
export function visitSource({
  search,
  referrer,
  userAgent,
  host,
}: {
  search: string;
  referrer: string;
  userAgent: string;
  host: string;
}): VisitSource {
  const params = new URLSearchParams(search);
  const tagged = params.get("utm_source")?.trim().toLowerCase();
  if (tagged) return NAMED_SOURCES[tagged] ?? "other";
  for (const [pattern, source] of APP_BROWSERS) if (pattern.test(userAgent)) return source;
  if (params.has("fbclid")) return "facebook";
  if (params.has("gclid")) return "google";
  let from = "";
  try {
    from = referrer ? new URL(referrer).hostname.toLowerCase() : "";
  } catch {
    return "direct";
  }
  if (!from || from === host.toLowerCase()) return "direct";
  for (const [pattern, source] of REFERRING_HOSTS) if (pattern.test(from)) return source;
  return "other";
}

/** A share as a percentage with one decimal, or null with nothing to divide by. */
export function share(part: number, whole: number): number | null {
  if (!(whole > 0)) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export type FunnelStage = {
  key: "visits" | "product_views" | "carts" | "checkouts" | "orders";
  count: number;
  /** Of the visits. */
  ofVisits: number | null;
};

/** The funnel's stages in order, each with its share of the visits. */
export function funnelStages(counts: FunnelCounts): FunnelStage[] {
  const keys = ["visits", "product_views", "carts", "checkouts", "orders"] as const;
  return keys.map((key) => ({
    key,
    count: counts[key],
    ofVisits: key === "visits" ? null : share(counts[key], counts.visits),
  }));
}

/** The conversion rate: orders placed out of visits. */
export function conversionRate(counts: FunnelCounts): number | null {
  return share(counts.orders, counts.visits);
}
