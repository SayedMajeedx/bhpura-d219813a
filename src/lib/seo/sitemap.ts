import { storedPages } from "@/lib/cms-pages";
import { resolveStoreModules, type StoreProfileSource } from "@/lib/store-profile";
import { storefrontCanonical } from "@/lib/seo/canonical";

/**
 * A store's sitemap, written from its catalog. Every address is the store's main one
 * (`storefrontCanonical`), whatever address the sitemap was fetched on, and each page is listed in
 * both languages with each naming the other, so Google indexes Arabic and English separately.
 */

type StoreAddress = { slug: string; custom_domain?: string | null };

export type SitemapEntry = {
  /** The page's path after the store ("" for the home page). */
  path: string;
  lastmod?: string | null;
  priority: string;
  changefreq: "daily" | "weekly" | "monthly";
};

type SitemapSource = {
  categories: ReadonlyArray<{ slug: string; updated_at?: string | null }>;
  products: ReadonlyArray<{ id: string; updated_at?: string | null }>;
  /** `business_settings.pages` as stored; pages with a slug and some content are listed. */
  pages: unknown;
  /** The store's vertical and module switches: the booking page is listed for a store that books. */
  settings: StoreProfileSource | null | undefined;
};

/** The pages of a store a visitor may open and Google may index, in the order they are listed. */
export function sitemapEntries(source: SitemapSource): SitemapEntry[] {
  const entries: SitemapEntry[] = [{ path: "", priority: "1.0", changefreq: "daily" }];
  const taken = new Set<string>();

  for (const category of source.categories) {
    if (!category.slug) continue;
    taken.add(category.slug);
    entries.push({
      path: encodeURIComponent(category.slug),
      lastmod: category.updated_at,
      priority: "0.7",
      changefreq: "weekly",
    });
  }

  // The store's own pages (about, delivery, terms, ...) live beside its categories.
  for (const page of storedPages(source.pages)) {
    const slug = page.slug?.trim();
    if (!slug || taken.has(slug)) continue;
    if (!page.content_ar?.trim() && !page.content_en?.trim()) continue;
    taken.add(slug);
    entries.push({ path: encodeURIComponent(slug), priority: "0.4", changefreq: "monthly" });
  }

  if (source.settings && resolveStoreModules(source.settings).bookings) {
    entries.push({ path: "book", priority: "0.8", changefreq: "weekly" });
  }

  for (const product of source.products) {
    entries.push({
      path: `product/${product.id}`,
      lastmod: product.updated_at,
      priority: "0.8",
      changefreq: "weekly",
    });
  }
  return entries;
}

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** The sitemap file: a `<url>` for each page in each language, each with its language links. */
export function sitemapXml(store: StoreAddress, entries: ReadonlyArray<SitemapEntry>): string {
  const rows = entries.flatMap((entry) => {
    const arabic = storefrontCanonical(store, entry.path, "ar");
    const english = storefrontCanonical(store, entry.path, "en");
    const alternates =
      `<xhtml:link rel="alternate" hreflang="ar" href="${xmlEscape(arabic)}"/>` +
      `<xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(english)}"/>` +
      `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(arabic)}"/>`;
    const lastmod = entry.lastmod
      ? `<lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>`
      : "";
    return [arabic, english].map(
      (loc) =>
        `  <url><loc>${xmlEscape(loc)}</loc>${lastmod}<changefreq>${entry.changefreq}</changefreq>` +
        `<priority>${entry.priority}</priority>${alternates}</url>`,
    );
  });
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    rows.join("\n") +
    `\n</urlset>\n`
  );
}
