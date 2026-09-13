import { describe, it, expect } from "vitest";
import { getAdminNavItems, type GetNavItemsOptions } from "../src/config/admin-navigation";
import { evaluateStoreReadiness } from "../src/components/settings/StoreReadinessChecklist";
import {
  DEFAULT_CATALOG_INQUIRY_MESSAGE_AR,
  DEFAULT_CATALOG_INQUIRY_MESSAGE_EN,
  isCatalogMode,
  shouldShowPrices,
  renderInquiryMessage,
  normalizeWhatsAppDigits,
} from "../src/lib/storefront-mode";

const mockNavOptions: GetNavItemsOptions = {
  activeSlug: "boutq-test",
  isCourier: false,
  isAdmin: true,
  hasPermission: () => true,
  t: (key: string) => key,
  lang: "ar" as const,
  unreadInquiriesCount: 0,
  hasActiveCampaigns: false,
  expensesFeatureEnabled: true,
  storefrontMode: "shop",
};

describe("Admin Storefront Mode — Navigation Architecture", () => {
  it("defaults to shop mode when storefrontMode is omitted or set to shop", () => {
    const itemsWithoutMode = getAdminNavItems({
      ...mockNavOptions,
      storefrontMode: undefined,
    });
    const itemsShop = getAdminNavItems({
      ...mockNavOptions,
      storefrontMode: "shop",
    });

    const idsWithoutMode = itemsWithoutMode.map((i) => i.id);
    const idsShop = itemsShop.map((i) => i.id);

    expect(idsWithoutMode).toContain("abandoned-carts");
    expect(idsWithoutMode).toContain("loyalty");
    expect(idsWithoutMode).toContain("discounts");

    expect(idsShop).toContain("abandoned-carts");
    expect(idsShop).toContain("loyalty");
    expect(idsShop).toContain("discounts");
  });

  it("filters out abandoned-carts, loyalty, and discounts in catalog mode", () => {
    const itemsCatalog = getAdminNavItems({
      ...mockNavOptions,
      storefrontMode: "catalog",
    });

    const idsCatalog = itemsCatalog.map((i) => i.id);

    // Filtered in catalog mode
    expect(idsCatalog).not.toContain("abandoned-carts");
    expect(idsCatalog).not.toContain("loyalty");
    expect(idsCatalog).not.toContain("discounts");

    // Operations remain intact
    expect(idsCatalog).toContain("dashboard");
    expect(idsCatalog).toContain("orders");
    expect(idsCatalog).toContain("returns");
    expect(idsCatalog).toContain("inventory");
    expect(idsCatalog).toContain("categories");
    expect(idsCatalog).toContain("customers");
    expect(idsCatalog).toContain("expenses");
    expect(idsCatalog).toContain("reports");
    expect(idsCatalog).toContain("settings");
    expect(idsCatalog).toContain("team");
  });
});

describe("Admin Storefront Mode — Store Readiness Checklist Integration", () => {
  const baseSettings = {
    brand_id: "test-brand-id",
    logo_url: "https://example.com/logo.png",
    storefront_mode: "shop",
    cod_enabled: true,
    card_enabled: true,
    benefit_enabled: true,
    delivery_enabled: true,
    pickup_enabled: false,
    delivery_fee: 1.5,
    shipping_zones: [{ name: "Capital", fee: 1.5 }],
    pages: [{ slug: "terms", title_ar: "الشروط" }],
    whatsapp_number: "+97333000000",
  };

  it("evaluates shop mode with 5 requirements including payments and fulfillment", () => {
    const readiness = evaluateStoreReadiness({
      logoUrl: baseSettings.logo_url,
      activeProductsCount: 3,
      businessSettings: baseSettings,
      lang: "ar",
    });

    expect(readiness.isCatalog).toBe(false);
    expect(readiness.totalCount).toBe(5);
    expect(readiness.items.map((i) => i.id)).toEqual([
      "logo",
      "products",
      "payments",
      "fulfillment",
      "policies",
    ]);
    expect(readiness.isAllComplete).toBe(true);
  });

  it("evaluates catalog mode with 4 requirements, omitting payments/fulfillment and requiring whatsapp", () => {
    const catalogSettings = {
      ...baseSettings,
      storefront_mode: "catalog",
      // Payments and shipping are disabled in catalog
      cod_enabled: false,
      card_enabled: false,
      benefit_enabled: false,
      delivery_enabled: false,
      pickup_enabled: false,
      shipping_zones: [],
      whatsapp_number: "+973 33112233",
    };

    const readiness = evaluateStoreReadiness({
      logoUrl: catalogSettings.logo_url,
      activeProductsCount: 4,
      businessSettings: catalogSettings,
      lang: "en",
    });

    expect(readiness.isCatalog).toBe(true);
    expect(readiness.totalCount).toBe(4);
    expect(readiness.items.map((i) => i.id)).toEqual(["logo", "products", "whatsapp", "policies"]);
    expect(readiness.hasWhatsApp).toBe(true);
    expect(readiness.completedCount).toBe(4);
    expect(readiness.isAllComplete).toBe(true);
  });

  it("marks catalog store incomplete when whatsapp_number is not set", () => {
    const catalogWithoutPhone = {
      ...baseSettings,
      storefront_mode: "catalog",
      whatsapp_number: "",
    };

    const readiness = evaluateStoreReadiness({
      logoUrl: catalogWithoutPhone.logo_url,
      activeProductsCount: 4,
      businessSettings: catalogWithoutPhone,
      lang: "ar",
    });

    expect(readiness.isCatalog).toBe(true);
    expect(readiness.hasWhatsApp).toBe(false);
    expect(readiness.completedCount).toBe(3);
    expect(readiness.totalCount).toBe(4);
    expect(readiness.isAllComplete).toBe(false);

    const whatsappItem = readiness.items.find((i) => i.id === "whatsapp");
    expect(whatsappItem?.isComplete).toBe(false);
    expect(whatsappItem?.tabId).toBe("storefront");
  });
});

