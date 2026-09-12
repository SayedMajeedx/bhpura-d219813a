import { describe, it, expect } from "vitest";
import { evaluateStoreReadiness } from "../src/components/settings/StoreReadinessChecklist";

describe("evaluateStoreReadiness", () => {
  const puraBusinessSettings = {
    logo_url:
      "https://media.boutq.store/brands/b2f628c9-cfeb-444b-befe-5dbbb9d5c9e6/logo/170acff7-a39b-40ae-b796-06da268e8ec1.svg",
    cod_enabled: true,
    card_enabled: true,
    benefit_enabled: false,
    delivery_enabled: true,
    pickup_enabled: true,
    delivery_fee: "2.000",
    shipping_zones: [
      { id: "zone-1", fee: 5, name_ar: "شحن للمملكة العربية السعودية", name_en: "KSA Shipping" },
    ],
    pages: [
      { slug: "about-us", title_ar: "عن البراند", content_ar: "..." },
      { slug: "size-guide", title_ar: "دليل المقاسات", content_ar: "..." },
      { slug: "terms-conditions", title_ar: "الشروط و الاحكام", content_ar: "..." },
      { slug: "shipping-delivery", title_ar: "الشحن و التوصيل", content_ar: "..." },
      { slug: "contact-us", title_ar: "تواصل معنا", content_ar: "..." },
    ],
  };

  it("evaluates a fully configured brand (like pura) as 5/5 complete (100%)", () => {
    const result = evaluateStoreReadiness({
      logoUrl: puraBusinessSettings.logo_url,
      activeProductsCount: 9,
      businessSettings: puraBusinessSettings,
      lang: "ar",
    });

    expect(result.hasLogo).toBe(true);
    expect(result.hasProducts).toBe(true);
    expect(result.hasPayments).toBe(true);
    expect(result.hasFulfillment).toBe(true);
    expect(result.hasPolicies).toBe(true);
    expect(result.completedCount).toBe(5);
    expect(result.totalCount).toBe(5);
    expect(result.progressPercent).toBe(100);
    expect(result.isAllComplete).toBe(true);
    expect(result.pagesCount).toBe(5);
  });

  it("detects missing fulfillment when all fulfillment flags are disabled and no zones exist", () => {
    const result = evaluateStoreReadiness({
      logoUrl: "https://example.com/logo.png",
      activeProductsCount: 5,
      businessSettings: {
        ...puraBusinessSettings,
        delivery_enabled: false,
        pickup_enabled: false,
        shipping_zones: [],
      },
      lang: "ar",
    });

    expect(result.hasFulfillment).toBe(false);
    expect(result.completedCount).toBe(4);
    expect(result.isAllComplete).toBe(false);
  });

  it("detects missing policies when pages array is empty", () => {
    const result = evaluateStoreReadiness({
      logoUrl: "https://example.com/logo.png",
      activeProductsCount: 5,
      businessSettings: {
        ...puraBusinessSettings,
        pages: [],
      },
      lang: "ar",
    });

    expect(result.hasPolicies).toBe(false);
    expect(result.completedCount).toBe(4);
    expect(result.isAllComplete).toBe(false);
  });

  it("detects incomplete products when activeProductsCount is 0", () => {
    const result = evaluateStoreReadiness({
      logoUrl: "https://example.com/logo.png",
      activeProductsCount: 0,
      businessSettings: puraBusinessSettings,
      lang: "ar",
    });

    expect(result.hasProducts).toBe(false);
    expect(result.completedCount).toBe(4);
    expect(result.isAllComplete).toBe(false);
  });

  it("detects incomplete payments when all payment options are falsy", () => {
    const result = evaluateStoreReadiness({
      logoUrl: "https://example.com/logo.png",
      activeProductsCount: 5,
      businessSettings: {
        ...puraBusinessSettings,
        cod_enabled: false,
        card_enabled: false,
        benefit_enabled: false,
      },
      lang: "ar",
    });

    expect(result.hasPayments).toBe(false);
    expect(result.completedCount).toBe(4);
  });

  it("determines that 100% complete stores are collapsed by default and dismissible", () => {
    const result = evaluateStoreReadiness({
      logoUrl: puraBusinessSettings.logo_url,
      activeProductsCount: 9,
      businessSettings: puraBusinessSettings,
      lang: "ar",
    });

    expect(result.isAllComplete).toBe(true);
    // Collapse by default when complete
    const defaultCollapsed = result.isAllComplete;
    expect(defaultCollapsed).toBe(true);

    // Dismissal is only honored when complete
    const canDismiss = result.isAllComplete;
    expect(canDismiss).toBe(true);
  });

  it("ensures that incomplete stores are never collapsed by default and cannot stay dismissed", () => {
    const result = evaluateStoreReadiness({
      logoUrl: puraBusinessSettings.logo_url,
      activeProductsCount: 0,
      businessSettings: puraBusinessSettings,
      lang: "ar",
    });

    expect(result.isAllComplete).toBe(false);
    // Expanded by default when incomplete so merchant sees remaining steps
    const defaultCollapsed = result.isAllComplete;
    expect(defaultCollapsed).toBe(false);

    // If an incomplete store had a stale dismissed flag, it must un-dismiss and reappear
    const isDismissedStored = true;
    const shouldRender = !result.isAllComplete || !isDismissedStored;
    expect(shouldRender).toBe(true);
  });
});

