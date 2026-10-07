import { describe, expect, it } from "vitest";
import {
  documentLanguage,
  socialImage,
  storefrontBase,
  storefrontCanonical,
} from "../src/lib/seo/canonical";
import { categoryHead, smartKindOf } from "../src/features/storefront-shell/lib/category-head";
import { storefrontHead } from "../src/features/storefront-shell/lib/storefront-head";

// The storefront's search-engine and link-preview details: each page says which address is its own,
// a category no longer repeats the home page's title, and a page in English is marked English.

const brand = {
  slug: "pura",
  name_en: "Pura",
  name_ar: "بيورا",
  logo_url: "https://cdn.test/logo.svg",
  custom_domain: null,
  meta_title: "Pura | Abayas",
  meta_description: "Home description",
};

const metaOf = (head: { meta?: Array<Record<string, string>> }, key: string, value: string) =>
  head.meta?.find((m) => m[key] === value)?.content;
const canonicalOf = (head: { links?: Array<Record<string, string>> }) =>
  head.links?.find((l) => l.rel === "canonical")?.href;

describe("canonical addresses", () => {
  it("uses the platform address, or the store's own domain when it has one", () => {
    expect(storefrontBase({ slug: "pura" })).toBe("https://boutq.store/pura");
    expect(storefrontBase({ slug: "pura", custom_domain: " https://pura.bh/ " })).toBe(
      "https://pura.bh/pura",
    );
    expect(storefrontCanonical({ slug: "pura" })).toBe("https://boutq.store/pura");
    expect(storefrontCanonical({ slug: "pura" }, "/abayas")).toBe(
      "https://boutq.store/pura/abayas",
    );
  });

  it("never gives a link preview a vector or missing picture", () => {
    expect(socialImage("https://cdn.test/logo.svg?v=2")).toBe(
      "https://boutq.store/og-placeholder.png",
    );
    expect(socialImage(null)).toBe("https://boutq.store/og-placeholder.png");
    expect(socialImage("https://cdn.test/cover.jpg")).toBe("https://cdn.test/cover.jpg");
  });
});

describe("document language", () => {
  it("takes the language from the first route that knows it", () => {
    expect(
      documentLanguage([{ loaderData: undefined }, { loaderData: { initialLang: "en" } }]),
    ).toEqual({
      lang: "en",
      dir: "ltr",
    });
    expect(documentLanguage([{ loaderData: { initialLang: "ar" } }])).toEqual({
      lang: "ar",
      dir: "rtl",
    });
    expect(documentLanguage([])).toEqual({ lang: "ar", dir: "rtl" });
  });
});

describe("category head", () => {
  it("gives a category its own title, description, address and breadcrumbs", () => {
    const head = categoryHead({
      slug: "pura",
      category: "daily",
      loaderData: {
        brand,
        category: { name_en: "Daily", name_ar: "يومي", image_url: null },
        initialLang: "en",
      },
    });
    expect(metaOf(head as never, "property", "og:title")).toBe("Daily | Pura");
    expect(canonicalOf(head as never)).toBe("https://boutq.store/pura/daily");
    expect(metaOf(head as never, "property", "og:image")).toBe(
      "https://boutq.store/og-placeholder.png",
    );
    expect(JSON.stringify((head as { scripts: unknown }).scripts)).toContain("BreadcrumbList");
  });

  it("names a smart collection in the shopper's language", () => {
    expect(smartKindOf("best-sellers")).toBe("best");
    expect(smartKindOf("daily")).toBeNull();
    const head = categoryHead({
      slug: "pura",
      category: "new-arrivals",
      loaderData: { brand, category: null, initialLang: "ar" },
    });
    expect(metaOf(head as never, "property", "og:title")).toBe("وصل حديثاً | بيورا");
  });

  it("keeps a CMS page's own title and description", () => {
    const head = categoryHead({
      slug: "pura",
      category: "about",
      loaderData: {
        brand,
        page: {
          slug: "about",
          title_en: "About",
          meta_title: "About Pura",
          meta_description: "Who we are",
        },
        initialLang: "en",
      },
    });
    expect(metaOf(head as never, "property", "og:title")).toBe("About Pura");
    expect(metaOf(head as never, "name", "description")).toBe("Who we are");
  });

  it("says nothing for a slug that is neither a page, a category nor a collection", () => {
    expect(
      categoryHead({ slug: "pura", category: "nope", loaderData: { brand, initialLang: "en" } }),
    ).toEqual({});
  });
});

describe("storefront (home) head", () => {
  const data = { brand, settings: { business_name: "Pura" }, initialLang: "en" as const };

  it("names its own address on the home page only", () => {
    const home = storefrontHead(data, { home: true }) as never as {
      meta: Array<Record<string, string>>;
      links: Array<Record<string, string>>;
    };
    expect(canonicalOf(home)).toBe("https://boutq.store/pura");
    expect(metaOf(home, "property", "og:url")).toBe("https://boutq.store/pura");
    expect(metaOf(home, "property", "og:image")).toBe("https://boutq.store/og-placeholder.png");

    const inner = storefrontHead(data) as never as { links: Array<Record<string, string>> };
    expect(canonicalOf(inner)).toBeUndefined();
  });

  it("uses the store's own domain for the home address", () => {
    const home = storefrontHead(
      { ...data, brand: { ...brand, custom_domain: "pura.bh" } },
      { home: true },
    ) as never as { links: Array<Record<string, string>> };
    expect(canonicalOf(home)).toBe("https://pura.bh/pura");
  });
});
