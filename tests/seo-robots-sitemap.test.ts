import { describe, expect, it, vi } from "vitest";

// Minimal supabaseAdmin stub: every chained call returns the builder, and
// awaiting it resolves to the canned rows for the table being queried.
const rows: Record<string, any[]> = {
  brands: [{ id: "brand-1", slug: "qoffee" }],
  products: [
    { id: "p-1", updated_at: "2026-09-20T10:00:00Z" },
    { id: "p-2", updated_at: "2026-09-19T10:00:00Z" },
  ],
  categories: [{ slug: "beans & more", updated_at: "2026-09-01T00:00:00Z" }],
};
const calls: Array<{ table: string; filters: Array<[string, unknown, unknown]> }> = [];

function builder(table: string) {
  const state = { table, filters: [] as Array<[string, unknown, unknown]> };
  calls.push(state);
  const b: any = {};
  for (const m of ["select", "eq", "not", "order", "limit"]) {
    b[m] = (...args: unknown[]) => {
      if (m === "eq" || m === "not") state.filters.push([m, args[0], args[1]]);
      return b;
    };
  }
  b.maybeSingle = async () => {
    const wantSlug = state.filters.find((f) => f[0] === "eq" && f[1] === "slug")?.[2];
    const wantDomain = state.filters.find((f) => f[0] === "eq" && f[1] === "custom_domain")?.[2];
    if (wantSlug) return { data: rows.brands.find((r) => r.slug === wantSlug) ?? null };
    if (wantDomain === "shop.example.com") return { data: rows.brands[0] };
    return { data: null };
  };
  b.then = (resolve: (v: unknown) => void) => resolve({ data: rows[table] ?? [] });
  return b;
}
const supabaseAdmin = { from: (table: string) => builder(table) };
vi.mock("../src/integrations/supabase/client.server", () => ({ supabaseAdmin }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));

import { handleRobotsRequest, handleSitemapRequest } from "../src/lib/seo/robots-sitemap.server";
import { isReservedStorefrontSlug } from "../src/lib/seo/reserved-slugs";

describe("reserved storefront slugs", () => {
  it("rejects crawler probes and platform paths before any brand lookup", () => {
    for (const slug of [
      "robots.txt",
      "sitemap.xml",
      "favicon.ico",
      ".well-known",
      "admin",
      "api",
      "assets",
      "",
    ]) {
      expect(isReservedStorefrontSlug(slug), slug).toBe(true);
    }
  });

  it("accepts ordinary brand slugs", () => {
    for (const slug of ["qoffee", "pura", "my-brand-2"]) {
      expect(isReservedStorefrontSlug(slug), slug).toBe(false);
    }
  });
});

describe("robots.txt fast path", () => {
  it("serves a cacheable robots file with a host-specific sitemap for brand hosts", () => {
    const res = handleRobotsRequest(new Request("https://qoffee.boutq.store/robots.txt"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
    return res.text().then((body) => {
      expect(body).toContain("User-agent: *");
      expect(body).toContain("Disallow: /admin");
      expect(body).toContain("Disallow: /*/checkout");
      expect(body).toContain("Sitemap: https://qoffee.boutq.store/sitemap.xml");
    });
  });

  it("omits the sitemap on the platform domain", async () => {
    const body = await handleRobotsRequest(new Request("https://boutq.store/robots.txt")).text();
    expect(body).not.toContain("Sitemap:");
  });

  it("honours x-forwarded-host", async () => {
    const body = await handleRobotsRequest(
      new Request("https://internal.workers.dev/robots.txt", {
        headers: { "x-forwarded-host": "shop.example.com" },
      }),
    ).text();
    expect(body).toContain("Sitemap: https://shop.example.com/sitemap.xml");
  });
});

describe("sitemap.xml fast path", () => {
  it("resolves the brand from the *.boutq.store subdomain and lists home, categories and products", async () => {
    const res = await handleSitemapRequest(new Request("https://qoffee.boutq.store/sitemap.xml"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");
    const xml = await res.text();
    expect(xml).toContain("<loc>https://qoffee.boutq.store/qoffee</loc>");
    expect(xml).toContain("<loc>https://qoffee.boutq.store/qoffee/product/p-1</loc>");
    expect(xml).toContain("<lastmod>2026-09-20T10:00:00.000Z</lastmod>");
    // category slug is URL-encoded and XML-escaped
    expect(xml).toContain("<loc>https://qoffee.boutq.store/qoffee/beans%20%26%20more</loc>");
    expect(xml).not.toContain("beans & more");
  });

  it("resolves an explicit /{slug}/sitemap.xml path", async () => {
    const res = await handleSitemapRequest(
      new Request("https://boutq.store/qoffee/sitemap.xml"),
      "qoffee",
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<loc>https://boutq.store/qoffee</loc>");
  });

  it("resolves a mapped custom domain", async () => {
    const res = await handleSitemapRequest(new Request("https://shop.example.com/sitemap.xml"));
    expect(res.status).toBe(200);
  });

  it("returns 404 for unknown hosts and the bare platform domain without a slug", async () => {
    expect(
      (await handleSitemapRequest(new Request("https://boutq.store/sitemap.xml"))).status,
    ).toBe(404);
    expect(
      (await handleSitemapRequest(new Request("https://nobody.boutq.store/sitemap.xml"))).status,
    ).toBe(404);
  });

  it("only lists active rows scoped to the brand", async () => {
    calls.length = 0;
    await handleSitemapRequest(new Request("https://qoffee.boutq.store/sitemap.xml"));
    for (const table of ["products", "categories"]) {
      const q = calls.find((c) => c.table === table)!;
      expect(q.filters).toContainEqual(["eq", "brand_id", "brand-1"]);
      expect(q.filters).toContainEqual(["eq", "is_active", true]);
    }
  });
});
