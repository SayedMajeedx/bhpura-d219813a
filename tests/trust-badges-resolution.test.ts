import { describe, it, expect } from "vitest";
import {
  getDynamicTrustBadges,
  resolveStorefrontTrustBadges,
  storeFactBadges,
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
      settings: {},
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
      settings: {},
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
      settings: {},
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
      settings: {},
    });

    expect(result).toHaveLength(2);
    expect(result.map((b) => b.id)).toEqual(["badge-1", "badge-3"]);
  });

  it("before the merchant saves badges, says only what the settings say", () => {
    // The fallback once promised "100% authentic", "fast delivery to the door" to a store that
    // does not deliver, cash on delivery when the switch was never set, and "256-bit SSL".
    const shown = resolveStorefrontTrustBadges({
      config: null,
      settings: { card_enabled: true, cod_enabled: true, pickup_enabled: true },
    });
    expect(shown.map((b) => b.text_ar)).toEqual([
      "الدفع بالبطاقة أو عند الاستلام",
      "استلام من المتجر",
    ]);
    expect(shown.map((b) => b.text_en)).toEqual([
      "Pay by card or cash on delivery",
      "Store pickup",
    ]);
    const all = JSON.stringify(shown);
    expect(all).not.toMatch(/256|أصلي|Authentic|سريع|Fast/);
  });

  it("says nothing when no setting says anything", () => {
    expect(resolveStorefrontTrustBadges({ config: undefined, settings: {} })).toEqual([]);
    expect(resolveStorefrontTrustBadges({ config: null, settings: null })).toEqual([]);
  });
});

describe("storeFactBadges", () => {
  it("names every payment method that is on, and free delivery when the fee is zero", () => {
    const badges = storeFactBadges({
      card_enabled: true,
      benefit_enabled: true,
      cod_enabled: true,
      delivery_enabled: true,
      delivery_fee: 0,
      digital_delivery_enabled: true,
    });
    expect(badges.map((b) => b.text_ar)).toEqual([
      "الدفع بالبطاقة أو عبر بنفت باي أو عند الاستلام",
      "توصيل مجاني",
      "تسليم رقمي بعد الدفع",
    ]);
    expect(badges[0].text_en).toBe("Pay by card, BenefitPay or cash on delivery");
  });

  it("says delivery only for a store that delivers", () => {
    expect(storeFactBadges({ delivery_enabled: true, delivery_fee: 2 })[0].text_ar).toBe(
      "توصيل إلى بابك",
    );
    expect(storeFactBadges({ delivery_enabled: false })).toEqual([]);
    expect(
      storeFactBadges({ delivery_enabled: true, pickup_enabled: true, delivery_fee: 1 })[0].text_en,
    ).toBe("Delivery or store pickup");
  });

  it("the editor's starting set adds the kind of store's line to the facts", () => {
    const set = getDynamicTrustBadges({ vertical: "food", settings: { cod_enabled: true } });
    expect(set.items.map((b) => b.text_en)).toEqual([
      "Freshly Prepared Daily",
      "Pay by cash on delivery",
    ]);
  });
});
