/**
 * Fast-path handlers for /robots.txt and /sitemap.xml.
 *
 * These run in the Worker before the TanStack Start SSR handler. Without them
 * a request such as https://qoffee.boutq.store/robots.txt falls through to the
 * `/$slug` route, is treated as a brand slug, hits the database, and renders a
 * full not-found page — slow enough that PageSpeed Insights reports the fetch
 * as timed out and fails the SEO / agentic-browsing audits.
 */

const PLATFORM_HOSTS = new Set(["boutq.store", "www.boutq.store", "localhost", "127.0.0.1"]);

const SITEMAP_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";
const ROBOTS_CACHE = "public, max-age=86400, s-maxage=604800";

function hostnameOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = forwarded || new URL(request.url).hostname;
  return host.split(":")[0].toLowerCase();
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
    "Disallow: /*/wishlist",
    "Disallow: /*?*lang=",
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
 * Resolves the brand slug for a sitemap request: an explicit /{slug}/sitemap.xml
 * path wins; otherwise the *.boutq.store subdomain or a mapped custom domain.
 */
async function resolveSitemapBrand(
  request: Request,
  explicitSlug: string | null,
): Promise<{ id: string; slug: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  if (explicitSlug) {
    const { data } = await db
      .from("brands")
      .select("id, slug")
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
        .select("id, slug")
        .eq("slug", subdomain)
        .eq("is_active", true)
        .maybeSingle();
      if (data) return data;
    }
  }

  const { data } = await db
    .from("brands")
    .select("id, slug")
    .eq("custom_domain", hostname)
    .eq("is_active", true)
    .maybeSingle();
  return data ?? null;
}

export async function handleSitemapRequest(
  request: Request,
  explicitSlug: string | null = null,
): Promise<Response> {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${hostnameOf(request)}`;

  const brand = await resolveSitemapBrand(request, explicitSlug);
  if (!brand) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const [{ data: products }, { data: categories }] = await Promise.all([
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
  ]);

  const base = `${origin}/${brand.slug}`;
  const entries: Array<{ loc: string; lastmod?: string; priority: string; changefreq: string }> = [
    { loc: base, priority: "1.0", changefreq: "daily" },
    { loc: `${base}/search`, priority: "0.3", changefreq: "weekly" },
  ];
  for (const c of (categories ?? []) as Array<{ slug: string; updated_at?: string }>) {
    entries.push({
      loc: `${base}/${encodeURIComponent(c.slug)}`,
      lastmod: c.updated_at,
      priority: "0.7",
      changefreq: "weekly",
    });
  }
  for (const p of (products ?? []) as Array<{ id: string; updated_at?: string }>) {
    entries.push({
      loc: `${base}/product/${p.id}`,
      lastmod: p.updated_at,
      priority: "0.8",
      changefreq: "weekly",
    });
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map((e) => {
        const lastmod = e.lastmod ? `<lastmod>${new Date(e.lastmod).toISOString()}</lastmod>` : "";
        return `  <url><loc>${xmlEscape(e.loc)}</loc>${lastmod}<changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`;
      })
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": SITEMAP_CACHE,
    },
  });
}
