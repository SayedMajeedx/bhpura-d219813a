import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pageAddressLinks } from "../src/lib/seo/canonical";
import {
  PLATFORM_ROUTE_SEGMENTS,
  storeHostRedirect,
  storeHostRedirectResponse,
} from "../src/lib/seo/host-redirect";
import { isReservedStorefrontSlug } from "../src/lib/seo/reserved-slugs";
import { sitemapEntries, sitemapXml } from "../src/lib/seo/sitemap";
import { bookingHead } from "../src/features/storefront-booking/lib/booking-head";
import { productSnippet } from "../src/features/product-page/lib/product-snippet";
import { productHead } from "../src/features/product-page/lib/product-head";
import { buildOrganizationSchema, buildProductSchema } from "../src/lib/seo/structured-data";

// Google gets one address for a store, English pages it can index, and a sentence under every
// product (SEO foundations, 2026-10-28).

describe("a store's page on the platform's address", () => {
  it("goes for good to the store's own subdomain, with its path and query", () => {
    expect(storeHostRedirect("https://boutq.store/pura")).toBe("https://pura.boutq.store/pura");
    expect(storeHostRedirect("https://www.boutq.store/pura/product/p1?lang=en&variant=v2")).toBe(
      "https://pura.boutq.store/pura/product/p1?lang=en&variant=v2",
    );
    expect(storeHostRedirect("https://boutq.store/aurora/book", "HEAD")).toBe(
      "https://aurora.boutq.store/aurora/book",
    );
    const response = storeHostRedirectResponse(new Request("https://boutq.store/pura/abayas"))!;
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://pura.boutq.store/pura/abayas");
  });

  it("leaves everything that is not a store's public page where it is", () => {
    for (const url of [
      "https://boutq.store/",
      "https://boutq.store/admin/b/pura",
      "https://boutq.store/api/health/live",
      "https://boutq.store/invoice/abc",
      "https://boutq.store/review/abc",
      "https://boutq.store/robots.txt",
      "https://boutq.store/pura/sitemap.xml",
      "https://boutq.store/pura/products.xml",
      "https://boutq.store/pura/manifest.webmanifest",
      "https://boutq.store/pura/checkout",
      "https://boutq.store/pura/account",
      "https://boutq.store/pura/thank-you/o1",
      "https://pura.boutq.store/pura",
      "https://pura.bh/pura",
      "https://boutq.workers.dev/pura",
      "http://localhost:3000/pura",
    ]) {
      expect(storeHostRedirect(url), url).toBeNull();
    }
    expect(storeHostRedirect("https://boutq.store/pura", "POST")).toBeNull();
    expect(storeHostRedirectResponse(new Request("https://boutq.store/admin"))).toBeNull();
  });

  it("knows every top-level page of the platform, so none of them is taken for a store", () => {
    const routes = readdirSync(join(__dirname, "../src/routes"), { withFileTypes: true });
    const firstParts = new Set<string>();
    for (const route of routes) {
      const name = route.name.replace(/\.(tsx|ts)$/, "");
      if (name.startsWith("$slug") || name.startsWith("_") || name === "__root") continue;
      if (name === "index" || name === "README.md") continue;
      // `api.public.x` is `/api/public/x`; `b.$slug` is `/b/:slug`; the layout folder is admin.
      firstParts.add(name.split(".")[0]);
    }
    for (const part of firstParts) {
      const owned = PLATFORM_ROUTE_SEGMENTS.has(part) || isReservedStorefrontSlug(part);
      expect(owned, `/${part} must not be redirected as a store`).toBe(true);
    }
  });
});

describe("a page in both languages", () => {
  it("names itself and the other language, Arabic being the default", () => {
    const store = { slug: "pura" };
    expect(pageAddressLinks(store, "abayas", "en")).toEqual([
      { rel: "canonical", href: "https://pura.boutq.store/pura/abayas?lang=en" },
      { rel: "alternate", hrefLang: "ar", href: "https://pura.boutq.store/pura/abayas" },
      { rel: "alternate", hrefLang: "en", href: "https://pura.boutq.store/pura/abayas?lang=en" },
      { rel: "alternate", hrefLang: "x-default", href: "https://pura.boutq.store/pura/abayas" },
    ]);
    expect(pageAddressLinks({ slug: "pura", custom_domain: "pura.bh" }, "", "ar")[0]).toEqual({
      rel: "canonical",
      href: "https://pura.bh/pura",
    });
  });
});

