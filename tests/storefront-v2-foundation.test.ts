import { describe, it, expect } from "vitest";
import {
  buildOrganizationSchema,
  buildWebSiteSchema,
  buildProductSchema,
  buildBreadcrumbsSchema,
  buildCollectionSchema,
} from "../src/lib/seo/structured-data";
import { getGoogleFontsUrl, FONT_LIBRARY } from "../src/lib/typography";
import { FONT_MOOD_PRESETS } from "../src/components/settings/QuickThemeCustomizer";

describe("Storefront V2 Foundation - SEO & Structured Data", () => {
  it("builds valid Schema.org Organization JSON-LD", () => {
    const brand = {
      slug: "pura",
      name_en: "Boutique Pura",
      name_ar: "بوتيك بورا",
      logo_url: "https://boutq.app/pura/logo.png",
    };
    const settings = {
      business_name: "Boutique Pura",
      logo_url: "https://boutq.app/pura/logo.png",
      whatsapp_number: "+97339000000",
      socials: {
        instagram: "https://instagram.com/pura",
        twitter: "https://twitter.com/pura",
      },
    };

    const schema = buildOrganizationSchema(brand, settings);

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Organization");
    expect(schema.name).toBe("Boutique Pura");
    expect(schema.url).toBe("https://boutq.store/pura");
    expect(schema.logo).toBe("https://boutq.app/pura/logo.png");
    expect(schema.sameAs).toEqual(["https://instagram.com/pura", "https://twitter.com/pura"]);
  });

  it("builds valid Schema.org WebSite JSON-LD with SearchAction", () => {
    const brand = {
      slug: "pura",
      name_en: "Boutique Pura",
    };
    const settings = {
      business_name: "Boutique Pura",
    };

    const schema = buildWebSiteSchema(brand, settings);

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("WebSite");
    expect(schema.name).toBe("Boutique Pura");
    expect(schema.potentialAction).toBeDefined();
    expect(schema.potentialAction["@type"]).toBe("SearchAction");
    expect(schema.potentialAction.target.urlTemplate).toBe(
      "https://boutq.store/pura/search?q={search_term_string}",
    );
  });

  it("builds valid Product JSON-LD with in-stock and out-of-stock offers", () => {
    const brand = { slug: "pura", name_en: "Pura" };
    const settings = { currency: "BHD", business_name: "Pura" };

    const inStockSchema = buildProductSchema(
      {
        id: "prod-123",
        name_en: "Silk Abaya",
        price: 45.0,
        sku: "ABY-001",
        manage_stock: true,
        stock: 5,
        primary_image_url: "https://boutq.app/pura/abaya.jpg",
      },
      brand,
      settings,
      "en",
    );

    expect(inStockSchema["@context"]).toBe("https://schema.org");
    expect(inStockSchema["@type"]).toBe("Product");
    expect(inStockSchema.name).toBe("Silk Abaya");
    expect(inStockSchema.offers).toBeDefined();
    expect(inStockSchema.offers.price).toBe(45);
    expect(inStockSchema.offers.priceCurrency).toBe("BHD");
    expect(inStockSchema.offers.availability).toBe("https://schema.org/InStock");
    expect(inStockSchema.sku).toBe("ABY-001");

    const outOfStockSchema = buildProductSchema(
      {
        id: "prod-456",
        name_en: "Linen Dress",
        price: 32.5,
        manage_stock: true,
        stock: 0,
      },
      brand,
      { currency: "SAR", business_name: "Pura" },
      "en",
    );

    expect(outOfStockSchema.offers.availability).toBe("https://schema.org/OutOfStock");
    expect(outOfStockSchema.offers.price).toBe(32.5);
    expect(outOfStockSchema.offers.priceCurrency).toBe("SAR");
  });

  it("builds valid BreadcrumbList schema", () => {
    const breadcrumb = buildBreadcrumbsSchema([
      { name: "Home", url: "https://boutq.store/pura" },
      { name: "Dresses", url: "https://boutq.store/pura/dresses" },
      { name: "Silk Dress", url: "https://boutq.store/pura/product/123" },
    ]);

    expect(breadcrumb["@type"]).toBe("BreadcrumbList");
    expect(breadcrumb.itemListElement).toHaveLength(3);
    expect(breadcrumb.itemListElement[0].position).toBe(1);
    expect(breadcrumb.itemListElement[0].name).toBe("Home");
    expect(breadcrumb.itemListElement[0].item).toBe("https://boutq.store/pura");
    expect(breadcrumb.itemListElement[2].position).toBe(3);
    expect(breadcrumb.itemListElement[2].name).toBe("Silk Dress");
    expect(breadcrumb.itemListElement[2].item).toBe("https://boutq.store/pura/product/123");
  });

  it("builds valid CollectionPage schema", () => {
    const brand = { slug: "pura" };
    const collection = buildCollectionSchema(
      "Summer Collection",
      [
        { id: "1", name_en: "Product 1", price: 20 },
        { id: "2", name_en: "Product 2", price: 30 },
      ],
      brand,
      undefined,
      "https://boutq.store/pura/summer",
    );

    expect(collection["@type"]).toBe("CollectionPage");
    expect(collection.name).toBe("Summer Collection");
    expect(collection.mainEntity.itemListElement).toHaveLength(2);
    expect(collection.mainEntity.itemListElement[0].name).toBe("Product 1");
  });
});

describe("Storefront V2 Foundation - Typography & Presets", () => {
  it("getGoogleFontsUrl generates valid Google Fonts stylesheet URL", () => {
    const url = getGoogleFontsUrl({
      body: {
        en: { family: "Playfair Display", url: null },
        ar: { family: "Tajawal", url: null },
      },
      display: {
        en: { family: "Cinzel", url: null },
        ar: { family: "Amiri", url: null },
      },
      bodyWeight: 400,
      headingWeight: 600,
      scale: 1,
      bodyLineHeight: 1.6,
      headingLineHeight: 1.15,
      letterSpacing: 0,
      opticalSizing: true,
      axes: { width: 100, slant: 0, opticalSize: 14, hexp: 0, italic: false },
    });
    expect(url).not.toBeNull();
    expect(url).toContain("fonts.googleapis.com/css2?");
    expect(url).toContain("Playfair+Display");
    // Tajawal is self-hosted under /public/fonts and must never be requested from Google.
    expect(url).not.toContain("Tajawal");
    expect(url).toContain("display=swap");
  });

  it("getGoogleFontsUrl returns null for system fonts or empty config", () => {
    expect(getGoogleFontsUrl(null)).toBeNull();
  });

  it("FONT_LIBRARY contains required curated Arabic and Latin fonts", () => {
    const families = Object.keys(FONT_LIBRARY);
    expect(families).toContain("Cinzel");
    expect(families).toContain("Playfair Display");
    expect(families).toContain("Cormorant Garamond");
    expect(families).toContain("Prata");
    expect(families).toContain("Tajawal");
    expect(families).toContain("Amiri");
    expect(families).toContain("Marhey");
    expect(families).toContain("Alexandria");
  });

  it("FONT_MOOD_PRESETS contains 8 distinct typography pairings", () => {
    expect(FONT_MOOD_PRESETS.length).toBeGreaterThanOrEqual(8);
    for (const preset of FONT_MOOD_PRESETS) {
      expect(preset.id).toBeDefined();
      expect(preset.labelAr).toBeDefined();
      expect(preset.labelEn).toBeDefined();
      expect(preset.fontAr).toBeDefined();
      expect(preset.fontEn).toBeDefined();
    }
  });
});
