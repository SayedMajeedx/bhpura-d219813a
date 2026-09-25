import { afterEach, describe, expect, it } from "vitest";
import {
  heroConfigFrom,
  publicSettingsFromPageData,
} from "../src/features/storefront-shell/lib/public-settings";
import { storefrontHead } from "../src/features/storefront-shell/lib/storefront-head";
import { footerPageGroups } from "../src/features/storefront-shell/lib/footer-pages";
import { shellTheme } from "../src/features/storefront-shell/lib/shell-theme";
import { resolveInitialLang } from "../src/features/storefront-shell/lib/initial-lang";
import type { Brand, PublicSettings } from "../src/lib/storefront-context";

type PageData = Parameters<typeof publicSettingsFromPageData>[1];

const brand = {
  id: "b1",
  slug: "pura",
  name_en: "Pura",
  name_ar: "بورا",
  logo_url: "https://cdn/logo.png",
  primary_color: "#224466",
} as Brand;

const pageData = (settings: Record<string, unknown>, extra: Partial<PageData> = {}) =>
  ({ brand, settings, ...extra }) as PageData;

describe("publicSettingsFromPageData", () => {
  it("fills every default for a store with no settings", () => {
    const s = publicSettingsFromPageData(brand, pageData({}));
    expect(s).toMatchObject({
      brand_id: "b1",
      business_name: "Pura",
      logo_url: "https://cdn/logo.png",
      currency: "BHD",
      primary_color: "#224466",
      cod_enabled: true,
      card_enabled: false,
      delivery_fee: 0,
      storefront_mode: "shop",
      secondary_banner_parallax_enabled: false,
      hero_overlay_strength: 45,
      storefront_design_version: 1,
      shipping_zones: [],
      pages: [],
      socials: [],
      trust_badges: null,
      analytics_consent_required: true,
    });
    expect(s.homepage_editorial_sections.best).toEqual({
      enabled: true,
      banner_image_url: "",
      background_color: "",
      background_image_url: "",
    });
  });

  it("cleans pages and socials", () => {
    const s = publicSettingsFromPageData(
      brand,
      pageData({
        pages: {
          items: [
            { title_en: "About", group: "company" },
            { slug: "faq", group: "other" },
          ],
          footer_titles: { help_en: "Support" },
        },
        socials: [
          { name: " Instagram ", url: " https://ig/pura " },
          { name: "X", url: "" },
        ],
      }),
    );
    expect(s.pages.map((p) => [p.slug, p.group, p.image_position])).toEqual([
      ["page-1", "company", "top"],
      ["faq", "help", "top"],
    ]);
    expect(s.footer_help_title_en).toBe("Support");
    expect(s.socials).toEqual([{ name: "Instagram", url: "https://ig/pura" }]);
  });

  it("reads trust badges and shipping zones stored as JSON text", () => {
    const s = publicSettingsFromPageData(
      brand,
      pageData({
        trust_badges: JSON.stringify({ items: [{ text_en: "Free returns", enabled: false }] }),
        shipping_zones: JSON.stringify([{ id: "gcc", fee: "3", pricing_type: "bundle" }]),
      }),
    );
    expect(s.trust_badges).toEqual({
      enabled: true,
      items: [
        {
          id: "badge-0",
          icon: "ShieldCheck",
          text_ar: "",
          text_en: "Free returns",
          color: "amber",
          enabled: false,
        },
      ],
    });
    expect(s.shipping_zones[0]).toMatchObject({
      id: "gcc",
      fee: 3,
      pricing_type: "bundle",
      bundle_size: 2,
      allowed_payment_methods: ["card", "benefit"],
    });
  });

  it("drops unreadable badges and zones instead of failing", () => {
    const s = publicSettingsFromPageData(
      brand,
      pageData({ trust_badges: "{oops", shipping_zones: "not json" }),
    );
    expect(s.trust_badges).toBeNull();
    expect(s.shipping_zones).toEqual([]);
  });

  it("keeps the legacy trending banner and the legacy font columns", () => {
    const s = publicSettingsFromPageData(
      brand,
      pageData({
        trending_banner_background_url: "https://cdn/trend.jpg",
        storefront_font_ar: "Almarai",
      }),
    );
    expect(s.homepage_editorial_sections.trending.banner_image_url).toBe("https://cdn/trend.jpg");
    expect(s.storefront_typography.body.ar.family).toBe("Almarai");
    expect(s.storefront_typography.display.ar.family).toBe("Almarai");
  });

  it("takes Benefit and tracking settings from their own rows", () => {
    const s = publicSettingsFromPageData(
      brand,
      pageData(
        {},
        {
          benefitSettings: [{ benefit_account_number: "123" }],
          trackingSettings: {
            meta_pixel_enabled: true,
            meta_pixel_id: "px",
            consent_required: false,
          },
        },
      ),
    );
    expect(s.benefit_account_number).toBe("123");
    expect(s.meta_pixel_enabled).toBe(true);
    expect(s.meta_pixel_id).toBe("px");
    expect(s.analytics_consent_required).toBe(false);
  });
});

describe("heroConfigFrom", () => {
  it("reads the current shape and caps slides at 5", () => {
    const slides = Array.from({ length: 7 }, (_, i) => ({ id: i }));
    const hero = heroConfigFrom({ background: { url: "bg.mp4" }, slides });
    expect(hero.background).toEqual({ url: "bg.mp4" });
    expect(hero.slides).toHaveLength(5);
  });

  it("uses the first item of the legacy array as the background", () => {
    expect(heroConfigFrom([{ url: "a.jpg" }, { url: "b.jpg" }])).toEqual({
      background: { url: "a.jpg" },
      slides: [],
    });
    expect(heroConfigFrom(null)).toEqual({ background: null, slides: [] });
  });
});

