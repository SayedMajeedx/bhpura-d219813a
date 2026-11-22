import { isReservedStorefrontSlug } from "@/lib/seo/reserved-slugs";
import { PLATFORM_ROUTE_SEGMENTS } from "@/lib/seo/host-redirect";

/**
 * A store's public pages kept briefly at the edge (PageSpeed review of 2026-11-14).
 *
 * The server answered a store's home in 0.4-0.8 s from Bahrain (1.5 s from PageSpeed's machine),
 * drawing it afresh for every visit; the `s-maxage` the route sends did nothing, as a Worker's
 * answer is not kept by Cloudflare unless the Worker keeps it. Now the data centre keeps a page:
 *
 * - fresh for `FRESH_SECONDS` (30 s), served as kept;
 * - up to `STALE_SECONDS` (an hour) old, served as kept at once while it is drawn again behind it;
 * - older, or not kept, drawn as before.
 *
 * A kept page older than five minutes is still right for the shopper: it carries the time its data
 * was read, and the browser reads the catalogue again once that is older than its own five minutes
 * (`CATALOG_CACHE` in `src/lib/data/storefront/queries.ts`). An hour lets a quiet store's visitor
 * get the kept page (about 25 ms from Bahrain) instead of one drawn afresh (0.4-1.1 s): at five
 * minutes, most visits to a store with a visitor every few minutes found nothing kept (the speed
 * review of 2026-11-22). Nothing is paid, reserved or placed from a page: the order engine prices
 * and checks every order itself.
 *
 * **A kept page belongs to its release** (`release`, the Worker's version id): a page names the
 * script files of the build that drew it, and a release removes the last build's files, so a page
 * kept from before a release arrived with scripts that answered "not found" (the page showed, and
 * nothing on it worked). The release is in the key, so a new release starts with nothing kept.
 *
 * Only what is the same for every visitor is kept (`storePageCacheKey`):
 * - a store's home, a category and a product page; never checkout, the account, sign-in, a gift
 *   link, thank-you, order tracking, the wishlist, booking, search or a file;
 * - a plain read of a page (GET, asking for HTML, no Authorization header);
 * - no cookie but the language one and the analytics and ad cookies a page never reads (any other
 *   cookie, such as a staff impersonation or anything new, is not kept);
 * - one copy per language: `?lang=` and the language cookie are in the key. Tracking parameters
 *   (`fbclid`, `utm_*`, ...) are not: the page never writes them (checked against a render).
 *
 * Only a whole page (after `wholeDocument`) with status 200, HTML and no Set-Cookie is kept. The
 * worker's `STOREFRONT_PAGE_CACHE=off` turns it off.
 */

export const FRESH_SECONDS = 30;
export const STALE_SECONDS = 60 * 60;

/** Second parts of a store's address that are its own pages, not a category. */
export const STORE_PAGES: ReadonlySet<string> = new Set([
  "account",
  "auth",
  "auth-confirmed",
  "book",
  "checkout",
  "gift",
  "gift-card",
  "gift-cards",
  "page",
  "product",
  "search",
  "size-guide",
  "thank-you",
  "track-order",
  "wishlist",
]);

/** Cookies no store page reads: analytics, ads and Cloudflare's own. */
const HARMLESS_COOKIE =
  /^(?:_ga(?:_.*)?|_gid|_gat.*|_gcl_.*|_fbp|_fbc|_ttp|ttclid|_scid.*|_sctr|__cf_bm|_cfuvid|cf_clearance)$/;
const LANG_COOKIE = /^boutq_lang(?:_[a-z0-9-]+)?$/;

/** Parameters a page never writes: the same page whatever they say. */
const TRACKING_PARAM =
  /^(?:utm_.+|fbclid|gclid|gbraid|wbraid|ttclid|sccid|msclkid|igshid|mc_cid|mc_eid|_gl)$/i;

function cookiesOf(request: Request): Map<string, string> | null {
  const header = request.headers.get("Cookie");
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    const name = (at < 0 ? part : part.slice(0, at)).trim();
    if (!name) continue;
    if (!HARMLESS_COOKIE.test(name) && !LANG_COOKIE.test(name)) return null;
    cookies.set(name, at < 0 ? "" : part.slice(at + 1).trim());
  }
  return cookies;
}

/** Whether a path is a store's home, category or product page. */
export function isPublicStorePage(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  const [slug, second, third] = parts;
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) return false;
  if (isReservedStorefrontSlug(slug) || PLATFORM_ROUTE_SEGMENTS.has(slug)) return false;
  if (parts.length === 1) return true;
  if (/\.[a-z0-9]{1,16}$/i.test(parts[parts.length - 1])) return false;
  if (parts.length === 2) return !STORE_PAGES.has(second);
  return parts.length === 3 && second === "product" && Boolean(third);
}

