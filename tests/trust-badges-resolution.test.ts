import { describe, it, expect } from "vitest";
import {
  resolveStorefrontTrustBadges,
  type TrustBadgesConfig,
} from "../src/lib/trust-badges";

describe("resolveStorefrontTrustBadges", () => {
  it("returns customized badges when merchant configures them in admin", () => {
    const customConfig: TrustBadgesConfig = {
      enabled: true,
      items: [
        {
          id: "custom-1",
          icon: "Award",
          text_ar: "جودة مضمونة وتجربة موثوقة",
          text_en: "Guaranteed Quality & Trusted Service",
          color: "amber",
          enabled: true,
        },
        {
          id: "custom-2",
          icon: "Truck",
          text_ar: "توصيل سريع بنفس اليوم",
          text_en: "Same Day Fast Delivery",
          color: "purple",
          enabled: true,
        },
      ],
    };

    const result = resolveStorefrontTrustBadges({
      config: customConfig,
      vertical: "food",
      settings: {},
      brandName: "بقلاوة حبيبي",
    });

    expect(result).toHaveLength(2);
    expect(result[0].text_ar).toBe("جودة مضمونة وتجربة موثوقة");
    expect(result[0].icon).toBe("Award");
    expect(result[1].text_en).toBe("Same Day Fast Delivery");
  });

  it("returns an empty array when merchant removes all badges (items: [])", () => {
    const emptyConfig: TrustBadgesConfig = {
      enabled: true,
      items: [],
    };

    const result = resolveStorefrontTrustBadges({
      config: emptyConfig,
      vertical: "food",
      settings: {},
      brandName: "بقلاوة حبيبي",
    });

    expect(result).toEqual([]);
  });

  it("returns an empty array when merchant turns off the global badges toggle (enabled: false)", () => {
    const disabledConfig: TrustBadgesConfig = {
      enabled: false,
      items: [
        {
          id: "custom-1",
          icon: "Award",
          text_ar: "جودة مضمونة",
          text_en: "Guaranteed Quality",
          color: "amber",
          enabled: true,
        },
      ],
    };

    const result = resolveStorefrontTrustBadges({
      config: disabledConfig,
      vertical: "general",
      settings: {},
      brandName: "My Store",
    });

    expect(result).toEqual([]);
  });

  it("filters out individual disabled badges while keeping enabled ones", () => {
    const mixedConfig: TrustBadgesConfig = {
      enabled: true,
      items: [
        {
          id: "badge-1",
          icon: "ShieldCheck",
          text_ar: "آمن ومحمي",
          text_en: "Safe & Protected",
          color: "sky",
          enabled: true,
        },
        {
          id: "badge-2",
          icon: "RotateCcw",
          text_ar: "استرجاع مجاني",
          text_en: "Free Returns",
          color: "emerald",
          enabled: false,
        },
        {
          id: "badge-3",
          icon: "Truck",
          text_ar: "شحن سريع",
          text_en: "Fast Shipping",
          color: "purple",
          enabled: true,
        },
      ],
    };

    const result = resolveStorefrontTrustBadges({
      config: mixedConfig,
      vertical: "fashion",
      settings: {},
    });

    expect(result).toHaveLength(2);
    expect(result.map((b) => b.id)).toEqual(["badge-1", "badge-3"]);
  });

  it("falls back to smart niche defaults only when config is null or undefined", () => {
    const foodDefaults = resolveStorefrontTrustBadges({
      config: null,
      vertical: "food",
      settings: {},
      brandName: "Sweet Corner",
    });

    expect(foodDefaults.length).toBeGreaterThan(0);
    // Food vertical default includes "Freshly Prepared Daily"
    expect(foodDefaults.some((b) => b.text_en.includes("Freshly Prepared"))).toBe(true);

    const abayasDefaults = resolveStorefrontTrustBadges({
      config: undefined,
      vertical: "abayas",
      settings: {},
      brandName: "Abaya Chic",
    });

    expect(abayasDefaults.length).toBeGreaterThan(0);
    // Abayas vertical default includes tailoring / fabric
    expect(abayasDefaults.some((b) => b.text_ar.includes("تفصيل") || b.text_ar.includes("أقمشة"))).toBe(true);
  });
});