describe("Admin Storefront Mode — Settings Defaults & Inquiry Templates", () => {
  it("provides valid default bilingual inquiry templates with all supported tokens", () => {
    expect(DEFAULT_CATALOG_INQUIRY_MESSAGE_AR).toContain("{brand_name}");
    expect(DEFAULT_CATALOG_INQUIRY_MESSAGE_AR).toContain("{product_name}");
    expect(DEFAULT_CATALOG_INQUIRY_MESSAGE_AR).toContain("{variant}");
    expect(DEFAULT_CATALOG_INQUIRY_MESSAGE_AR).toContain("{price}");
    expect(DEFAULT_CATALOG_INQUIRY_MESSAGE_AR).toContain("{product_url}");

    expect(DEFAULT_CATALOG_INQUIRY_MESSAGE_EN).toContain("{brand_name}");
    expect(DEFAULT_CATALOG_INQUIRY_MESSAGE_EN).toContain("{product_name}");
    expect(DEFAULT_CATALOG_INQUIRY_MESSAGE_EN).toContain("{variant}");
    expect(DEFAULT_CATALOG_INQUIRY_MESSAGE_EN).toContain("{price}");
    expect(DEFAULT_CATALOG_INQUIRY_MESSAGE_EN).toContain("{product_url}");
  });

  it("correctly renders inquiry messages with sample admin preview values", () => {
    const sampleContext = {
      brandName: "Pura Boutique",
      productName: "Linen Abaya",
      productUrl: "https://boutq.app/pura/p/abaya-01",
      variantLabel: "Size: M",
      priceLabel: "45.000 BHD",
    };

    const renderedAr = renderInquiryMessage(
      "طلب جديد من {brand_name} للمنتج {product_name} ({variant}) بسعر {price}\n{product_url}",
      sampleContext,
    );

    expect(renderedAr).toContain("Pura Boutique");
    expect(renderedAr).toContain("Linen Abaya");
    expect(renderedAr).toContain("Size: M");
    expect(renderedAr).toContain("45.000 BHD");
    expect(renderedAr).toContain("https://boutq.app/pura/p/abaya-01");
  });

  it("renders without prices when catalog_show_prices is disabled", () => {
    const sampleContextWithoutPrice = {
      brandName: "Pura Boutique",
      productName: "Linen Abaya",
      productUrl: "https://boutq.app/pura/p/abaya-01",
      variantLabel: "Size: M",
      priceLabel: "",
    };

    const rendered = renderInquiryMessage(
      DEFAULT_CATALOG_INQUIRY_MESSAGE_EN,
      sampleContextWithoutPrice,
    );
    expect(rendered).toContain("Pura Boutique");
    expect(rendered).toContain("Linen Abaya");
    expect(rendered).not.toContain("BHD");
  });

  it("correctly checks mode helpers isCatalogMode and shouldShowPrices", () => {
    expect(isCatalogMode({ storefront_mode: "catalog" })).toBe(true);
    expect(isCatalogMode({ storefront_mode: "shop" })).toBe(false);
    expect(isCatalogMode(null)).toBe(false);

    expect(shouldShowPrices({ storefront_mode: "shop", catalog_show_prices: false })).toBe(true);
    expect(shouldShowPrices({ storefront_mode: "catalog", catalog_show_prices: false })).toBe(
      false,
    );
    expect(shouldShowPrices({ storefront_mode: "catalog", catalog_show_prices: true })).toBe(true);
    expect(shouldShowPrices({ storefront_mode: "catalog" })).toBe(true);
  });

  it("normalizes phone numbers properly for WhatsApp linking", () => {
    expect(normalizeWhatsAppDigits("+973 3311 2233")).toBe("97333112233");
    expect(normalizeWhatsAppDigits("0097333112233")).toBe("97333112233");
    expect(normalizeWhatsAppDigits("33112233")).toBe("97333112233");
    expect(normalizeWhatsAppDigits("")).toBe("");
  });
});
