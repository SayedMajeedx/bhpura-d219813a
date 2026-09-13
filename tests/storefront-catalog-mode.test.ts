import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isCatalogMode,
  shouldShowPrices,
  normalizeWhatsAppDigits,
  renderInquiryMessage,
  buildWhatsAppInquiryUrl,
  DEFAULT_CATALOG_INQUIRY_TEMPLATE_AR,
  DEFAULT_CATALOG_INQUIRY_TEMPLATE_EN,
} from "../src/lib/storefront-mode";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("storefront catalog mode logic (src/lib/storefront-mode.ts)", () => {
  describe("isCatalogMode", () => {
    it("returns true only when storefront_mode is 'catalog'", () => {
      expect(isCatalogMode({ storefront_mode: "catalog" })).toBe(true);
      expect(isCatalogMode({ storefront_mode: "shop" })).toBe(false);
      expect(isCatalogMode({})).toBe(false);
      expect(isCatalogMode(null)).toBe(false);
      expect(isCatalogMode(undefined)).toBe(false);
      expect(isCatalogMode({ storefront_mode: "other" as any })).toBe(false);
    });
  });

  describe("shouldShowPrices", () => {
    it("always shows prices in shop mode regardless of catalog_show_prices", () => {
      expect(shouldShowPrices({ storefront_mode: "shop", catalog_show_prices: false })).toBe(true);
      expect(shouldShowPrices({ storefront_mode: "shop", catalog_show_prices: true })).toBe(true);
      expect(shouldShowPrices({})).toBe(true);
      expect(shouldShowPrices(null)).toBe(true);
    });

    it("respects catalog_show_prices when in catalog mode", () => {
      expect(shouldShowPrices({ storefront_mode: "catalog", catalog_show_prices: false })).toBe(
        false,
      );
      expect(shouldShowPrices({ storefront_mode: "catalog", catalog_show_prices: true })).toBe(
        true,
      );
      // Defaults to true if undefined
      expect(shouldShowPrices({ storefront_mode: "catalog" })).toBe(true);
    });
  });

  describe("normalizeWhatsAppDigits", () => {
    it("cleans symbols, spaces, and leading plus", () => {
      expect(normalizeWhatsAppDigits("+973 3912-3456")).toBe("97339123456");
      expect(normalizeWhatsAppDigits("00973 3311 2233")).toBe("97333112233");
    });

    it("prepends 973 country code to 8-digit Bahrain local numbers", () => {
      expect(normalizeWhatsAppDigits("39123456")).toBe("97339123456");
      expect(normalizeWhatsAppDigits("66123456")).toBe("97366123456");
      expect(normalizeWhatsAppDigits("17123456")).toBe("97317123456");
    });

    it("strips leading zero from local Bahrain numbers before adding country code", () => {
      expect(normalizeWhatsAppDigits("039123456")).toBe("97339123456");
    });

    it("returns null or empty for invalid input", () => {
      expect(normalizeWhatsAppDigits("")).toBe("");
      expect(normalizeWhatsAppDigits("   ")).toBe("");
      expect(normalizeWhatsAppDigits(null as any)).toBe("");
    });
  });

  describe("renderInquiryMessage", () => {
    it("renders English template with contextual tokens", () => {
      const template =
        "Hello {brand_name}, I want to inquire about {product_name} ({variant}) - {price}. Link: {product_url}";
      const rendered = renderInquiryMessage(template, {
        brandName: "Boutq Luxury",
        productName: "Silk Abaya",
        variantLabel: "Size 54 · Black",
        priceLabel: "45.000 BHD",
        productUrl: "https://boutq.shop/demo/product/123",
      });

      expect(rendered).toBe(
        "Hello Boutq Luxury, I want to inquire about Silk Abaya (Size 54 · Black) - 45.000 BHD. Link: https://boutq.shop/demo/product/123",
      );
    });

    it("renders Arabic default template seamlessly", () => {
      const rendered = renderInquiryMessage(DEFAULT_CATALOG_INQUIRY_TEMPLATE_AR, {
        brandName: "بوتيك الأناقة",
        productName: "عباية حرير",
        variantLabel: "مقاس 54",
        priceLabel: "45.000 د.ب",
        productUrl: "https://boutq.shop/demo/product/123",
      });

      expect(rendered).toContain("بوتيك الأناقة");
      expect(rendered).toContain("عباية حرير");
      expect(rendered).toContain("مقاس 54");
      expect(rendered).toContain("45.000 د.ب");
      expect(rendered).toContain("https://boutq.shop/demo/product/123");
    });

    it("renders English default template seamlessly", () => {
      const rendered = renderInquiryMessage(DEFAULT_CATALOG_INQUIRY_TEMPLATE_EN, {
        brandName: "Boutq Luxury",
        productName: "Silk Abaya",
        variantLabel: "Size 54",
        priceLabel: "45.000 BHD",
        productUrl: "https://boutq.shop/demo/product/123",
      });

      expect(rendered).toContain("Boutq Luxury");
      expect(rendered).toContain("Silk Abaya");
      expect(rendered).toContain("Size 54");
      expect(rendered).toContain("45.000 BHD");
      expect(rendered).toContain("https://boutq.shop/demo/product/123");
    });

    it("omits empty variant and price without leaving raw tokens", () => {
      const rendered = renderInquiryMessage("Inquire: {product_name} {variant} {price}", {
        productName: "Silk Dress",
      });

      expect(rendered).toBe("Inquire: Silk Dress");
      expect(rendered).not.toContain("{variant}");
      expect(rendered).not.toContain("{price}");
    });
  });

  describe("buildWhatsAppInquiryUrl", () => {
    it("returns null if no WhatsApp number is provided", () => {
      expect(
        buildWhatsAppInquiryUrl({
          number: "",
          lang: "en",
          ctx: { productName: "Abaya" },
        }),
      ).toBeNull();

      expect(
        buildWhatsAppInquiryUrl({
          number: null,
          lang: "ar",
          ctx: { productName: "عباية" },
        }),
      ).toBeNull();
    });

    it("builds valid wa.me URL with properly URI-encoded text", () => {
      const url = buildWhatsAppInquiryUrl({
        number: "+973 3912 3456",
        lang: "ar",
        ctx: {
          brandName: "بوتيك ريم",
          productName: "فستان سهرة",
          productUrl: "https://boutq.com/reem/product/1",
        },
      });

      expect(url).not.toBeNull();
      expect(url).toContain("https://wa.me/97339123456?text=");
      const params = new URL(url!).searchParams;
      const text = params.get("text");
      expect(text).toContain("بوتيك ريم");
      expect(text).toContain("فستان سهرة");
      expect(text).toContain("https://boutq.com/reem/product/1");
    });
  });
});