describe("the sitemap", () => {
  const source = {
    categories: [{ slug: "abayas", updated_at: "2026-09-01T00:00:00Z" }],
    products: [{ id: "p1", updated_at: "2026-09-20T10:00:00Z" }],
    pages: {
      items: [
        { slug: "about", title_en: "About", content_en: "<p>Who we are</p>" },
        { slug: "empty", title_en: "Empty", content_en: " " },
        { slug: "abayas", title_en: "Taken", content_en: "x" },
        { title_en: "No address", content_en: "x" },
      ],
    },
    settings: { store_vertical: "services" },
  };

  it("lists the home page, categories, the store's pages, the booking page and products", () => {
    expect(sitemapEntries(source).map((entry) => entry.path)).toEqual([
      "",
      "abayas",
      "about",
      "book",
      "product/p1",
    ]);
  });

  it("lists no booking page for a store that does not take bookings", () => {
    const paths = sitemapEntries({ ...source, settings: { store_vertical: "fashion" } }).map(
      (entry) => entry.path,
    );
    expect(paths).not.toContain("book");
    expect(sitemapEntries({ ...source, settings: null }).map((e) => e.path)).not.toContain("book");
  });

  it("writes each page in both languages, each naming the other, on the main address", () => {
    const xml = sitemapXml({ slug: "pura" }, sitemapEntries(source));
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain("<loc>https://pura.boutq.store/pura/product/p1</loc>");
    expect(xml).toContain("<loc>https://pura.boutq.store/pura/product/p1?lang=en</loc>");
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://pura.boutq.store/pura/product/p1?lang=en"/>',
    );
    expect(xml).toContain("<loc>https://pura.boutq.store/pura/book</loc>");
    expect(xml).not.toContain("https://boutq.store/");
    // two addresses a page, each with three language links
    expect(xml.match(/<url>/g)).toHaveLength(10);
    expect(xml.match(/hreflang="x-default"/g)).toHaveLength(10);
  });
});

describe("the booking page's head", () => {
  const matches = [
    {
      routeId: "/$slug",
      loaderData: {
        brand: { slug: "aurora", name_en: "Aurora", name_ar: "أورورا" },
        initialLang: "ar",
      },
    },
  ];

  it("has its own title, description and address, apart from the home page's", () => {
    const head = bookingHead({ matches }) as {
      meta: Array<Record<string, string>>;
      links: Array<Record<string, string>>;
    };
    expect(head.meta.find((m) => m.title)?.title).toBe("احجز موعدك | أورورا");
    expect(head.links[0]).toEqual({
      rel: "canonical",
      href: "https://aurora.boutq.store/aurora/book",
    });
    expect(head.links.map((link) => link.hrefLang).filter(Boolean)).toEqual([
      "ar",
      "en",
      "x-default",
    ]);
  });

  it("says nothing when the store is not known", () => {
    expect(bookingHead({ matches: [] })).toEqual({});
  });
});

describe("a product's snippet", () => {
  const base = { name: "Silk Abaya", storeName: "Pura", lang: "en" as const };

  it("is the product's own description when it wrote one, cut at a word", () => {
    expect(productSnippet({ ...base, description: "<p>Soft   silk,\nmade by hand.</p>" })).toBe(
      "Soft silk, made by hand.",
    );
    const long = productSnippet({ ...base, description: "word ".repeat(80) });
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long.endsWith("…")).toBe(true);
  });

  it("is made of what the page says when there is no description", () => {
    expect(
      productSnippet({
        ...base,
        facts: [{ label: "Fabric", value: "Silk" }],
        price: { from: 30, to: 30 },
        currency: "BHD",
      }),
    ).toBe("Silk Abaya from Pura. Fabric: Silk. Price BHD 30.000.");
    // the name alone is not a description
    expect(productSnippet({ ...base, description: "Silk Abaya" })).toBe("Silk Abaya from Pura.");
  });

  it("says a range, books a service, and names no price a store hides", () => {
    expect(
      productSnippet({ ...base, price: { from: 20, to: 35 }, currency: "BHD", lang: "ar" }),
    ).toContain("تبدأ من");
    expect(productSnippet({ ...base, service: true })).toBe("Book Silk Abaya with Pura.");
    expect(productSnippet({ ...base, price: { from: 30, to: 30 }, showPrice: false })).toBe(
      "Silk Abaya from Pura.",
    );
  });

  it("is what a product page without a description shows under its title", () => {
    const head = productHead({
      loaderData: {
        initialLang: "ar",
        brand: { slug: "pura", name_ar: "بيورا", name_en: "Pura" },
        currency: "BHD",
        product: { id: "p1", name_ar: "عباية", base_price: 30, product_variants: [] },
      },
      params: { slug: "pura", id: "p1" },
    }) as { meta: Array<Record<string, string>> };
    const description = head.meta.find((m) => m.name === "description")?.content;
    expect(description).toContain("عباية من بيورا");
  });
});

describe("structured data names the main address", () => {
  it("uses the subdomain, or the store's own domain with its path", () => {
    expect(buildOrganizationSchema({ slug: "pura", name_en: "Pura" }).url).toBe(
      "https://pura.boutq.store/pura",
    );
    expect(
      buildOrganizationSchema({ slug: "pura", name_en: "Pura" }, { custom_domain: "pura.bh" }).url,
    ).toBe("https://pura.bh/pura");
    expect(buildProductSchema({ id: "p1", price: 3 }, { slug: "pura" }).url).toBe(
      "https://pura.boutq.store/pura/product/p1",
    );
  });
});
