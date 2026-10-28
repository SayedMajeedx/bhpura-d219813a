import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { categoryListing, homeListing, writtenListing } from "../src/lib/seo/listing";
import { parseVerificationInput } from "../src/lib/seo/search-console";
import { seoChecklist } from "../src/features/settings/lib/seo-checklist";
import { storefrontHead } from "../src/features/storefront-shell/lib/storefront-head";
import { categoryHead } from "../src/features/storefront-shell/lib/category-head";
import { productHead } from "../src/features/product-page/lib/product-head";

// What Google shows for a store, in each language: the words the store wrote, what the preview in
// Settings draws is what the page's head writes, and a product's and a category's own words win.

const brand = {
  slug: "pura",
  name_en: "Pura",
  name_ar: "بيورا",
  logo_url: null,
  meta_title: "بيورا | عبايات",
  meta_description: "عبايات فاخرة",
  meta_title_en: "Pura | Abayas",
  meta_description_en: "Luxury abayas",
};

const metaOf = (head: { meta?: Array<Record<string, string>> }, key: string, value: string) =>
  head.meta?.find((m) => m[key] === value)?.content;

describe("the home page's listing", () => {
  it("uses each language's own words", () => {
    expect(homeListing(brand, "ar")).toMatchObject({ title: "بيورا | عبايات", fallback: false });
    expect(homeListing(brand, "en")).toMatchObject({ title: "Pura | Abayas", fallback: false });
  });

  it("gives the English page the older single title while it has none of its own", () => {
    const legacy = { ...brand, meta_title_en: null, meta_description_en: null };
    expect(homeListing(legacy, "en").title).toBe("بيورا | عبايات");
  });

  it("says only what is true when the store wrote nothing, and says it is the platform's", () => {
    const bare = { name_ar: "بيورا", name_en: "Pura" };
    expect(homeListing(bare, "en")).toEqual({
      title: "Pura",
      description: "Shop Pura online.",
      fallback: true,
    });
    expect(homeListing(bare, "ar").description).toBe("تسوق من بيورا أونلاين.");
    expect(homeListing(bare, "ar", { bookings: true }).title).toBe("بيورا — احجز موعدك أونلاين");
    expect(homeListing(bare, "en").description).not.toMatch(/delivery|secure/i);
  });
});

describe("a product's and a category's own words", () => {
  const words = {
    seo_title_ar: "عباية حرير",
    seo_title_en: "",
    seo_description_ar: "",
    seo_description_en: "Hand-made silk",
  };

  it("are used in their own language only", () => {
    expect(writtenListing(words, "ar")).toEqual({ title: "عباية حرير", description: "" });
    expect(writtenListing(words, "en")).toEqual({ title: "", description: "Hand-made silk" });
    expect(writtenListing(null, "en")).toEqual({ title: "", description: "" });
  });

  it("replace a category's title and description, else it is Name | Store", () => {
    const names = { name: "Abayas", storeName: "Pura" };
    expect(categoryListing(words, "ar", names).title).toBe("عباية حرير");
    expect(categoryListing(words, "en", names)).toMatchObject({
      title: "Abayas | Pura",
      description: "Hand-made silk",
      fallback: false,
    });
    expect(categoryListing(null, "en", names)).toMatchObject({
      description: "Shop Abayas at Pura.",
      fallback: true,
    });
    expect(categoryListing(null, "en", { ...names, servicesStore: true }).description).toBe(
      "Book Abayas with Pura.",
    );
  });
});

describe("the page heads", () => {
  it("write the English home page's words on the English page, and the verification tag", () => {
    const head = storefrontHead(
      {
        brand: { ...brand, google_site_verification: "abc123DEF456" },
        settings: { business_name: "Pura" },
        initialLang: "en",
      },
      { home: true },
    ) as never as { meta: Array<Record<string, string>> };
    expect(head.meta.find((m) => m.title)?.title).toBe("Pura | Abayas");
    expect(metaOf(head, "name", "description")).toBe("Luxury abayas");
    expect(metaOf(head, "name", "google-site-verification")).toBe("abc123DEF456");
  });

  it("write no verification tag for a store that has none", () => {
    const head = storefrontHead(
      { brand, settings: { business_name: "Pura" }, initialLang: "ar" },
      { home: true },
    ) as never as { meta: Array<Record<string, string>> };
    expect(metaOf(head, "name", "google-site-verification")).toBeUndefined();
  });

  it("use a category's own words", () => {
    const head = categoryHead({
      slug: "pura",
      category: "daily",
      loaderData: {
        brand,
        category: {
          name_en: "Daily",
          name_ar: "يومي",
          image_url: null,
          seo_title_en: "Daily abayas for work",
          seo_description_en: "Light, easy, everyday.",
        },
        initialLang: "en",
      },
    });
    expect(metaOf(head as never, "property", "og:title")).toBe("Daily abayas for work");
    expect(metaOf(head as never, "name", "description")).toBe("Light, easy, everyday.");
  });

  it("use a product's own words, in the page's language", () => {
    const loaderData = {
      initialLang: "ar",
      brand: { slug: "pura", name_ar: "بيورا", name_en: "Pura" },
      product: {
        id: "p1",
        name_ar: "عباية",
        name_en: "Abaya",
        seo_title_ar: "عباية حرير فاخرة",
        seo_description_en: "English only",
        base_price: 30,
        product_variants: [],
      },
    };
    const ar = productHead({ loaderData, params: { slug: "pura", id: "p1" } }) as never as {
      meta: Array<Record<string, string>>;
    };
    expect(ar.meta.find((m) => m.title)?.title).toBe("عباية حرير فاخرة");
    // the English description is not the Arabic page's: the page says what it always did
    expect(metaOf(ar, "name", "description")).toContain("عباية من بيورا");
    const en = productHead({
      loaderData: { ...loaderData, initialLang: "en" },
      params: { slug: "pura", id: "p1" },
    }) as never as { meta: Array<Record<string, string>> };
    expect(metaOf(en, "name", "description")).toBe("English only");
    expect(en.meta.find((m) => m.title)?.title).toBe("Abaya | Pura");
  });
});

