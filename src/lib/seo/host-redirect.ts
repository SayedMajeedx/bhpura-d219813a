import { isReservedStorefrontSlug } from "@/lib/seo/reserved-slugs";

/**
 * A store's pages also answer on the platform's own address (`boutq.store/pura/...`). Its main
 * address is its subdomain (`pura.boutq.store/pura/...`, `src/lib/seo/canonical.ts`), so a request
 * for a page on the platform's address is sent there for good: one address for Google to rank, and
 * for shoppers to share.
 */

const PLATFORM_HOSTS = new Set(["boutq.store", "www.boutq.store"]);
const SUBDOMAIN_SUFFIX = ".boutq.store";

/**
 * The first part of an address that belongs to the platform's own routes, not to a store
 * (`src/routes/*.tsx` outside `$slug.*`, and `admin`/`api`... which `reserved-slugs.ts` holds).
 * `tests/seo-host-redirect.test.ts` keeps this equal to the route files.
 */
export const PLATFORM_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
  "auth",
  "b",
  "first-login",
  "forgot-password",
  "grant",
  "hero-preview",
  "onboard",
  "platform",
  "reset-password",
  "review",
]);

/** A store's pages that are private (kept out of Google by robots.txt): they stay where they are. */
const PRIVATE_PAGES = new Set([
  "checkout",
  "account",
  "auth",
  "auth-confirmed",
  "gift-card",
  "thank-you",
  "track-order",
  "wishlist",
]);

/** A label that can be a subdomain, which is what a store's slug is. */
const SUBDOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Where a request for a store's page on the platform's address goes: the same page, same query, on
 * the store's subdomain. Null for anything else (the store's own address, another host such as a
 * preview, the platform's own pages, a store's private pages and files, and any method but a read).
 */
export function storeHostRedirect(requestUrl: string, method = "GET"): string | null {
  if (method !== "GET" && method !== "HEAD") return null;
  const url = new URL(requestUrl);
  if (!PLATFORM_HOSTS.has(url.hostname.toLowerCase())) return null;

  const [, slug, second, ...rest] = url.pathname.split("/");
  if (!slug || !SUBDOMAIN_LABEL.test(slug)) return null;
  if (isReservedStorefrontSlug(slug) || PLATFORM_ROUTE_SEGMENTS.has(slug)) return null;
  if (second && PRIVATE_PAGES.has(second)) return null;
  // A file (the store's manifest, sitemap or shopping feed) is served where it is asked for.
  const last = rest.length ? rest[rest.length - 1] : (second ?? "");
  if (/\.[a-z0-9]{1,16}$/i.test(last)) return null;

  return `https://${slug}${SUBDOMAIN_SUFFIX}${url.pathname}${url.search}`;
}

/** The answer for `storeHostRedirect`: a permanent redirect, kept for a day by the browser. */
export function storeHostRedirectResponse(request: Request): Response | null {
  const target = storeHostRedirect(request.url, request.method);
  if (!target) return null;
  return new Response(null, {
    status: 301,
    headers: { Location: target, "Cache-Control": "public, max-age=86400" },
  });
}