describe("storefrontHead", () => {
  const settings = { business_name: "", logo_url: null } as unknown as PublicSettings;

  it("falls back to a plain title without a brand", () => {
    expect(storefrontHead(undefined)).toEqual({ meta: [{ title: "Storefront" }] });
  });

  it("builds the title, description and direction in the shopper's language", () => {
    const head = storefrontHead({ brand, settings, initialLang: "en" });
    expect("htmlAttrs" in head && head.htmlAttrs).toEqual({ lang: "en", dir: "ltr" });
    expect(head.meta).toContainEqual({ title: "Pura" });
    expect(head.meta).toContainEqual({ name: "description", content: "Shop Pura online." });
    expect(head.meta).toContainEqual({ property: "og:image", content: "https://cdn/logo.png" });

    const ar = storefrontHead({ brand, settings, initialLang: "ar" });
    expect("htmlAttrs" in ar && ar.htmlAttrs).toEqual({ lang: "ar", dir: "rtl" });
    expect(ar.meta).toContainEqual({ name: "description", content: "تسوق من بورا أونلاين." });
  });

  it("links the manifest and adds structured data", () => {
    const head = storefrontHead({ brand, settings, initialLang: "en" });
    expect("links" in head && head.links).toContainEqual({
      rel: "manifest",
      href: "/pura/manifest.webmanifest",
    });
    const ldTypes = ("scripts" in head ? head.scripts : [])
      .filter((sc) => sc.type === "application/ld+json")
      .map((sc) => JSON.parse(String(sc.children))["@type"]);
    expect(ldTypes).toEqual(["Organization", "WebSite"]);
  });
});

describe("footerPageGroups", () => {
  const page = (overrides: Partial<PublicSettings["pages"][number]>) =>
    ({
      slug: "p",
      title_ar: null,
      title_en: null,
      group: undefined,
      ...overrides,
    }) as unknown as PublicSettings["pages"][number];

  it("uses the page's group, else company for about/contact pages", () => {
    const { companyPages, helpPages, pageLinks } = footerPageGroups(
      [
        page({ slug: "about-us", title_en: "About us" }),
        page({ slug: "shipping", title_en: "Shipping", group: "company" }),
        page({ slug: "faq", title_ar: "الأسئلة" }),
        page({ slug: "tawasul", title_ar: "تواصل معنا" }),
        page({ slug: "empty" }),
      ],
      true,
    );
    expect(companyPages.map((p) => p.slug)).toEqual(["about-us", "shipping", "tawasul"]);
    expect(helpPages.map((p) => [p.slug, p.title])).toEqual([["faq", "الأسئلة"]]);
    expect(pageLinks.map((p) => p.idx)).toEqual([1, 2, 3, 4]);
  });
});

describe("shellTheme", () => {
  const base = {
    primary_color: "#224466",
    background_color: "#ffffff",
    text_color: "#111111",
    storefront_typography: publicSettingsFromPageData(brand, pageData({})).storefront_typography,
  } as unknown as PublicSettings;
  const vars = (settings: Partial<PublicSettings>) =>
    shellTheme({ brand, settings: { ...base, ...settings }, lang: "en" }).style as Record<
      string,
      unknown
    >;

  it("derives button, heading and price colours from the brand colour", () => {
    const style = vars({});
    expect(style["--primary"]).toBe("#224466");
    expect(style["--sf-btn-primary-bg"]).toBe("#224466");
    expect(style["--sf-btn-checkout-bg"]).toBe("#224466");
    expect(style["--sf-heading"]).toBe("#224466");
    expect(style["--sf-price"]).toBe("#224466");
    expect(style["--sf-btn-secondary-bg"]).toBe("#111111");
  });

  it("only allows the offered corner radii", () => {
    expect(vars({ storefront_radius: "1rem" })["--radius-sf"]).toBe("1rem");
    expect(vars({ storefront_radius: "3px" })["--radius-sf"]).toBe("0.5rem");
  });

  it("maps the badge accent and makes the glass header translucent", () => {
    expect(vars({ badge_accent: "emerald" })["--badge-accent-bg"]).toBe("#059669");
    expect(vars({})["--badge-accent-bg"]).toBe("#330a0a");
    const glass = shellTheme({
      brand,
      settings: { ...base, header_bg: "#000000" },
      lang: "en",
    });
    expect(glass.isGlass).toBe(true);
    expect((glass.style as Record<string, unknown>)["--sf-header-bg"]).toBe("rgba(0, 0, 0, 0.85)");
    expect((glass.style as Record<string, unknown>)["--sf-header-fg"]).toBe("#ffffff");
  });
});

describe("resolveInitialLang", () => {
  afterEach(() => {
    localStorage.clear();
    document.cookie = "boutq_lang_pura=; max-age=0";
  });

  it("prefers ?lang=, then the cookie, then localStorage, else Arabic", async () => {
    expect(await resolveInitialLang("pura", { lang: "en" })).toBe("en");
    expect(await resolveInitialLang("pura", {})).toBe("ar");
    localStorage.setItem("storefront-lang:pura", "en");
    expect(await resolveInitialLang("pura", undefined)).toBe("en");
    document.cookie = "boutq_lang_pura=ar";
    expect(await resolveInitialLang("pura", undefined)).toBe("ar");
  });
});