describe("Catalog Mode Architectural Contracts & Server Guards", () => {
  it("migration adds storefront mode columns, constraints, and views", () => {
    const migration = read("supabase/migrations/20260913100000_storefront_mode_catalog.sql");

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS storefront_mode");
    expect(migration).toContain("CHECK (storefront_mode IN ('shop', 'catalog'))");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS catalog_show_prices");
    expect(migration).toContain("CREATE OR REPLACE VIEW public.brand_public_settings");
    expect(migration).toContain("v_settings.storefront_mode = 'catalog'");
    expect(migration).toContain("STOREFRONT_CATALOG_MODE");
  });

  it("public API router orders endpoint enforces STOREFRONT_CATALOG_MODE guard", () => {
    const apiRouter = read("src/lib/public-api/public-api-router.server.ts");

    expect(apiRouter).toContain('bSettings?.storefront_mode === "catalog"');
    expect(apiRouter).toContain("STOREFRONT_CATALOG_MODE");
    expect(apiRouter).toContain("403");
  });

  it("checkout route guards against catalog mode and redirects", () => {
    const checkoutRoute = read("src/routes/$slug.checkout.tsx");

    expect(checkoutRoute).toContain("isCatalogMode(settings)");
    expect(checkoutRoute).toContain('navigate({ to: "/$slug"');
  });

  it("storefront context guards addToCart and abandoned cart tracking", () => {
    const sfContext = read("src/lib/storefront-context.tsx");

    expect(sfContext).toContain("isCatalogMode(settings)");
    expect(sfContext).toContain("if (isCatalogMode(settings))");
  });

  it("product details route replaces buy buttons with WhatsApp inquiry in catalog mode", () => {
    const productRoute = read("src/routes/$slug.product.$id.tsx");

    expect(productRoute).toContain("isCatalogMode(settings)");
    expect(productRoute).toContain("buildWhatsAppInquiryUrl");
    expect(productRoute).toContain("inquiryUrl");
    expect(productRoute).toContain("shouldShowPrices");
    expect(productRoute).toContain("تواصل معنا للسعر");
  });

  it("product card hides price and discount badge when prices are hidden", () => {
    const productCard = read("src/components/storefront/product-card.tsx");

    expect(productCard).toContain("shouldShowPrices(settings)");
    expect(productCard).toContain("تواصل معنا للسعر");
  });

  it("cart drawer and share cart modals return null in catalog mode", () => {
    const cartDrawer = read("src/components/storefront/StorefrontCartDrawer.tsx");
    const shareModal = read("src/components/storefront/ShareCartModal.tsx");

    expect(cartDrawer).toContain("if (isCatalogMode(settings))");
    expect(shareModal).toContain("if (isCatalogMode(settings))");
  });
});