describe("the Search Console tag", () => {
  it("takes the tag Google shows or its code, and refuses anything else", () => {
    const code = "AbC123_-xyz987";
    expect(
      parseVerificationInput(`<meta name="google-site-verification" content="${code}" />`),
    ).toEqual({ status: "ok", token: code });
    expect(parseVerificationInput(`  ${code} `)).toEqual({ status: "ok", token: code });
    expect(parseVerificationInput("")).toEqual({ status: "empty" });
    expect(parseVerificationInput("short")).toEqual({ status: "invalid" });
    expect(parseVerificationInput('"><script>alert(1)</script>')).toEqual({ status: "invalid" });
  });
});

describe("the SEO checklist", () => {
  it("counts what the store wrote, connected and described", () => {
    const items = seoChecklist({
      brand: { ...brand, google_site_verification: null },
      productsWithoutDescription: 3,
      productsWithoutPhoto: 0,
    });
    expect(items.map((item) => [item.id, item.done])).toEqual([
      ["home_ar", true],
      ["home_en", true],
      ["verified", false],
      ["descriptions", false],
      ["photos", true],
    ]);
    expect(items.find((item) => item.id === "descriptions")?.count).toBe(3);
    expect(
      seoChecklist({ brand: {}, productsWithoutDescription: 0, productsWithoutPhoto: 0 })[1].done,
    ).toBe(false);
  });
});

const form = vi.hoisted(() => ({ brand: {} as Record<string, unknown>, setBrand: vi.fn() }));
const formModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useBrandSettingsFormContext: () => ({
    form: {
      brand: form.brand,
      bs: { business_name: "Pura", store_vertical: "fashion" },
    },
    setBrand: form.setBrand,
    brandId: "b1",
  }),
});
vi.mock("../src/features/settings/use-brand-settings-form", (io) => formModule(io));
vi.mock("@/features/settings/use-brand-settings-form", (io) => formModule(io));
vi.mock("../src/lib/data/catalog", async (io) => ({
  ...(await io<object>()),
  catalogInsightQueries: {
    withoutDescription: () => ({ queryKey: ["d"], queryFn: async () => 2 }),
    withoutPhoto: () => ({ queryKey: ["p"], queryFn: async () => 0 }),
  },
}));
vi.mock("@/lib/data/catalog", async (io) => ({
  ...(await io<object>()),
  catalogInsightQueries: {
    withoutDescription: () => ({ queryKey: ["d"], queryFn: async () => 2 }),
    withoutPhoto: () => ({ queryKey: ["p"], queryFn: async () => 0 }),
  },
}));

const { SeoGroup } = await import("../src/features/settings/tabs/storefront/SeoGroup");
const { I18nProvider } = await import("../src/lib/i18n");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");

const showGroup = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <SeoGroup />
      </I18nProvider>
    </QueryClientProvider>,
  );

describe("the SEO settings group", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("lang", "en");
    form.brand = { id: "b1", slug: "pura", name_en: "Pura", name_ar: "بيورا" };
  });

  it("previews the platform's words, and says so, while the store wrote none", () => {
    showGroup();
    expect(screen.getByText("Shop Pura online.")).toBeInTheDocument();
    expect(screen.getByText("تسوق من بيورا أونلاين.")).toBeInTheDocument();
    expect(screen.getAllByText(/These are the platform's words/)).toHaveLength(2);
    // the promise the preview once made is gone
    expect(screen.queryByText(/fast delivery/i)).toBeNull();
  });

  it("previews the store's own words in each language and writes them per language", () => {
    form.brand = { ...form.brand, ...brand };
    showGroup();
    expect(screen.getAllByText("Pura | Abayas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("بيورا | عبايات").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/^Title$/, { selector: "#seo-en-title" }), {
      target: { value: "Pura abayas online" },
    });
    expect(form.setBrand).toHaveBeenCalledWith({ meta_title_en: "Pura abayas online" });
  });

  it("gives the sitemap link and keeps only a valid verification code", () => {
    showGroup();
    expect(screen.getByDisplayValue("https://pura.boutq.store/sitemap.xml")).toBeInTheDocument();
    const field = screen.getByLabelText("Verification tag or its code");
    fireEvent.change(field, {
      target: { value: '<meta name="google-site-verification" content="AbC123_-xyz987" />' },
    });
    expect(form.setBrand).toHaveBeenLastCalledWith({ google_site_verification: "AbC123_-xyz987" });
    form.setBrand.mockClear();
    fireEvent.change(field, { target: { value: "not a code!" } });
    expect(form.setBrand).not.toHaveBeenCalled();
    expect(screen.getByText(/will not be saved/)).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "" } });
    expect(form.setBrand).toHaveBeenLastCalledWith({ google_site_verification: null });
  });

  it("lists what is left to do", async () => {
    showGroup();
    expect(await screen.findByText("2 products without a description")).toBeInTheDocument();
    expect(screen.getByText("Every product has a photo")).toBeInTheDocument();
  });
});
