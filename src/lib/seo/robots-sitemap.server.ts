/**
 * Fast-path handlers for /robots.txt and /sitemap.xml.
 *
 * These run in the Worker before the TanStack Start SSR handler. Without them
 * a request such as https://qoffee.boutq.store/robots.txt falls through to the
 * `/$slug` route, is treated as a brand slug, hits the database, and renders a
 * full not-found page — slow enough that PageSpeed Insights reports the fetch
 * as timed out and fails the SEO / agentic-browsing audits.
 */

import { sitemapEntries, sitemapXml } from "@/lib/seo/sitemap";
import { storefrontOrigin } from "@/lib/seo/canonical";

const PLATFORM_HOSTS = new Set(["boutq.store", "www.boutq.store", "localhost", "127.0.0.1"]);

const SITEMAP_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";
const ROBOTS_CACHE = "public, max-age=86400, s-maxage=604800";

function hostnameOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = forwarded || new URL(request.url).hostname;
  return host.split(":")[0].toLowerCase();
}

export function handleRobotsRequest(request: Request): Response {
  const url = new URL(request.url);
  const hostname = hostnameOf(request);
  const origin = `${url.protocol}//${hostname}`;
  const isPlatform = PLATFORM_HOSTS.has(hostname);

  const lines = [
    "User-agent: *",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /invoice/",
    "Disallow: /*/checkout",
    "Disallow: /*/account",
    "Disallow: /*/auth",
    "Disallow: /*/auth-confirmed",
    "Disallow: /*/thank-you/",
    "Disallow: /*/track-order",
    "Disallow: /*/wishlist",
    "Allow: /",
    "",
    ...(isPlatform ? [] : [`Sitemap: ${origin}/sitemap.xml`]),
    "",
  ];

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": ROBOTS_CACHE,
    },
  });
}

/**
 * Resolves the store for a sitemap or feed request: an explicit /{slug}/sitemap.xml
 * path wins; otherwise the *.boutq.store subdomain or a mapped custom domain.
 */
export async function resolveStoreBrand(
  request: Request,
  explicitSlug: string | null,
): Promise<{ id: string; slug: string; custom_domain: string | null } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  if (explicitSlug) {
    const { data } = await db
      .from("brands")
      .select("id, slug, custom_domain")
      .eq("slug", explicitSlug)
      .eq("is_active", true)
      .maybeSingle();
    return data ?? null;
  }

  const hostname = hostnameOf(request);
  if (PLATFORM_HOSTS.has(hostname)) return null;

  if (hostname.endsWith(".boutq.store")) {
    const subdomain = hostname.slice(0, -".boutq.store".length);
    if (subdomain && !subdomain.includes(".")) {
      const { data } = await db
        .from("brands")
        .select("id, slug, custom_domain")
        .eq("slug", subdomain)
        .eq("is_active", true)
        .maybeSingle();
      if (data) return data;
    }
  }

  const { data } = await db
    .from("brands")
    .select("id, slug, custom_domain")
    .eq("custom_domain", hostname)
    .eq("is_active", true)
    .maybeSingle();
  return data ?? null;
}

/**
 * Whether a host is one of the platform's live addresses (the platform itself, a store's subdomain)
 * or a store's own domain. A development host (localhost, a preview) is none of them.
 */
function isLiveHost(hostname: string, brand: { custom_domain: string | null }): boolean {
  if (hostname === "boutq.store" || hostname === "www.boutq.store") return true;
  if (hostname.endsWith(".boutq.store")) return true;
  const own = brand.custom_domain
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return Boolean(own) && hostname === own;
}

export async function handleSitemapRequest(
  request: Request,
  explicitSlug: string | null = null,
): Promise<Response> {
  const brand = await resolveStoreBrand(request, explicitSlug);
  if (!brand) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  // A store has one sitemap, on its main address: the platform's address and a subdomain of a store
  // with its own domain send the crawler there (a sitemap lists only addresses of its own host).
  const mainOrigin = storefrontOrigin(brand);
  const hostname = hostnameOf(request);
  if (isLiveHost(hostname, brand) && `https://${hostname}` !== mainOrigin) {
    return new Response(null, {
      status: 301,
      headers: { Location: `${mainOrigin}/sitemap.xml`, "Cache-Control": "public, max-age=3600" },
    });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const [{ data: products }, { data: categories }, { data: settings }] = await Promise.all([
    db
      .from("products")
      .select("id, updated_at")
      .eq("brand_id", brand.id)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(5000),
    db
      .from("categories")
      .select("slug, updated_at")
      .eq("brand_id", brand.id)
      .eq("is_active", true)
      .not("slug", "is", null)
      .limit(500),
    db
      .from("business_settings")
      .select("pages, store_vertical, store_modules")
      .eq("brand_id", brand.id)
      .maybeSingle(),
  ]);

  const body = sitemapXml(
    brand,
    sitemapEntries({
      categories: categories ?? [],
      products: products ?? [],
      pages: settings?.pages,
      settings,
    }),
  );

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": SITEMAP_CACHE,
    },
  });
}