/**
 * The address a page is kept under, or null when this request's page must be drawn for it.
 * `release` is the Worker's version id: pages are kept per release (see above).
 */
export function storePageCacheKey(request: Request, release = ""): string | null {
  if (request.method !== "GET") return null;
  if (!(request.headers.get("Accept") ?? "").includes("text/html")) return null;
  if (request.headers.has("Authorization")) return null;
  const url = new URL(request.url);
  if (!isPublicStorePage(url.pathname)) return null;
  const cookies = cookiesOf(request);
  if (!cookies) return null;

  const slug = url.pathname.split("/").filter(Boolean)[0];
  const lang = cookies.get(`boutq_lang_${slug}`) ?? cookies.get("boutq_lang") ?? "";
  const params = [...url.searchParams.entries()]
    .filter(([name]) => !TRACKING_PARAM.test(name))
    .sort(([a, x], [b, y]) => a.localeCompare(b) || x.localeCompare(y));
  const query = new URLSearchParams(params);
  query.set("__lang_cookie", lang === "ar" || lang === "en" ? lang : "");
  query.set("__release", release);
  return `https://${url.host}/__store-page-cache${url.pathname}?${query}`;
}

/** Whether a drawn page may be kept: whole, 200, HTML, setting no cookie, not marked private. */
export function storablePage(response: Response): boolean {
  if (response.status !== 200 || !response.body) return false;
  if (!(response.headers.get("Content-Type") ?? "").includes("text/html")) return false;
  if (response.headers.has("Set-Cookie")) return false;
  const cacheControl = (response.headers.get("Cache-Control") ?? "").toLowerCase();
  return !/\b(?:private|no-store)\b/.test(cacheControl);
}

/** How a kept page is used at this moment. */
export function keptPageState(storedAt: number, now: number): "fresh" | "stale" | "expired" {
  const age = (now - storedAt) / 1000;
  if (!Number.isFinite(age) || age < 0) return "expired";
  if (age <= FRESH_SECONDS) return "fresh";
  if (age <= STALE_SECONDS) return "stale";
  return "expired";
}

type Waiter = { waitUntil(promise: Promise<unknown>): void };
type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

const STORED_AT = "X-Page-Stored-At";
const BROWSER_CACHE = "X-Page-Browser-Cache";

export async function serveStorePageWithEdgeCache(
  key: string,
  render: () => Promise<Response>,
  ctx: Waiter,
  cache: EdgeCache | undefined = defaultCache(),
  now: () => number = Date.now,
): Promise<Response> {
  if (!cache) return render();
  const keyRequest = new Request(key);

  const keep = async (page: Response) => {
    if (!storablePage(page)) return;
    const headers = new Headers({
      "Content-Type": page.headers.get("Content-Type") ?? "text/html; charset=utf-8",
      "Cache-Control": `public, max-age=${STALE_SECONDS}`,
      [STORED_AT]: String(now()),
      [BROWSER_CACHE]: page.headers.get("Cache-Control") ?? "no-cache",
    });
    await cache.put(keyRequest, new Response(page.body, { status: 200, headers }));
  };

  try {
    const kept = await cache.match(keyRequest);
    if (kept) {
      const state = keptPageState(Number(kept.headers.get(STORED_AT)), now());
      if (state !== "expired") {
        if (state === "stale") {
          ctx.waitUntil(
            render()
              .then(keep)
              .catch(() => undefined),
          );
        }
        return toShopper(kept, state === "fresh" ? "HIT" : "STALE");
      }
    }
  } catch {
    /* the cache could not answer: the page is drawn */
  }

  const page = await render();
  if (!storablePage(page)) return page;
  const [toVisitor, toCache] = page.body!.tee();
  const init = { status: page.status, statusText: page.statusText, headers: page.headers };
  ctx.waitUntil(keep(new Response(toCache, init)).catch(() => undefined));
  const headers = new Headers(page.headers);
  headers.set("X-Page-Cache", "MISS");
  return new Response(toVisitor, { status: page.status, headers });
}

/** A kept page as the visitor receives it: the page's own browser header, marked. */
function toShopper(kept: Response, state: "HIT" | "STALE"): Response {
  const headers = new Headers({
    "Content-Type": kept.headers.get("Content-Type") ?? "text/html; charset=utf-8",
    "Cache-Control": kept.headers.get(BROWSER_CACHE) ?? "no-cache",
    "X-Page-Cache": state,
  });
  return new Response(kept.body, { status: 200, headers });
}

function defaultCache(): EdgeCache | undefined {
  const store = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return store?.default;
}
